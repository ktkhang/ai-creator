import { EventEmitter } from 'events';
import { AppSettings, SongResult, SearchSession, VcpmcRecord } from '../../shared/types';
import { VcpmcScraper } from './vcpmc-scraper';
import { IAiAgent } from './ai-agent';
import { ClaudeAgent } from './claude-agent';
import { GeminiAgent } from './gemini-agent-impl';
import { Logger } from './logger';

function createAgent(settings: AppSettings): IAiAgent {
  if (settings.aiProvider === 'gemini') {
    return new GeminiAgent(settings.geminiApiKey, settings.aiModel);
  }
  return new ClaudeAgent(settings.claudeApiKey, settings.aiModel);
}

/**
 * Pipeline v3 — Dual-track VCPMC harvest:
 *
 *   [User Input]
 *       │
 *       └── AI: criteria (artistKeywords + thematic vcpmcKeywords)
 *              │
 *              ├── Track A: ping artists (page-1 probe) → validate → deep fetch
 *              │   (artists that return 0 hits are discarded; fallback artists
 *              │    requested from AI until we have N viable names)
 *              │
 *              └── Track B: thematic full-text search
 *                  (VCPMC's /author.html is a full-text endpoint; "tình yêu"
 *                   returns hundreds of matching titles across ~200 pages)
 *              │
 *       ┌──────┘
 *       ▼
 *   Merged candidate pool (dedup by title+author)
 *       │
 *       ▼
 *   AI curator scores by THEMATIC FIT (not fame) → adaptive minScore
 *       │
 *       ├── enough? → DONE
 *       └── short?  → AI proposes new artists + new thematic terms → loop (max 4)
 */
export class SearchOrchestrator extends EventEmitter {
  private readonly settings: AppSettings;
  private readonly vcpmc: VcpmcScraper;
  private readonly agent: IAiAgent;
  private readonly log = new Logger('Orchestrator');

  private static readonly MAX_LOOPS = 4;
  private static readonly ARTIST_PAGES = 2;           // ~10 records per artist
  private static readonly THEMATIC_PAGES = 6;         // ~30 records per thematic kw
  private static readonly VCPMC_CONCURRENCY = 5;
  private static readonly MIN_ARTIST_HITS = 1;        // artist kept if probe returns ≥ 1
  /** Pool size threshold above which we loosen the minScore (popular theme). */
  private static readonly LOOSE_POOL_THRESHOLD = 120;
  /** Max songs accepted per unique music-author (Gen-Z diversity rule). */
  private static readonly MAX_PER_AUTHOR = 2;
  /** Jaccard similarity over title tokens above which two titles are collapsed. */
  private static readonly NEAR_DUP_JACCARD = 0.7;

  /**
   * Regex of VCPMC title fragments that should NEVER reach the user.
   * Covers: liên khúc (medleys), remix/beat/karaoke variants, instrumental,
   * and "beat chuẩn" style production-only records.
   */
  private static readonly INVALID_TITLE_RE = new RegExp(
    [
      '^lk\\b',               // "LK Nỗi Buồn..." (liên khúc prefix)
      '\\blien khuc\\b',      // "Liên Khúc ..."
      '\\bmedley\\b',
      '\\bremix\\b',
      '\\bkaraoke\\b',
      '\\binstrumental\\b',
      '\\bbeat\\b',
      '\\bmashup\\b',
      '\\bcover\\b',
      '\\bver\\.?\\s*\\d',    // ver.2, ver 3
      '\\bdemo\\b',
      '\\bnhac chuong\\b',
      '\\bringtone\\b',
    ].join('|'),
    'i',
  );

  constructor(settings: AppSettings) {
    super();
    this.settings = settings;
    this.vcpmc = new VcpmcScraper(settings.vcpmcRequestDelayMs ?? 200);
    this.agent = createAgent(settings);

    const label = settings.aiProvider === 'gemini' ? `Gemini/${settings.aiModel}` : `Claude/${settings.aiModel}`;
    this.log.info(`Orchestrator ready [${label}]`, { maxResults: settings.maxResultsPerSearch });
  }

