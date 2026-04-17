import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { IPC } from '../shared/types';
import { SearchOrchestrator } from './services/orchestrator';
import { SettingsStore } from './services/settings';
import { Logger } from './services/logger';
import { LyricsCache } from './services/lyrics-cache';

const log = new Logger('Main');
let mainWindow: BrowserWindow | null = null;
const settings = new SettingsStore();
// Lazy-initialize on first use — avoid opening SQLite until the feature is
// actually exercised (keeps cold-start fast).
let lyricsCacheInstance: LyricsCache | null = null;
function getLyricsCache(): LyricsCache {
  if (!lyricsCacheInstance) lyricsCacheInstance = new LyricsCache();
  return lyricsCacheInstance;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    title: 'AI Creator - Song Finder',
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  log.info('App starting...');
  log.info(`Log file: ${Logger.getLogFilePath()}`);

  createWindow();

  // IPC: Search
  ipcMain.on(IPC.SEARCH_START, async (event, payload: { theme: string; minResults: number }) => {
    const { theme, minResults } = payload;
    log.info(`Search started: "${theme}", minResults: ${minResults}`);
    const appSettings = settings.get();
    appSettings.maxResultsPerSearch = minResults;
    const orchestrator = new SearchOrchestrator(appSettings);

    orchestrator.on('result', (result) => {
      try {
        event.sender.send(IPC.SEARCH_RESULT, result);
      } catch (err: any) {
        log.error('Failed to send result to renderer:', err);
      }
    });

    orchestrator.on('status', (status) => {
      try {
        event.sender.send(IPC.SEARCH_STATUS, status);
      } catch (err: any) {
        log.error('Failed to send status to renderer:', err);
      }
    });

    orchestrator.on('complete', (session) => {
      try {
        event.sender.send(IPC.SEARCH_COMPLETE, session);
      } catch (err: any) {
        log.error('Failed to send complete to renderer:', err);
      }
    });

    try {
      await orchestrator.search(theme);
    } catch (err: any) {
      log.error(`Search pipeline crashed for "${theme}":`, err);
      // Send error to renderer so UI doesn't hang
      try {
        event.sender.send(IPC.SEARCH_STATUS, {
          status: 'done',
          message: `Loi: ${err.message}`,
        });
        event.sender.send(IPC.SEARCH_COMPLETE, {
          theme,
          results: [],
          status: 'done',
          stats: {
            totalCandidates: 0,
            vcpmcVerified: 0,
            vcpmcNotFound: 0,
            vcpmcPending: 0,
            elapsedMs: 0,
            sources: [],
          },
        });
      } catch {
        // renderer already gone
      }
    }
  });

  // IPC: Settings
  ipcMain.handle(IPC.SETTINGS_GET, () => {
    return settings.get();
  });

  ipcMain.handle(IPC.SETTINGS_SET, (_event, newSettings) => {
    settings.set(newSettings);
    return settings.get();
  });

  // IPC: Log file path
  ipcMain.handle(IPC.LOG_PATH_GET, () => {
    return Logger.getLogFilePath();
  });

  // IPC: Lyrics fetch — lazy, on-demand from renderer
  ipcMain.handle(IPC.LYRICS_FETCH, async (_event, payload: { title: string; artist: string }) => {
    const { title, artist } = payload ?? {};
    if (!title || !artist) {
      return { status: 'error', source: 'lrclib', error: 'Missing title or artist' };
    }
    try {
      return await getLyricsCache().fetch(title, artist);
    } catch (err: any) {
      log.error(`Lyrics fetch error for "${title}" / "${artist}":`, err);
      return { status: 'error', source: 'lrclib', error: err.message ?? 'Unknown error' };
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Catch uncaught errors
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});
