import axios from 'axios';
import { SongCandidate } from '../../shared/types';
import { withRetry, isRetryableHttpError } from './retry';
import { Logger } from './logger';

/**
 * Last.fm API integration for searching songs.
 * Free tier: no rate limit documented, generous for search.
 * API docs: https://www.last.fm/api
 *
 * Flow:
 * 1. Search tracks by keyword
 * 2. Optionally search by tag (genre/mood)
 * 3. Parse track name + artist
 */
export class LastfmClient {
  private readonly baseUrl = 'https://ws.audioscrobbler.com/2.0/';
  private readonly apiKey: string;
  private readonly maxResultsPerQuery = 20;
  private readonly maxQueries = 5;
  private readonly log = new Logger('Lastfm');

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Search Last.fm for tracks matching given keywords.
   */
  async searchByKeywords(keywords: string[], themeRaw: string): Promise<SongCandidate[]> {
    const allCandidates: SongCandidate[] = [];
    const seen = new Set<string>();

    // Query strategy: raw theme first, then individual keywords
    const queries = [themeRaw, ...keywords.slice(0, this.maxQueries - 1)];

    for (const query of queries) {
      try {
        const results = await withRetry(() => this.searchTracks(query), {
          maxRetries: 1,
          retryIf: isRetryableHttpError,
        });
        this.log.info(`"${query}" -> ${results.length} tracks`);
        for (const r of results) {
          if (!r.title || !r.author) continue;
          const key = `${r.title.toLowerCase()}::${r.author.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            allCandidates.push(r);
          }
        }
      } catch (err: any) {
        this.log.warn(`Search failed for "${query}": ${err.message}`);
      }
    }

    return allCandidates;
  }

  /**
   * Search tracks via Last.fm track.search method.
   */
  private async searchTracks(query: string): Promise<SongCandidate[]> {
    const response = await axios.get(this.baseUrl, {
      params: {
        method: 'track.search',
        track: query,
        api_key: this.apiKey,
        format: 'json',
        limit: this.maxResultsPerQuery,
      },
      timeout: 8000,
    });

    const tracks: any[] = response.data?.results?.trackmatches?.track ?? [];
    const candidates: SongCandidate[] = [];

    for (const track of tracks) {
      if (!track || typeof track !== 'object') continue;

      const name = typeof track.name === 'string' ? track.name.trim() : '';
      const artist = typeof track.artist === 'string' ? track.artist.trim() : '';

      if (!name || !artist) continue;

      candidates.push({
        title: name,
        author: artist,
        source: 'lastfm',
      });
    }

    return candidates;
  }

  /**
   * Search by tag (mood/genre) to find related tracks.
   */
  async searchByTag(tag: string): Promise<SongCandidate[]> {
    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          method: 'tag.gettoptracks',
          tag,
          api_key: this.apiKey,
          format: 'json',
          limit: 15,
        },
        timeout: 8000,
      });

      const tracks: any[] = response.data?.tracks?.track ?? [];
      const candidates: SongCandidate[] = [];

      for (const track of tracks) {
        if (!track || typeof track !== 'object') continue;
        const name = typeof track.name === 'string' ? track.name.trim() : '';
        const artist = typeof track.artist?.name === 'string' ? track.artist.name.trim() :
          typeof track.artist === 'string' ? track.artist.trim() : '';

        if (!name || !artist) continue;
        candidates.push({ title: name, author: artist, source: 'lastfm' });
      }

      this.log.info(`Tag "${tag}" -> ${candidates.length} tracks`);
      return candidates;
    } catch (err: any) {
      this.log.warn(`Tag search failed for "${tag}": ${err.message}`);
      return [];
    }
  }

  /**
   * Check if API key is configured and valid.
   */
  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      await axios.get(this.baseUrl, {
        params: { method: 'track.search', track: 'test', api_key: this.apiKey, format: 'json', limit: 1 },
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }
}
