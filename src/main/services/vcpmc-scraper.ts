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

  /** Encode keyword for VCPMC URL (double-encode spaces, preserve Vietnamese diacritics) */
  encodeKeyword(keyword: string): string {
    if (!keyword) return '';
    // Encode each word individually, then join with %2520 (double-encoded space)
    return keyword
      .trim()
      .split(/\s+/)
      .map((word) => encodeURIComponent(word))
      .join('%2520');
  }

  /** Build a VCPMC search URL */
  buildSearchUrl(keyword: string, _type?: 'author' | 'title', page?: number): string {
    const encoded = this.encodeKeyword(keyword);
    if (!page || page === 1) {
      return `${this.baseUrl}/${encoded}/author.html`;
    }
    return `${this.baseUrl}/${encoded}/author-page${page}.html`;
  }

  /**
   * Search VCPMC by any keyword (theme, song title, author name).
   * NOTE: VCPMC's /author.html endpoint performs FULL-TEXT search across
   * both song titles and author names — the /title.html endpoint exists
   * but returns empty results, so /author.html is the canonical endpoint.
   *
   * @param maxPages cap the number of pages to fetch (1 page ≈ 5 records)
   */
  async searchByKeyword(keyword: string, maxPages = 3): Promise<VcpmcRecord[]> {
    const cacheKey = `kw::${this.normalize(keyword)}::p${maxPages}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.log.debug(`Cache hit for keyword "${keyword}" (${cached.length} records)`);
      return cached;
    }

    const records = await this.fetchAllPages(keyword, maxPages);
    this.cache.set(cacheKey, records);
    this.log.info(`Keyword "${keyword}" -> ${records.length} records (maxPages=${maxPages})`);
    return records;
  }

  /**
   * Lightweight probe: fetch only page 1 and return record count + sample
   * titles. Used for artist pre-validation without burning budget on pagination.
   */
  async probeKeyword(keyword: string): Promise<{ count: number; lastPage: number; sampleTitles: string[] }> {
    const cacheKey = `probe::${this.normalize(keyword)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        count: cached.length,
        lastPage: Math.max(1, Math.ceil(cached.length / 5)),
        sampleTitles: cached.slice(0, 5).map((r) => r.title),
      };
    }

    try {
      const url = this.buildSearchUrl(keyword);
      const { records, lastPage } = await this.fetchPageWithRetry(url);
      // Populate cache with page-1 records so later full fetches reuse them
      this.cache.set(`kw::${this.normalize(keyword)}::p1`, records);
      return {
        count: records.length,
        lastPage,
        sampleTitles: records.slice(0, 5).map((r) => r.title),
      };
    } catch (err: any) {
      this.log.warn(`probeKeyword "${keyword}" failed: ${err.message}`);
      return { count: 0, lastPage: 1, sampleTitles: [] };
    }
  }

  /** @deprecated Use searchByKeyword instead */
  async searchByAuthor(author: string): Promise<VcpmcRecord[]> {
    return this.searchByKeyword(author, 3);
  }

  /** @deprecated Use searchByKeyword instead */
  async searchByTitle(title: string): Promise<VcpmcRecord[]> {
    return this.searchByKeyword(title, 2);
  }

  /** Fetch all pages of search results up to maxPages */
  private async fetchAllPages(keyword: string, maxPages: number): Promise<VcpmcRecord[]> {
    const allRecords: VcpmcRecord[] = [];

    // Fetch page 1
    const page1Url = this.buildSearchUrl(keyword);
    const { records, lastPage } = await this.fetchPageWithRetry(page1Url);
    allRecords.push(...records);
    const totalPages = Math.min(lastPage, maxPages);

    // Fetch remaining pages
    for (let p = 2; p <= totalPages; p++) {
      await this.delay();
      const url = this.buildSearchUrl(keyword, undefined, p);
      try {
        const result = await this.fetchPageWithRetry(url);
        allRecords.push(...result.records);
        if (result.records.length === 0) break;
      } catch (err: any) {
        this.log.warn(`Failed to fetch page ${p} for "${keyword}": ${err.message}`);
        break;
      }
    }

    return allRecords;
  }

  /** Fetch all pages of search results */
  private async searchAll(keyword: string, _type: 'author' | 'title'): Promise<VcpmcRecord[]> {
    return this.fetchAllPages(keyword, this.maxPages);
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
