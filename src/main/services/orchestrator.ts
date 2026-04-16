import { EventEmitter } from 'events';
import { AppSettings, SongResult, SearchSession, VcpmcRecord } from '../../shared/types';
import { VcpmcScraper } from './vcpmc-scraper';
import { ClaudeAgent, SearchCriteria } from './claude-agent';
import { Logger } from './logger';

/**
 * Pipeline:
 *
 *   [User Input]
 *       │
 *       ├──── Claude: extract criteria + keywords  (parallel)
 *       └──── VCPMC: search with raw theme words   (parallel)
 *                       │
 *                       ▼ merge both → enrich with iTunes → Claude curates
 *                       │
 *                       ├── enough? → DONE
 *                       └── not enough? → Claude generates new keywords → loop (max 3x)
 */
export class SearchOrchestrator extends EventEmitter {
  private readonly settings: AppSettings;
  private readonly vcpmc: VcpmcScraper;
  private readonly agent: ClaudeAgent;
  private readonly log = new Logger('Orchestrator');

  private static readonly MAX_LOOPS = 3;
  private static readonly VCPMC_PAGES_PER_KEYWORD = 2; // 2 × 20 = 40 results
  private static readonly VCPMC_KW_CONCURRENCY = 5;

  constructor(settings: AppSettings) {
    super();
    this.settings = settings;
    this.vcpmc = new VcpmcScraper(settings.vcpmcRequestDelayMs ?? 200);
    this.agent = new ClaudeAgent(settings.claudeApiKey);

    this.log.info('Orchestrator ready', {
      hasClaude: !!settings.claudeApiKey,
      maxResults: settings.maxResultsPerSearch,
    });
  }

  async search(theme: string): Promise<void> {
    const startTime = Date.now();
    const elapsed = () => Math.round((Date.now() - startTime) / 1000);
    const target = this.settings.maxResultsPerSearch || 30;

    if (!this.settings.claudeApiKey) {
      this.emit('status', { status: 'done', message: 'Loi: Chua cau hinh API Key' });
      this.emitComplete(theme, [], startTime);
      return;
    }

    const verified: SongResult[] = [];
    const usedKeywords: string[] = [];
    const seenKeys = new Set<string>();
    let idCounter = 0;

    this.emit('status', { status: 'searching', message: 'AI dang phan tich yeu cau...' });
    this.log.info(`=== SEARCH: "${theme}" (target=${target}) ===`);

    // ── Step 1 + 2 PARALLEL: criteria extraction + raw VCPMC search ──
    const rawKeywords = this.quickKeywords(theme);
    const [criteria, prelimRecords] = await Promise.all([
      this.agent.extractCriteria(theme),
      rawKeywords.length > 0
        ? this.searchVcpmc(rawKeywords, seenKeys)
        : Promise.resolve([] as VcpmcRecord[]),
    ]);

    usedKeywords.push(...rawKeywords);

    this.emit('status', {
      status: 'searching',
      message: `Tim kiem: ${criteria.description}`,
    });

    // Fetch additional keywords from criteria (not overlapping with raw)
    const extraKeywords = criteria.vcpmcKeywords.filter(
      (k) => !rawKeywords.some((r) => this.normKey(k, '') === this.normKey(r, ''))
    );
    let extraRecords: VcpmcRecord[] = [];
    if (extraKeywords.length > 0) {
      extraRecords = await this.searchVcpmc(extraKeywords, seenKeys);
      usedKeywords.push(...extraKeywords);
    }

    // Curate first batch
    let pendingRecords = [...prelimRecords, ...extraRecords];
    this.log.info(`First batch: ${pendingRecords.length} VCPMC records`);

    for (let loop = 1; loop <= SearchOrchestrator.MAX_LOOPS; loop++) {
      if (verified.length >= target) break;

      if (pendingRecords.length === 0) {
        this.log.warn(`Loop ${loop}: no records to curate`);
      } else {
        const needed = target - verified.length;
        this.emit('status', {
          status: 'checking-vcpmc',
          message: `[Vong ${loop}] AI kiem duyet ${pendingRecords.length} ket qua (can them ${needed})...`,
        });

        const curated = await this.agent.enrichAndCurate(pendingRecords, criteria, theme);
        this.log.info(`Loop ${loop}: curated ${curated.length} from ${pendingRecords.length}`);

        for (const song of curated) {
          if (verified.length >= target) break;
          // Dedup by title only — VCPMC có nhiều bài cùng tên khác tác giả, chỉ lấy 1
          const titleKey = this.normKey(song.vcpmcTitle, '');
          if (verified.some((r) => this.normKey(r.title, '') === titleKey)) continue;

          const result: SongResult = {
            id: `song-${++idCounter}`,
            title: song.vcpmcTitle,
            author: song.vcpmcAuthor,
            genre: song.genre,
            releaseYear: song.releaseYear,
            vcpmcStatus: 'verified',
            vcpmcLink: this.vcpmc.buildSearchUrl(song.vcpmcTitle),
            sources: ['vcpmc'],
            score: song.relevanceScore,
          };
          verified.push(result);
          this.emit('result', result);
        }

        this.emit('status', {
          status: 'checking-vcpmc',
          message: `Da co ${verified.length}/${target} bai hat phu hop...`,
        });
      }

      // Generate more keywords if still insufficient
      if (verified.length < target && loop < SearchOrchestrator.MAX_LOOPS) {
        const moreKw = await this.agent.generateMoreKeywords(
          theme, usedKeywords, verified.length, target
        );
        this.log.info(`Loop ${loop + 1} keywords: [${moreKw.join(', ')}]`);

        if (moreKw.length > 0) {
          pendingRecords = await this.searchVcpmc(moreKw, seenKeys);
          usedKeywords.push(...moreKw);
        } else {
          pendingRecords = [];
        }
      } else {
        break;
      }
    }

    this.log.info(`=== DONE: ${verified.length}/${target} in ${elapsed()}s ===`);

    this.emit('status', {
      status: 'done',
      message: `Hoan thanh! ${verified.length} bai hat phu hop (${elapsed()}s)`,
    });
    this.emitComplete(theme, verified, startTime);
  }

