import axios from 'axios';
import * as cheerio from 'cheerio';
import { VcpmcRecord } from '../../shared/types';
import { LruCache } from './cache';
import { withRetry, isRetryableHttpError } from './retry';
import { Logger } from './logger';

/**
 * Scrapes VCPMC website to verify song copyright registration.
 *
 * URL patterns:
 * - Page 1: https://www.vcpmc.org/tim-kiem/{keyword}/{type}.html
 * - Page N: https://www.vcpmc.org/tim-kiem/{keyword}/{type}-page{N}.html
 *
 * Encoding: spaces become %2520 (double-encoded %20)
 *
 * Features:
 * - LRU cache (200 entries, 1h TTL) to avoid re-scraping same author
 * - Retry with exponential backoff on 5xx / network errors
 * - Structured logging
 */
export class VcpmcScraper {
  private readonly baseUrl = 'https://www.vcpmc.org/tim-kiem';
  private readonly delayMs: number;
  private readonly maxPages = 5;
  private readonly cache: LruCache<VcpmcRecord[]>;
  private readonly log = new Logger('VcpmcScraper');

  constructor(delayMs = 600) {
    this.delayMs = delayMs;
    this.cache = new LruCache<VcpmcRecord[]>(200, 60 * 60 * 1000);
  }

  /** Encode keyword for VCPMC URL (double-encode spaces) */
  encodeKeyword(keyword: string): string {
    return (keyword ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '%2520');
  }

  /** Build a VCPMC search URL */
  buildSearchUrl(keyword: string, type?: 'author' | 'title', page?: number): string {
    const encoded = this.encodeKeyword(keyword);
    // VCPMC only supports author.html for both author and title searches
    if (!page || page === 1) {
      return `${this.baseUrl}/${encoded}/author.html`;
    }
    return `${this.baseUrl}/${encoded}/author-page${page}.html`;
  }

  /** Search VCPMC by author, fetching all pages. Results are cached. */
  async searchByAuthor(author: string): Promise<VcpmcRecord[]> {
    const cacheKey = `author::${this.normalize(author)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.log.debug(`Cache hit for author "${author}" (${cached.length} records)`);
      return cached;
    }

    const records = await this.searchAll(author, 'author');
    this.cache.set(cacheKey, records);
    this.log.info(`Fetched ${records.length} records for author "${author}"`);
    return records;
  }

  /** Search VCPMC by title. Results are cached. */
  async searchByTitle(title: string): Promise<VcpmcRecord[]> {
    const cacheKey = `title::${this.normalize(title)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.log.debug(`Cache hit for title "${title}"`);
      return cached;
    }

    const records = await this.searchAll(title, 'title');
    this.cache.set(cacheKey, records);
    return records;
  }

  /** Fetch all pages of search results */
  private async searchAll(keyword: string, type: 'author' | 'title'): Promise<VcpmcRecord[]> {
    const allRecords: VcpmcRecord[] = [];
    let totalPages = 1;

    // Fetch page 1
    const page1Url = this.buildSearchUrl(keyword, type);
    const { records, lastPage } = await this.fetchPageWithRetry(page1Url);
    allRecords.push(...records);
    totalPages = Math.min(lastPage, this.maxPages);

    // Fetch remaining pages
    for (let p = 2; p <= totalPages; p++) {
      await this.delay();
      const url = this.buildSearchUrl(keyword, type, p);
      try {
        const result = await this.fetchPageWithRetry(url);
        allRecords.push(...result.records);
        if (result.records.length === 0) break;
      } catch (err: any) {
        this.log.warn(`Failed to fetch page ${p} for "${keyword}": ${err.message}`);
        break; // Stop paginating on error, return what we have
      }
    }

    return allRecords;
  }

  /** Fetch a single page with retry */
  private async fetchPageWithRetry(url: string): Promise<{ records: VcpmcRecord[]; lastPage: number }> {
    return withRetry(() => this.fetchPage(url), {
      maxRetries: 2,
      baseDelayMs: 800,
      retryIf: isRetryableHttpError,
    });
  }

  /** Fetch and parse a single page */
  private async fetchPage(url: string): Promise<{ records: VcpmcRecord[]; lastPage: number }> {
    this.log.debug(`Fetching ${url}`);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    const records: VcpmcRecord[] = [];

    // Parse table rows
    $('table.table.table-striped tbody tr').each((_i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 5) {
        records.push({
          title: $(tds[0]).text().trim(),
          musicAuthor: $(tds[1]).text().trim(),
          authorization: $(tds[2]).text().trim(),
          lyricsAuthor: $(tds[3]).text().trim(),
          singer: $(tds[4]).text().trim(),
        });
      }
    });

    // Detect last page from pagination
    let lastPage = 1;
    const lastPageLink = $('a.last-page').attr('href');
    if (lastPageLink) {
      const match = lastPageLink.match(/page(\d+)\.html/);
      if (match) {
        lastPage = parseInt(match[1], 10);
      }
    }

    return { records, lastPage };
  }

  /**
   * Fuzzy match a song title against VCPMC records.
   * VCPMC stores titles in ALL CAPS without diacritics sometimes.
   */
  findMatch(candidateTitle: string, records: VcpmcRecord[]): VcpmcRecord | null {
    if (!candidateTitle || !Array.isArray(records)) return null;

    const normalized = this.normalize(candidateTitle);
    if (!normalized) return null;

    // Exact match first
    for (const record of records) {
      if (!record?.title) continue;
      const recordNorm = this.normalize(record.title);
      if (recordNorm === normalized) return record;
    }

    // Fuzzy: check if one contains the other (min 4 chars to avoid false positives)
    if (normalized.length >= 4) {
      for (const record of records) {
        if (!record?.title) continue;
        const recordNorm = this.normalize(record.title);
        if (recordNorm.length >= 4 && (recordNorm.includes(normalized) || normalized.includes(recordNorm))) {
          return record;
        }
      }
    }

    return null;
  }

  /** Normalize Vietnamese text for comparison - safe against undefined/null */
  private normalize(text: string | undefined | null): string {
    if (!text || typeof text !== 'string') return '';
    try {
      return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      return '';
    }
  }

  private delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }

  /** Get cache stats */
  getCacheSize(): number {
    return this.cache.size;
  }

  /** Clear cache */
  clearCache(): void {
    this.cache.clear();
  }
}
