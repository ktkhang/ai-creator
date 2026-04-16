import * as fs from 'fs';
import * as path from 'path';

/**
 * Structured logger for the main process.
 * - Outputs to console with color-coded levels
 * - Also writes to a rotating log file for post-mortem debugging
 *
 * Log file location: <userData>/logs/ai-creator.log
 * In dev mode: ./logs/ai-creator.log
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const RESET = '\x1b[0m';

let logFileStream: fs.WriteStream | null = null;
let logFilePath: string | null = null;

function ensureLogStream(): fs.WriteStream | null {
  if (logFileStream) return logFileStream;

  try {
    // Try electron userData path first, fallback to cwd
    let logDir: string;
    try {
      const { app } = require('electron');
      logDir = path.join(app.getPath('userData'), 'logs');
    } catch {
      logDir = path.join(process.cwd(), 'logs');
    }

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    logFilePath = path.join(logDir, 'ai-creator.log');

    // Rotate if file > 5MB
    try {
      const stat = fs.statSync(logFilePath);
      if (stat.size > 5 * 1024 * 1024) {
        const rotated = logFilePath + '.old';
        if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
        fs.renameSync(logFilePath, rotated);
      }
    } catch {
      // file doesn't exist yet, fine
    }

    logFileStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    // Write session separator
    const sep = `\n${'='.repeat(60)}\n[SESSION START] ${new Date().toISOString()}\n${'='.repeat(60)}\n`;
    logFileStream.write(sep);

    return logFileStream;
  } catch {
    return null;
  }
}

export class Logger {
  private context: string;
  private static minLevel: LogLevel = 'debug';

  private static readonly LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(context: string) {
    this.context = context;
  }

  static setMinLevel(level: LogLevel): void {
    Logger.minLevel = level;
  }

  /** Get the path to the current log file */
  static getLogFilePath(): string | null {
    ensureLogStream();
    return logFilePath;
  }

  debug(message: string, data?: any): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: any): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: any): void {
    this.log('error', message, data);
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (Logger.LEVELS[level] < Logger.LEVELS[Logger.minLevel]) return;

    const now = new Date();
    const timestamp = now.toISOString().substring(11, 23); // HH:mm:ss.SSS
    const color = LOG_COLORS[level];
    const levelTag = level.toUpperCase().padEnd(5);
    const prefix = `${color}[${timestamp}] [${levelTag}] [${this.context}]${RESET}`;

    // Format data
    let dataStr = '';
    if (data !== undefined) {
      if (data instanceof Error) {
        dataStr = ` ${data.message}\n${data.stack ?? ''}`;
      } else if (typeof data === 'object') {
        try {
          dataStr = ' ' + JSON.stringify(data);
        } catch {
          dataStr = ' [unserializable]';
        }
      } else {
        dataStr = ' ' + String(data);
      }
    }

    // Console output
    console.log(`${prefix} ${message}${dataStr}`);

    // File output (no ANSI colors)
    const stream = ensureLogStream();
    if (stream) {
      const fileLine = `[${now.toISOString()}] [${levelTag}] [${this.context}] ${message}${dataStr}\n`;
      stream.write(fileLine);
    }
  }
}
