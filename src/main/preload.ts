const { contextBridge, ipcRenderer } = require('electron');

// IPC channel names - inlined to avoid import issues in sandboxed preload
const IPC = {
  SEARCH_START: 'search:start',
  SEARCH_RESULT: 'search:result',
  SEARCH_STATUS: 'search:status',
  SEARCH_COMPLETE: 'search:complete',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  LOG_PATH_GET: 'log:path',
};

contextBridge.exposeInMainWorld('api', {
  search: {
    start: (theme: string, minResults?: number) => ipcRenderer.send(IPC.SEARCH_START, { theme, minResults: minResults ?? 30 }),
    onResult: (cb: (result: any) => void) => {
      const listener = (_event: any, result: any) => cb(result);
      ipcRenderer.on(IPC.SEARCH_RESULT, listener);
      return () => ipcRenderer.removeListener(IPC.SEARCH_RESULT, listener);
    },
    onStatus: (cb: (status: any) => void) => {
      const listener = (_event: any, status: any) => cb(status);
      ipcRenderer.on(IPC.SEARCH_STATUS, listener);
      return () => ipcRenderer.removeListener(IPC.SEARCH_STATUS, listener);
    },
    onComplete: (cb: (session: any) => void) => {
      const listener = (_event: any, session: any) => cb(session);
      ipcRenderer.on(IPC.SEARCH_COMPLETE, listener);
      return () => ipcRenderer.removeListener(IPC.SEARCH_COMPLETE, listener);
    },
  },
  settings: {
    get: (): Promise<any> => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (s: any): Promise<any> => ipcRenderer.invoke(IPC.SETTINGS_SET, s),
  },
  log: {
    getPath: (): Promise<string | null> => ipcRenderer.invoke(IPC.LOG_PATH_GET),
  },
});
