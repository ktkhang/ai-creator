import axios from 'axios';
import { SongCandidate } from '../../shared/types';
import { withRetry, isRetryableHttpError } from './retry';
import { Logger } from './logger';

/**
 * Genius API integration for searching songs by lyrics/keywords.
 * Free tier: 150 requests/min.
 * Docs: https://docs.genius.com/
 */
export class GeniusClient {
  private readonly baseUrl = 'https://api.genius.com';
  private readonly apiKey: string;
  private readonly maxResultsPerQuery = 10;
  private readonly maxQueries = 5;
  private readonly log = new Logger('Genius');

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchByKeywords(keywords: string[]): Promise<SongCandidate[]> {
    const allCandidates: SongCandidate[] = [];
    const seen = new Set<string>();

    const queries = keywords.slice(0, this.maxQueries);

    for (const keyword of queries) {
      try {
        const results = await withRetry(() => this.search(keyword), {
          maxRetries: 1,
          retryIf: isRetryableHttpError,
        });
        this.log.info(`"${keyword}" -> ${results.length} results`);
        for (const r of results) {
          if (!r.title || !r.author) continue;
          const key = `${r.title.toLowerCase()}::${r.author.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            allCandidates.push(r);
          }
        }
      } catch (err: any) {
        this.log.warn(`Search failed for "${keyword}": ${err.message}`);
      }
    }

    return allCandidates;
  }

  private async search(query: string): Promise<SongCandidate[]> {
    const response = await axios.get(`${this.baseUrl}/search`, {
      params: { q: query, per_page: this.maxResultsPerQuery },
      headers: { Authorization: `Bearer ${this.apiKey}` },
      timeout: 8000,
    });

    const hits: any[] = response.data?.response?.hits ?? [];
    const candidates: SongCandidate[] = [];

    for (const hit of hits) {
      const title = hit?.result?.title;
      const artist = hit?.result?.primary_artist?.name;

      if (typeof title !== 'string' || !title.trim()) continue;
      if (typeof artist !== 'string' || !artist.trim()) continue;

      candidates.push({
        title: title.trim(),
        author: artist.trim(),
        yearApprox: this.extractYear(hit?.result?.release_date_components),
        source: 'genius',
      });
    }

    return candidates;
  }

  private extractYear(dateComponents: any): number | undefined {
    if (dateComponents?.year && typeof dateComponents.year === 'number') {
      return dateComponents.year;
    }
    return undefined;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      await axios.get(`${this.baseUrl}/search`, {
        params: { q: 'test', per_page: 1 },
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }
}
