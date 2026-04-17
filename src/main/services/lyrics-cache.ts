import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { Logger } from './logger';
import { LrclibClient, LrclibRecord } from './lrclib-client';
import type { LyricsResult } from '../../shared/types';

/**
 * Persistent lyrics store (SQLite) with on-demand LRCLIB fetch.
 *
 * Schema:
 *   lyrics_cache(key PRIMARY KEY, status, track_name, artist_name, album_name,
 *                duration, plain_lyrics, synced_lyrics, fetched_at)
 *
 *   `key` = sha-free normalized `title::artist` — derived locally, cheap to
 *   compute, good enough for dedup at the cache layer.
 *
 *   Negative results (not-found / instrumental) are ALSO cached so we don't
 *   hammer LRCLIB every time the user opens a miss.
 *
 * TTL rules:
 *   - Positive hits:   never expire (lyrics rarely change).
 *   - Not-found/error: 14 days — LRCLIB keeps adding tracks, retry periodically.
 *   - Instrumental:    never expire.
 *
 * Concurrency:
 *   better-sqlite3 is synchronous and process-local; no lock contention from
 *   renderer since all access goes through the main process.
 */
export class LyricsCache {
  private readonly db: Database.Database;
  private readonly log = new Logger('LyricsCache');
  private readonly client: LrclibClient;
  /** Coalesce concurrent requests for the same song. */
  private readonly inflight = new Map<string, Promise<LyricsResult>>();

  private static readonly TTL_NEGATIVE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

