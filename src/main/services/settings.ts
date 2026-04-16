import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { AppSettings, DEFAULT_SETTINGS } from '../../shared/types';

/**
 * Settings store with layered resolution:
 *   1. settings.json (user-configured via UI) — highest priority
 *   2. Environment variables — fallback
 *   3. DEFAULT_SETTINGS — base defaults
 *
 * Env var mapping:
 *   TROLLLLM_API_KEY  -> claudeApiKey
 *   CLAUDE_API_KEY    -> claudeApiKey (alias)
 */
export class SettingsStore {
  private filePath: string;
  private data: AppSettings;

  constructor() {
    const userDataPath = app?.getPath?.('userData') ?? path.join(process.cwd(), '.config');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    this.filePath = path.join(userDataPath, 'settings.json');

    // Load .env from project root if it exists
    this.loadDotEnv();

    this.data = this.load();
  }

  /** Read .env file from cwd and inject into process.env (does not override existing) */
  private loadDotEnv(): void {
    try {
      const envPath = path.join(process.cwd(), '.env');
      if (!fs.existsSync(envPath)) return;

      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const key = trimmed.substring(0, eqIdx).trim();
        let value = trimmed.substring(eqIdx + 1).trim();
        // Strip quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        // Don't override existing env vars
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    } catch {
      // ignore
    }
  }

  private load(): AppSettings {
    // Start with defaults
    let settings = { ...DEFAULT_SETTINGS };

    // Layer 2: env vars as fallback
    const env = this.readEnv();
    settings = { ...settings, ...env };

    // Layer 1: settings.json overrides everything (if values are non-empty)
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const saved = JSON.parse(raw) as Partial<AppSettings>;
        // Only override with non-empty string values from saved settings
        for (const [key, value] of Object.entries(saved)) {
          if (value !== undefined && value !== null && value !== '') {
            (settings as any)[key] = value;
          }
        }
      }
    } catch {
      // ignore corrupt file
    }

    return settings;
  }

  /** Read API keys from environment variables */
  private readEnv(): Partial<AppSettings> {
    const partial: Partial<AppSettings> = {};
    const key = process.env.TROLLLLM_API_KEY ?? process.env.CLAUDE_API_KEY ?? '';
    if (key) partial.claudeApiKey = key;
    return partial;
  }

  private save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  get(): AppSettings {
    return { ...this.data };
  }

  set(partial: Partial<AppSettings>): void {
    this.data = { ...this.data, ...partial };
    this.save();
  }
}