  private quickKeywords(theme: string): string[] {
    const stopWords = new Set([
      'bài', 'hát', 'nhạc', 'về', 'và', 'của', 'cho', 'là', 'các', 'những',
      'một', 'có', 'được', 'trong', 'với', 'theo', 'từ', 'hay', 'hoặc', 'như',
      'thì', 'tôi', 'mình', 'tìm', 'kiếm', 'muốn', 'cần', 'chủ', 'đề',
      'loại', 'thể', 'dạng', 'phong', 'cách', 'style',
    ]);

    const keywords: string[] = [];

    // If theme is short, use as-is
    if (theme.split(/\s+/).length <= 4) {
      keywords.push(theme.trim());
    }

    // Extract meaningful words (skip stop words, keep numbers/dates/proper nouns)
    const words = theme
      .split(/[\s,;|]+/)
      .map((w) => w.trim())
      .filter((w) => {
        if (!w || w.length < 2) return false;
        if (/^\d+[/\-]\d+$/.test(w)) return false; // skip bare "2/9" (handled via theme)
        return !stopWords.has(w.toLowerCase());
      });

    for (const w of words) {
      if (!keywords.some((k) => k.toLowerCase() === w.toLowerCase())) {
        keywords.push(w);
        if (keywords.length >= 3) break;
      }
    }

    return [...new Set(keywords)].filter(Boolean).slice(0, 3);
  }

  /**
   * Fetch VCPMC records for multiple keywords in parallel.
   */
  private async searchVcpmc(keywords: string[], seenKeys: Set<string>): Promise<VcpmcRecord[]> {
    if (keywords.length === 0) return [];

    const fresh: VcpmcRecord[] = [];
    const C = SearchOrchestrator.VCPMC_KW_CONCURRENCY;

    for (let i = 0; i < keywords.length; i += C) {
      const chunk = keywords.slice(i, i + C);
      const results = await Promise.all(
        chunk.map((kw) =>
          this.vcpmc.searchByKeyword(kw, SearchOrchestrator.VCPMC_PAGES_PER_KEYWORD).catch((err: any) => {
            this.log.error(`VCPMC "${kw}": ${err.message}`);
            return [] as VcpmcRecord[];
          })
        )
      );

      for (const records of results) {
        for (const r of records) {
          // Dedup by title-only at VCPMC stage — loại trùng tên khác tác giả
          const key = this.normKey(r.title, '');
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            fresh.push(r);
          }
        }
      }

      if (i + C < keywords.length) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    this.log.info(`VCPMC [${keywords.join(', ')}]: ${fresh.length} fresh records`);
    return fresh;
  }

  private emitComplete(theme: string, results: SongResult[], startTime: number): void {
    const session: SearchSession = {
      theme,
      results,
      status: 'done',
      stats: {
        totalCandidates: results.length,
        vcpmcVerified: results.length,
        vcpmcNotFound: 0,
        vcpmcPending: 0,
        elapsedMs: Date.now() - startTime,
        sources: ['vcpmc', 'claude', 'itunes'],
      },
    };
    this.emit('complete', session);
  }

  private normKey(title: string, author: string): string {
    const n = (s: string) =>
      (s ?? '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ').trim();
    return `${n(title)}::${n(author)}`;
  }
}