  async search(theme: string): Promise<void> {
    const startTime = Date.now();
    const elapsed = () => Math.round((Date.now() - startTime) / 1000);
    const target = this.settings.maxResultsPerSearch || 30;

    const activeKey = this.settings.aiProvider === 'gemini' ? this.settings.geminiApiKey : this.settings.claudeApiKey;
    if (!activeKey) {
      this.emit('status', { status: 'done', message: 'Loi: Chua cau hinh API Key' });
      this.emitComplete(theme, [], startTime);
      return;
    }

    const verified: SongResult[] = [];
    const usedKeywords = new Set<string>();
    const seenTitles = new Set<string>();   // dedup at VCPMC fetch level (title-only)
    const verifiedKeys = new Set<string>(); // dedup verified songs (title+author)
    const verifiedTitleTokens: Set<string>[] = []; // token-sets for fuzzy dedup
    const authorCounts = new Map<string, number>(); // per-author cap tracking
    let idCounter = 0;

    this.emit('status', { status: 'searching', message: 'AI dang phan tich yeu cau...' });
    this.log.info(`=== SEARCH v3: "${theme}" (target=${target}) ===`);

    // ── Step 1: AI extract criteria ──
    const criteria = await this.agent.extractCriteria(theme);
    this.log.info(
      `AI proposed ${criteria.artistKeywords.length} artists + ${criteria.vcpmcKeywords.length} thematic kw`,
    );

    this.emit('status', {
      status: 'searching',
      message: `Phan tich: ${criteria.description}`,
    });

    // ── Step 2a: Pre-validate artists (page-1 probe in parallel) ──
    this.emit('status', {
      status: 'searching',
      message: `Kiem tra ${criteria.artistKeywords.length} nghe si tren VCPMC...`,
    });
    const validatedArtists = await this.validateArtists(criteria.artistKeywords);
    this.log.info(
      `Validated artists: ${validatedArtists.length}/${criteria.artistKeywords.length} have VCPMC hits`,
    );

    validatedArtists.forEach((a) => usedKeywords.add(a));
    criteria.vcpmcKeywords.forEach((k) => usedKeywords.add(k));

    // ── Step 2b: Parallel harvest — artists (light) + thematic (deep) ──
    this.emit('status', {
      status: 'searching',
      message: `Thu thap: ${validatedArtists.length} nghe si + ${criteria.vcpmcKeywords.length} tu khoa chu de...`,
    });

    const [artistRecords, thematicRecords] = await Promise.all([
      this.harvest(validatedArtists, SearchOrchestrator.ARTIST_PAGES, seenTitles),
      this.harvest(criteria.vcpmcKeywords, SearchOrchestrator.THEMATIC_PAGES, seenTitles),
    ]);

    let pendingRecords: VcpmcRecord[] = [...artistRecords, ...thematicRecords];
    this.log.info(
      `Initial pool: ${pendingRecords.length} records (artist=${artistRecords.length}, thematic=${thematicRecords.length})`,
    );

    // ── Step 3: curate → expand loop ──
    for (let loop = 1; loop <= SearchOrchestrator.MAX_LOOPS; loop++) {
      if (verified.length >= target) break;

      if (pendingRecords.length > 0) {
        const needed = target - verified.length;
        const minScore = this.adaptiveMinScore(pendingRecords.length);

        this.emit('status', {
          status: 'checking-vcpmc',
          message: `[Vong ${loop}] AI cham diem ${pendingRecords.length} bai (can ${needed}, minScore=${minScore})...`,
        });

        const curated = await this.agent.enrichAndCurate(
          pendingRecords, criteria, theme, minScore,
        );
        this.log.info(
          `Loop ${loop}: curated ${curated.length}/${pendingRecords.length} (minScore=${minScore})`,
        );

        for (const song of curated) {
          if (verified.length >= target) break;

          // Filter #1: invalid title patterns (LK, remix, karaoke, beat, ...)
          if (SearchOrchestrator.INVALID_TITLE_RE.test(song.vcpmcTitle)) {
            this.log.debug(`Drop "${song.vcpmcTitle}" (invalid title pattern)`);
            continue;
          }

          // Filter #2: strict dedup by (title + author)
          const key = this.normKey(song.vcpmcTitle, song.vcpmcAuthor);
          if (verifiedKeys.has(key)) continue;

          // Filter #3: near-duplicate title (Jaccard ≥ 0.7 over normalized tokens)
          const tokens = this.titleTokens(song.vcpmcTitle);
          if (tokens.size > 0 && this.isNearDuplicate(tokens, verifiedTitleTokens)) {
            this.log.debug(`Drop "${song.vcpmcTitle}" (near-duplicate of existing)`);
            continue;
          }

          // Filter #4: cap songs per music-author to enforce diversity
          const authorKey = this.normAuthor(song.vcpmcAuthor);
          const count = authorCounts.get(authorKey) ?? 0;
          if (count >= SearchOrchestrator.MAX_PER_AUTHOR) {
            this.log.debug(`Drop "${song.vcpmcTitle}" (author "${song.vcpmcAuthor}" cap reached)`);
            continue;
          }

          verifiedKeys.add(key);
          verifiedTitleTokens.push(tokens);
          authorCounts.set(authorKey, count + 1);

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
      } else {
        this.log.warn(`Loop ${loop}: empty pending pool`);
      }

      // Expand if still short
      if (verified.length < target && loop < SearchOrchestrator.MAX_LOOPS) {
        const moreKw = await this.agent.generateMoreKeywords(
          theme, [...usedKeywords], verified.length, target,
        );
        const fresh = moreKw.filter((k) => !usedKeywords.has(k));
        this.log.info(`Loop ${loop} expansion: [${fresh.join(', ')}]`);

        if (fresh.length === 0) {
          this.log.info('No new keywords from AI — stopping expansion');
          break;
        }

        // Light validation then harvest at artist depth
        const validatedFresh = await this.validateArtists(fresh);
        validatedFresh.forEach((k) => usedKeywords.add(k));
        // Even non-validated keywords might be thematic terms — keep them as shallow thematic probes
        const shallowThematic = fresh.filter((k) => !validatedFresh.includes(k));
        shallowThematic.forEach((k) => usedKeywords.add(k));

        const [nextArtist, nextThematic] = await Promise.all([
          this.harvest(validatedFresh, SearchOrchestrator.ARTIST_PAGES, seenTitles),
          this.harvest(shallowThematic, SearchOrchestrator.ARTIST_PAGES, seenTitles),
        ]);
        pendingRecords = [...nextArtist, ...nextThematic];
      } else {
        break;
      }
    }

    this.log.info(
      `=== DONE: ${verified.length}/${target} in ${elapsed()}s | keywords tried=${usedKeywords.size} ===`,
    );

    this.emit('status', {
      status: 'done',
      message: `Hoan thanh! ${verified.length} bai hat phu hop (${elapsed()}s)`,
    });
    this.emitComplete(theme, verified, startTime);
  }

  // ─── Private helpers ──────────────────────────────────────────

  /**
   * Pre-validate artist names: probe page 1 and keep only names with ≥ MIN_ARTIST_HITS.
   * Avoids wasting full-depth fetches on AI-hallucinated names.
   * Runs with concurrency to keep end-to-end latency low.
   */
  private async validateArtists(names: string[]): Promise<string[]> {
    if (names.length === 0) return [];
    const C = SearchOrchestrator.VCPMC_CONCURRENCY;
    const keep: string[] = [];

    for (let i = 0; i < names.length; i += C) {
      const chunk = names.slice(i, i + C);
      const probed = await Promise.all(
        chunk.map(async (name) => {
          try {
            const { count } = await this.vcpmc.probeKeyword(name);
            return { name, count };
          } catch {
            return { name, count: 0 };
          }
        }),
      );
      for (const { name, count } of probed) {
        if (count >= SearchOrchestrator.MIN_ARTIST_HITS) {
          keep.push(name);
        } else {
          this.log.debug(`Dropping artist "${name}" — 0 VCPMC hits`);
        }
      }
    }
    return keep;
  }

  /**
   * Fetch VCPMC records for a list of keywords at given page depth.
   * Thematic keywords typically need deeper pagination than artist names.
   */
  private async harvest(
    keywords: string[],
    maxPages: number,
    seenTitles: Set<string>,
  ): Promise<VcpmcRecord[]> {
    if (keywords.length === 0) return [];

    const fresh: VcpmcRecord[] = [];
    const C = SearchOrchestrator.VCPMC_CONCURRENCY;

    for (let i = 0; i < keywords.length; i += C) {
      const chunk = keywords.slice(i, i + C);

      this.emit('status', {
        status: 'searching',
        message: `Tim VCPMC: ${chunk.map((k) => k.substring(0, 18)).join(', ')}...`,
      });

      const results = await Promise.all(
        chunk.map((kw) =>
          this.vcpmc
            .searchByKeyword(kw, maxPages)
            .catch((err: any) => {
              this.log.error(`VCPMC "${kw}": ${err.message}`);
              return [] as VcpmcRecord[];
            }),
        ),
      );

      for (const records of results) {
        for (const r of records) {
          // Drop obvious junk at harvest-time to save curation tokens
          if (SearchOrchestrator.INVALID_TITLE_RE.test(r.title)) continue;
          const key = this.normKey(r.title, '');
          if (!seenTitles.has(key)) {
            seenTitles.add(key);
            fresh.push(r);
          }
        }
      }

      if (i + C < keywords.length) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    return fresh;
  }

  /**
   * Popular themes surface hundreds of candidates — relax the bar slightly
   * so AI-curator doesn't over-filter. Niche themes keep the tighter default.
   */
  private adaptiveMinScore(poolSize: number): number {
    if (poolSize >= SearchOrchestrator.LOOSE_POOL_THRESHOLD) return 5;
    if (poolSize >= 40) return 6;
    return 5; // tiny pool — don't compound the problem
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
        sources: ['vcpmc'],
      },
    };
    this.emit('complete', session);
  }

