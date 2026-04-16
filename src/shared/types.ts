/** Shared types between main and renderer processes */

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
  genre?: string;       // from iTunes
  releaseYear?: number; // from iTunes
  vcpmcStatus: 'pending' | 'verified' | 'not-found';
  vcpmcLink?: string;
  vcpmcRecord?: VcpmcRecord;
  sources: string[];
  score: number;
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
} as const;

export interface AppSettings {
  claudeApiKey: string;
  maxResultsPerSearch: number;
  vcpmcRequestDelayMs: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  claudeApiKey: '',
  maxResultsPerSearch: 30,
  vcpmcRequestDelayMs: 300,
};
