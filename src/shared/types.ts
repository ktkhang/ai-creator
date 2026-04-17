/** Shared types between main and renderer processes */

export type AiProvider = 'claude' | 'gemini';

export interface AiModelOption {
  id: string;
  label: string;
}

export const AI_MODELS: Record<AiProvider, AiModelOption[]> = {
  claude: [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-3-5', label: 'Claude Haiku 3.5 (nhanh)' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (nhanh)' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
};

export interface VcpmcRecord {
  title: string;
  musicAuthor: string;
  authorization: string;
  lyricsAuthor: string;
  singer: string;
}

export interface SongResult {
  id: string;
  title: string;
  author: string;
  genre?: string;
  releaseYear?: number;
  vcpmcStatus: 'pending' | 'verified' | 'not-found';
  vcpmcLink?: string;
  vcpmcRecord?: VcpmcRecord;
  sources: string[];
  score: number;
}

export interface ThinkingStep {
  id: string;
  phase: 'criteria' | 'vcpmc' | 'curate' | 'expand';
  message: string;
  detail?: string;
  status: 'running' | 'done' | 'error';
  ts: number;
}

export interface SearchSession {
  theme: string;
  results: SongResult[];
  status: 'idle' | 'searching' | 'checking-vcpmc' | 'done';
  stats: {
    totalCandidates: number;
    vcpmcVerified: number;
    vcpmcNotFound: number;
    vcpmcPending: number;
    elapsedMs: number;
    sources: string[];
  };
}

export const IPC = {
  SEARCH_START: 'search:start',
  SEARCH_RESULT: 'search:result',
  SEARCH_STATUS: 'search:status',
  SEARCH_COMPLETE: 'search:complete',
  LOG_PATH_GET: 'log:path',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  LYRICS_FETCH: 'lyrics:fetch',
} as const;

/**
 * Lyrics record (from LRCLIB or cache).
 * `status` is 'ok' when lyrics found, 'instrumental' for instrumental tracks,
 * 'not-found' when LRCLIB has no match, 'error' on network failures.
 */
export interface LyricsResult {
  status: 'ok' | 'instrumental' | 'not-found' | 'error';
  source: 'lrclib' | 'cache';
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  plainLyrics?: string;
  syncedLyrics?: string;    // LRC format "[mm:ss.xx] line"
  fetchedAt?: number;       // epoch ms
  error?: string;
}

export interface AppSettings {
  aiProvider: AiProvider;
  aiModel: string;
  claudeApiKey: string;
  geminiApiKey: string;
  maxResultsPerSearch: number;
  vcpmcRequestDelayMs: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  aiProvider: 'claude',
  aiModel: 'claude-sonnet-4.6',
  claudeApiKey: '',
  geminiApiKey: '',
  maxResultsPerSearch: 30,
  vcpmcRequestDelayMs: 300,
};
