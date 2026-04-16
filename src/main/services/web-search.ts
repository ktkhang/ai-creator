import axios from 'axios';
import * as cheerio from 'cheerio';
import { SongCandidate } from '../../shared/types';
import { withRetry, isRetryableHttpError } from './retry';
import { Logger } from './logger';

/**
 * Tier 3: Web search fallback.
 * Scrapes Vietnamese lyrics/chord sites via Google to find additional candidates.
 * Only triggered when Tier 1+2 < 25 candidates.
 * Limited to 2 Google searches + 1 hopamchuan fetch.
 */
export class WebSearchService {
  private readonly log = new Logger('WebSearch');
  private readonly targetSites = [
    'hopamchuan.com',
    'nhaccuatui.com',
    'chiasenhac.vn',
  ];

  async search(keywords: string[], theme: string): Promise<SongCandidate[]> {
    const allCandidates: SongCandidate[] = [];
    const seen = new Set<string>();

    const addSafe = (r: SongCandidate) => {
      if (!r.title || !r.author) return;
      const key = `${r.title.toLowerCase()}::${r.author.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        allCandidates.push(r);
      }
    };

    const siteFilter = this.targetSites.map((s) => `site:${s}`).join(' OR ');
    const queries = [
      `bai hat ${theme} ${siteFilter}`,
      `loi bai hat ${keywords.slice(0, 2).join(' ')} ${siteFilter}`,
    ];

    for (const query of queries) {
      try {
        const results = await withRetry(() => this.googleSearch(query), {
          maxRetries: 1,
          retryIf: isRetryableHttpError,
        });
        this.log.info(`Google "${query.substring(0, 40)}..." -> ${results.length} results`);
        for (const r of results) addSafe(r);
      } catch (err: any) {
        this.log.warn(`Google search failed: ${err.message}`);
      }
    }

    if (allCandidates.length < 10) {
      try {
        const hopamResults = await this.scrapeHopAmChuan(keywords);
        for (const r of hopamResults) addSafe(r);
      } catch {
        // ignore
      }
    }

    return allCandidates;
  }

  private async googleSearch(query: string): Promise<SongCandidate[]> {
    const response = await axios.get('https://www.google.com/search', {
      params: { q: query, num: 15, hl: 'vi' },
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
      },
      timeout: 8000,
    });

    const $ = cheerio.load(response.data);
    const candidates: SongCandidate[] = [];

    $('h3').each((_i, el) => {
      const rawTitle = $(el).text().trim();
      if (!rawTitle) return;
      const parsed = this.parseGoogleTitle(rawTitle);
      if (parsed && parsed.title && parsed.author) {
        candidates.push({
          title: parsed.title,
          author: parsed.author,
          source: 'web-search',
        });
      }
    });

    return candidates;
  }

  private parseGoogleTitle(raw: string): { title: string; author: string } | null {
    let cleaned = raw
      .replace(/\s*[\|\-]\s*(hopamchuan\.com|nhaccuatui\.com|chiasenhac\.vn|Nhaccuatui|Hopamchuan).*$/i, '')
      .replace(/^(Lời bài hát|Loi bai hat|Hợp âm|Hop am|Chord)\s*/i, '')
      .trim();

    const dashMatch = cleaned.match(/^(.+?)\s*[-–]\s*(.+)$/);
    if (dashMatch) {
      const title = dashMatch[1]?.trim() ?? '';
      const author = dashMatch[2]?.trim() ?? '';
      if (title.length > 1 && title.length < 80 && author.length > 1 && author.length < 60) {
        return { title, author };
      }
    }

    return null;
  }

  private async scrapeHopAmChuan(keywords: string[]): Promise<SongCandidate[]> {
    const query = keywords.slice(0, 3).join(' ');
    const response = await axios.get('https://hopamchuan.com/search', {
      params: { q: query },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9',
      },
      timeout: 8000,
    });

    const $ = cheerio.load(response.data);
    const candidates: SongCandidate[] = [];

    $('a[href*="/song/"]').each((_i, el) => {
      const title = $(el).text().trim();
      const parent = $(el).closest('.song-item, .media, .card, tr, li, div');
      const author = parent.find('.artist, .author, small, .text-muted').first().text().trim();

      if (title && author && title.length < 80) {
        candidates.push({ title, author, source: 'web-search' });
      }
    });

    if (candidates.length === 0) {
      $('h4 a, h5 a, .song-title a').each((_i, el) => {
        const title = $(el).text().trim();
        const parent = $(el).closest('div, li, tr');
        const author = parent.find('.artist, .author, small').first().text().trim();
        if (title && title.length < 80 && author) {
          candidates.push({ title, author, source: 'web-search' });
        }
      });
    }

    return candidates.slice(0, 15);
  }

  isAvailable(): boolean {
    return true;
  }
}