  private normKey(title: string, author: string): string {
    const n = (s: string) =>
      (s ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return `${n(title)}::${n(author)}`;
  }

  /** Normalize author name for dedup/cap tracking (case + diacritics insensitive). */
  private normAuthor(author: string): string {
    return (author ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Stopwords to ignore when computing title-token Jaccard similarity. */
  private static readonly TITLE_STOPWORDS = new Set([
    'va', 'voi', 'cua', 'cho', 'la', 'mot', 'em', 'anh', 'toi', 'minh',
    'oi', 'di', 've', 'den', 'ra', 'nay', 'do', 'kia', 'cai', 'con',
    'the', 'nao', 'thi', 'khi', 'co', 'khong', 'duoc',
  ]);

  /** Split a title into a normalized token set (diacritics stripped, stopwords removed). */
  private titleTokens(title: string): Set<string> {
    const norm = (title ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const tokens = new Set<string>();
    for (const t of norm.split(' ')) {
      if (t.length < 2) continue;
      if (SearchOrchestrator.TITLE_STOPWORDS.has(t)) continue;
      tokens.add(t);
    }
    return tokens;
  }

  /**
   * Detect near-duplicate titles via Jaccard similarity over content tokens.
   * "Yêu Em Thật Nhiều" ↔ "Yêu Em Thật Nhiều (Remake)" collapses;
   * "Có Chắc Yêu Là Đây" ↔ "Có Chắc Yêu Là Đây Remix" collapses;
   * "Nàng Thơ" ↔ "Nàng Thơ Của Anh" does NOT collapse (different song).
   */
  private isNearDuplicate(tokens: Set<string>, existing: Set<string>[]): boolean {
    for (const other of existing) {
      if (other.size === 0) continue;
      // Fast reject: size-ratio must be within 2x
      const smaller = Math.min(tokens.size, other.size);
      const larger = Math.max(tokens.size, other.size);
      if (smaller / larger < 0.5) continue;

      let intersect = 0;
      for (const t of tokens) if (other.has(t)) intersect++;
      const union = tokens.size + other.size - intersect;
      if (union === 0) continue;
      const jaccard = intersect / union;
      if (jaccard >= SearchOrchestrator.NEAR_DUP_JACCARD) return true;
    }
    return false;
  }
}
