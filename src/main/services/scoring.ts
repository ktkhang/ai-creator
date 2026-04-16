import { SongResult } from '../../shared/types';
import { Logger } from './logger';

/**
 * Deduplicates and ranks song results for diversity:
 * - Era balance (pre-2000, 2000-2015, post-2015)
 * - Author diversity (max 2 songs per author)
 * - Source confidence (multiple sources = higher score)
 */
export class ScoringEngine {
  private readonly log = new Logger('ScoringEngine');

  rankAndDeduplicate(results: SongResult[], limit: number): SongResult[] {
    // Filter out any results with invalid title/author FIRST
    const validResults = results.filter((r) => {
      if (!r || !r.title || !r.author) {
        this.log.debug('Filtering out invalid result:', r?.id ?? 'no-id');
        return false;
      }
      return true;
    });

    this.log.info(`Input: ${results.length} results, ${validResults.length} valid`);

    // Deduplicate by normalized title + author
    const seen = new Map<string, SongResult>();
    for (const r of validResults) {
      const key = this.normalizeKey(r.title, r.author);
      if (seen.has(key)) {
        const existing = seen.get(key)!;
        existing.sources = [...new Set([...existing.sources, ...r.sources])];
      } else {
        seen.set(key, { ...r });
      }
    }

    const deduped = Array.from(seen.values());
    this.log.info(`After dedup: ${deduped.length}`);

    // Score each result
    const authorCounts = new Map<string, number>();
    const eraCounts = { old: 0, mid: 0, new: 0 };

    for (const r of deduped) {
      const authorKey = this.normalize(r.author);
      authorCounts.set(authorKey, (authorCounts.get(authorKey) ?? 0) + 1);
    }

    for (const r of deduped) {
      let score = 0;

      score += Math.min(r.sources.length * 10, 20);

      const era = this.getEra(r.yearApprox);
      if (era === 'old' && eraCounts.old < 10) score += 15;
      else if (era === 'mid' && eraCounts.mid < 13) score += 15;
      else if (era === 'new' && eraCounts.new < 10) score += 15;

      const authorKey = this.normalize(r.author);
      const count = authorCounts.get(authorKey) ?? 1;
      if (count <= 2) score += 20;
      else if (count <= 3) score += 10;

      score += 20;
      r.score = score;
    }

    deduped.sort((a, b) => b.score - a.score);

    const finalAuthorCounts = new Map<string, number>();
    const selected: SongResult[] = [];

    for (const r of deduped) {
      if (selected.length >= limit) break;

      const authorKey = this.normalize(r.author);
      const currentCount = finalAuthorCounts.get(authorKey) ?? 0;
      if (currentCount >= 2) continue;

      finalAuthorCounts.set(authorKey, currentCount + 1);
      selected.push(r);
    }

    this.log.info(`Selected: ${selected.length} / limit ${limit}`);
    return selected;
  }

  private getEra(year?: number): 'old' | 'mid' | 'new' {
    if (!year || year < 2000) return 'old';
    if (year <= 2015) return 'mid';
    return 'new';
  }

  private normalizeKey(title: string, author: string): string {
    return `${this.normalize(title)}::${this.normalize(author)}`;
  }

  /** Normalize text safely - handles undefined/null gracefully */
  private normalize(text: string | undefined | null): string {
    if (!text || typeof text !== 'string') return '';
    try {
      return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      return '';
    }
  }
}