  constructor(client?: LrclibClient) {
    this.client = client ?? new LrclibClient();

    const userDataPath = app?.getPath?.('userData') ?? path.join(process.cwd(), '.config');
    if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
    const dbPath = path.join(userDataPath, 'lyrics.db');

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.migrate();

    this.log.info(`Opened SQLite at ${dbPath}`);
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lyrics_cache (
        key            TEXT PRIMARY KEY,
        status         TEXT NOT NULL,
        track_name     TEXT,
        artist_name    TEXT,
        album_name     TEXT,
        duration       REAL,
        plain_lyrics   TEXT,
        synced_lyrics  TEXT,
        fetched_at     INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_lyrics_fetched_at
        ON lyrics_cache(fetched_at);
    `);
  }

  /**
   * Look up lyrics for a (title, artist) pair. On cache miss, fetch from LRCLIB
   * and persist the result (including negative cases).
   */
  async fetch(title: string, artist: string): Promise<LyricsResult> {
    const key = this.makeKey(title, artist);

    // Coalesce — if another caller is already fetching this song, reuse promise.
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = this.fetchInternal(key, title, artist)
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  private async fetchInternal(key: string, title: string, artist: string): Promise<LyricsResult> {
    // ── 1) Cache hit? ──
    const cached = this.readCache(key);
    if (cached && !this.isStale(cached)) {
      return { ...cached, source: 'cache' };
    }

    // ── 2) Call LRCLIB ──
    let record: LrclibRecord | null = null;
    try {
      // Fast path: exact /get — low false-positive rate on popular tracks.
      record = await this.client.get({ trackName: title, artistName: artist });

      // Fallback: /search — returns multiple candidates, pick the best-scoring one.
      if (!record) {
        const candidates = await this.client.search({ trackName: title, artistName: artist });
        record = this.pickBestCandidate(candidates, title, artist);
      }
    } catch (err: any) {
      this.log.error(`LRCLIB fetch failed for "${title}" / "${artist}": ${err.message}`);
      // Don't cache transient errors aggressively — short negative TTL applied via fetchedAt.
      return { status: 'error', source: 'lrclib', error: err.message, fetchedAt: Date.now() };
    }

    // ── 3) Build result + write cache ──
    const now = Date.now();
    let result: LyricsResult;

    if (!record) {
      result = { status: 'not-found', source: 'lrclib', fetchedAt: now };
    } else if (record.instrumental) {
      result = {
        status: 'instrumental',
        source: 'lrclib',
        trackName: record.trackName,
        artistName: record.artistName,
        albumName: record.albumName ?? undefined,
        duration: record.duration ?? undefined,
        fetchedAt: now,
      };
    } else if (record.plainLyrics || record.syncedLyrics) {
      result = {
        status: 'ok',
        source: 'lrclib',
        trackName: record.trackName,
        artistName: record.artistName,
        albumName: record.albumName ?? undefined,
        duration: record.duration ?? undefined,
        plainLyrics: record.plainLyrics ?? undefined,
        syncedLyrics: record.syncedLyrics ?? undefined,
        fetchedAt: now,
      };
    } else {
      result = { status: 'not-found', source: 'lrclib', fetchedAt: now };
    }

    this.writeCache(key, result);
    return result;
  }

  /** Rank candidate list by title+artist similarity, return the top match ≥ 0.55. */
  private pickBestCandidate(
    candidates: LrclibRecord[],
    title: string,
    artist: string,
  ): LrclibRecord | null {
    if (candidates.length === 0) return null;
    const tn = this.normForMatch(title);
    const an = this.normForMatch(artist);

    let best: LrclibRecord | null = null;
    let bestScore = 0;
    for (const c of candidates) {
      const tScore = this.jaccard(tn, this.normForMatch(c.trackName ?? c.name ?? ''));
      const aScore = this.jaccard(an, this.normForMatch(c.artistName ?? ''));
      // Title weighted higher; artist is often slightly different wording.
      const score = tScore * 0.7 + aScore * 0.3;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return bestScore >= 0.55 ? best : null;
  }

  // ─── Cache persistence ─────────────────────────────────────────

  private readCache(key: string): LyricsResult | null {
    const row = this.db
      .prepare('SELECT status, track_name, artist_name, album_name, duration, plain_lyrics, synced_lyrics, fetched_at FROM lyrics_cache WHERE key = ?')
      .get(key) as any;
    if (!row) return null;
    return {
      status: row.status,
      source: 'cache',
      trackName: row.track_name ?? undefined,
      artistName: row.artist_name ?? undefined,
      albumName: row.album_name ?? undefined,
      duration: row.duration ?? undefined,
      plainLyrics: row.plain_lyrics ?? undefined,
      syncedLyrics: row.synced_lyrics ?? undefined,
      fetchedAt: row.fetched_at,
    };
  }

  private writeCache(key: string, r: LyricsResult): void {
    try {
      this.db
        .prepare(
          `INSERT INTO lyrics_cache (key, status, track_name, artist_name, album_name, duration, plain_lyrics, synced_lyrics, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             status        = excluded.status,
             track_name    = excluded.track_name,
             artist_name   = excluded.artist_name,
             album_name    = excluded.album_name,
             duration      = excluded.duration,
             plain_lyrics  = excluded.plain_lyrics,
             synced_lyrics = excluded.synced_lyrics,
             fetched_at    = excluded.fetched_at`,
        )
        .run(
          key,
          r.status,
          r.trackName ?? null,
          r.artistName ?? null,
          r.albumName ?? null,
          r.duration ?? null,
          r.plainLyrics ?? null,
          r.syncedLyrics ?? null,
          r.fetchedAt ?? Date.now(),
        );
    } catch (err: any) {
      this.log.error(`Cache write failed: ${err.message}`);
    }
  }

  /** Negative entries expire after TTL; positives never expire. */
  private isStale(r: LyricsResult): boolean {
    if (r.status === 'ok' || r.status === 'instrumental') return false;
    if (!r.fetchedAt) return true;
    return Date.now() - r.fetchedAt > LyricsCache.TTL_NEGATIVE_MS;
  }

  /** Return { totalRows, okRows, missRows }. Used for debug / future admin UI. */
  stats(): { total: number; ok: number; instrumental: number; miss: number } {
    const row = this.db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'ok'           THEN 1 ELSE 0 END) AS ok,
          SUM(CASE WHEN status = 'instrumental' THEN 1 ELSE 0 END) AS instrumental,
          SUM(CASE WHEN status IN ('not-found','error') THEN 1 ELSE 0 END) AS miss
        FROM lyrics_cache
      `)
      .get() as any;
    return { total: row.total ?? 0, ok: row.ok ?? 0, instrumental: row.instrumental ?? 0, miss: row.miss ?? 0 };
  }

  // ─── Normalization helpers ─────────────────────────────────────

  private makeKey(title: string, artist: string): string {
    return `${this.normForMatch(title)}::${this.normForMatch(artist)}`;
  }

  private normForMatch(s: string): string {
    return (s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/\(.*?\)|\[.*?\]/g, ' ')            // strip (feat.), [remix], etc.
      .replace(/\s*-\s*feat\.?.*$/i, ' ')           // strip "- feat. xyz"
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private jaccard(a: string, b: string): number {
    if (!a || !b) return 0;
    const setA = new Set(a.split(' ').filter((t) => t.length > 1));
    const setB = new Set(b.split(' ').filter((t) => t.length > 1));
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersect = 0;
    for (const t of setA) if (setB.has(t)) intersect++;
    return intersect / (setA.size + setB.size - intersect);
  }
}
