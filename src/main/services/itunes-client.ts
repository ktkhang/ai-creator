import axios from 'axios';
import { LruCache } from './cache';
import { Logger } from './logger';

export interface ItunesTrackInfo {
  genre: string;          // e.g. "Pop", "World", "Traditional", "Vietnamese Pop"
  releaseYear?: number;
  artistName?: string;
  trackName?: string;
  country?: string;
}

/**
 * iTunes Search API - completely free, no API key required.
 * Docs: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/
 *
 * Used to enrich VCPMC records with genre/year metadata for better relevance scoring.
 */
export class ItunesClient {
  private readonly baseUrl = 'https://itunes.apple.com/search';
  private readonly cache: LruCache<ItunesTrackInfo | null>;
  private readonly log = new Logger('iTunes');

  constructor() {
    // Cache 500 entries for 4 hours
    this.cache = new LruCache<ItunesTrackInfo | null>(500, 4 * 60 * 60 * 1000);
  }

  /**
   * Look up a song by title + artist and return genre/year metadata.
   * Returns null if not found (very common for lesser-known Vietnamese songs).
   */
  async lookup(title: string, artist: string): Promise<ItunesTrackInfo | null> {
    const cacheKey = `${this.normalize(title)}::${this.normalize(artist)}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const result = await this.search(title, artist);
    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Batch lookup for multiple songs. Returns a map keyed by "title::artist".
   * Runs concurrently with a small concurrency limit to avoid rate-limiting.
   */
  async batchLookup(
    songs: Array<{ title: string; artist: string }>,
    concurrency = 8
  ): Promise<Map<string, ItunesTrackInfo | null>> {
    const results = new Map<string, ItunesTrackInfo | null>();

    for (let i = 0; i < songs.length; i += concurrency) {
      const chunk = songs.slice(i, i + concurrency);
      const resolved = await Promise.all(
        chunk.map((s) => this.lookup(s.title, s.artist))
      );
      chunk.forEach((s, idx) => {
        results.set(`${this.normalize(s.title)}::${this.normalize(s.artist)}`, resolved[idx]);
      });
    }

    return results;
  }

  private async search(title: string, artist: string): Promise<ItunesTrackInfo | null> {
    try {
      const query = `${title} ${artist}`;
      const params = { term: query, media: 'music', entity: 'song', limit: 5 };

      // Query VN and US stores in parallel
      const [vnRes, usRes] = await Promise.allSettled([
        axios.get(this.baseUrl, { params: { ...params, country: 'VN', lang: 'vi_vn' }, timeout: 5000 }),
        axios.get(this.baseUrl, { params: { ...params, country: 'US' }, timeout: 5000 }),
      ]);

      const vnResults = vnRes.status === 'fulfilled' ? (vnRes.value.data.results ?? []) : [];
      const usResults = usRes.status === 'fulfilled' ? (usRes.value.data.results ?? []) : [];

      // Prefer VN store, fall back to US
      return this.findBestMatch(vnResults, title, artist)
        ?? this.findBestMatch(usResults, title, artist);
    } catch (err: any) {
      this.log.debug(`Lookup failed for "${title}" by "${artist}": ${err.message}`);
      return null;
    }
  }

  private findBestMatch(results: any[], title: string, artist: string): ItunesTrackInfo | null {
    if (!Array.isArray(results) || results.length === 0) return null;

    const normTitle = this.normalize(title);
    const normArtist = this.normalize(artist);

    // Score each result
    let best: any = null;
    let bestScore = 0;

    for (const r of results) {
      if (r.kind !== 'song' && r.wrapperType !== 'track') continue;
      const rTitle = this.normalize(r.trackName ?? '');
      const rArtist = this.normalize(r.artistName ?? '');

      let score = 0;
      if (rTitle === normTitle) score += 3;
      else if (rTitle.includes(normTitle) || normTitle.includes(rTitle)) score += 1;
      if (rArtist === normArtist) score += 2;
      else if (rArtist.includes(normArtist) || normArtist.includes(rArtist)) score += 1;

      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }

    if (!best || bestScore < 1) return null;

    const year = best.releaseDate
      ? parseInt(best.releaseDate.substring(0, 4), 10)
      : undefined;

    return {
      genre: best.primaryGenreName ?? '',
      releaseYear: isNaN(year!) ? undefined : year,
      artistName: best.artistName,
      trackName: best.trackName,
      country: best.country,
    };
  }

  private normalize(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
