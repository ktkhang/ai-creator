import axios, { AxiosInstance } from 'axios';
import { Logger } from './logger';
import { withRetry, isRetryableHttpError } from './retry';

/**
 * Raw record returned by LRCLIB /api/search or /api/get.
 * See https://lrclib.net/docs for details.
 */
export interface LrclibRecord {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName?: string | null;
  duration?: number | null;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

/**
 * Thin wrapper around the LRCLIB public API (https://lrclib.net).
 *
 * Design notes:
 * - No auth required; LRCLIB is free and open-source.
 * - We self-throttle to ~1 req/sec to stay a well-behaved citizen even
 *   though LRCLIB does not publish a hard rate limit.
 * - Retries are bounded (2 attempts) and only fire on retriable HTTP errors.
 * - All requests advertise the app in User-Agent so the service can reach
 *   out if we ever misbehave — that is LRCLIB's documented preference.
 */
export class LrclibClient {
  private readonly http: AxiosInstance;
  private readonly log = new Logger('LrclibClient');
  private readonly minIntervalMs = 1000;
  private lastCallAt = 0;

  constructor() {
    this.http = axios.create({
      baseURL: 'https://lrclib.net/api',
      timeout: 10_000,
      headers: {
        'User-Agent': 'AICreator/1.0 (https://github.com/; electron-app)',
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Exact lookup — use when we know the authoritative title + artist.
   * Returns null if LRCLIB returns 404.
   */
  async get(params: {
    trackName: string;
    artistName: string;
    albumName?: string;
    duration?: number;
  }): Promise<LrclibRecord | null> {
    await this.throttle();
    const query: Record<string, string> = {
      track_name: params.trackName,
      artist_name: params.artistName,
    };
    if (params.albumName) query.album_name = params.albumName;
    if (params.duration) query.duration = String(Math.round(params.duration));

    return withRetry(
      async () => {
        try {
          const { data } = await this.http.get<LrclibRecord>('/get', { params: query });
          return data ?? null;
        } catch (err: any) {
          if (err.response?.status === 404) return null;
          throw err;
        }
      },
      { maxRetries: 2, baseDelayMs: 800, maxDelayMs: 3000, retryIf: isRetryableHttpError },
    );
  }

  /**
   * Fuzzy search — use when we only have approximate title/artist strings.
   * LRCLIB returns up to 20 candidates ranked by its own scoring.
   * We return raw list; caller picks the best match.
   */
  async search(params: { trackName: string; artistName?: string }): Promise<LrclibRecord[]> {
    await this.throttle();
    const query: Record<string, string> = { track_name: params.trackName };
    if (params.artistName) query.artist_name = params.artistName;

    return withRetry(
      async () => {
        const { data } = await this.http.get<LrclibRecord[]>('/search', { params: query });
        return Array.isArray(data) ? data : [];
      },
      { maxRetries: 2, baseDelayMs: 800, maxDelayMs: 3000, retryIf: isRetryableHttpError },
    ).catch((err: any) => {
      this.log.warn(`search(${params.trackName}) failed: ${err.message}`);
      return [];
    });
  }

  /** Global 1 req/sec self-throttle (kind to LRCLIB's infra). */
  private async throttle(): Promise<void> {
    const wait = this.lastCallAt + this.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCallAt = Date.now();
  }
}
