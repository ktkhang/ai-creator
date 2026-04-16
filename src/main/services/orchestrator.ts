import { EventEmitter } from 'events';
import { AppSettings, SongResult, SearchSession, SongCandidate } from '../../shared/types';
import { VcpmcScraper } from './vcpmc-scraper';
import { GeminiCandidateGenerator } from './gemini-generator';
import { GeniusClient } from './genius-client';
import { LastfmClient } from './lastfm-client';
import { KeywordExtractor } from './keyword-extractor';
import { WebSearchService } from './web-search';
import { ScoringEngine } from './scoring';
import { Logger } from './logger';

export class SearchOrchestrator extends EventEmitter {
  private settings: AppSettings;
  private vcpmc: VcpmcScraper;
  private llm: GeminiCandidateGenerator;
  private genius: GeniusClient | null;
  private lastfm: LastfmClient | null;
  private webSearch: WebSearchService;
  private keywordExtractor: KeywordExtractor | null;
  private scoring: ScoringEngine;
  private readonly log = new Logger('Orchestrator');

  private static readonly HARD_TIMEOUT_MS = 60_000;
  private static readonly TIER3_THRESHOLD = 25;

  constructor(settings: AppSettings) {
    super();
    this.settings = settings;
    this.vcpmc = new VcpmcScraper(settings.vcpmcRequestDelayMs);
    this.llm = new GeminiCandidateGenerator(settings);
    this.scoring = new ScoringEngine();

    this.genius = settings.geniusApiKey
      ? new GeniusClient(settings.geniusApiKey)
      : null;

    this.lastfm = settings.lastfmApiKey
      ? new LastfmClient(settings.lastfmApiKey)
      : null;

    this.keywordExtractor = settings.geminiApiKey
      ? new KeywordExtractor(settings.geminiApiKey)
      : null;

    this.webSearch = new WebSearchService();

    this.log.info('Pipeline config:', {
      hasGemini: !!settings.geminiApiKey,
      hasGenius: !!settings.geniusApiKey,
      hasLastfm: !!settings.lastfmApiKey,
      maxResults: settings.maxResultsPerSearch,
    });
  }

  async search(theme: string): Promise<void> {
    const startTime = Date.now();
    const elapsed = () => Date.now() - startTime;
    const allCandidates: SongCandidate[] = [];
    const resultMap = new Map<string, SongResult>();
    let resultIdCounter = 0;

    const addCandidates = (candidates: SongCandidate[], source: string) => {
      if (!Array.isArray(candidates)) {
        this.log.warn(`addCandidates from ${source}: not an array`);
        return;
      }
      let added = 0;
      for (const c of candidates) {
        try {
          if (!c || typeof c.title !== 'string' || !c.title.trim() || typeof c.author !== 'string' || !c.author.trim()) {
            continue;
          }
          allCandidates.push(c);
          const key = this.normalizeKey(c.title, c.author);
          if (resultMap.has(key)) {
            const existing = resultMap.get(key)!;
            if (!existing.sources.includes(c.source)) {
              existing.sources.push(c.source);
              this.emit('result', existing);
            }
            continue;
          }
          const id = `song-${++resultIdCounter}`;
          const result: SongResult = {
            id,
            title: c.title.trim(),
            author: c.author.trim(),
            yearApprox: c.yearApprox,
            vcpmcStatus: 'pending',
            sources: [c.source],
            score: 0,
          };
          resultMap.set(key, result);
          this.emit('result', result);
          added++;
        } catch (err: any) {
          this.log.error(`Error processing candidate from ${source}: ${err.message}`);
        }
      }
      this.log.info(`${source}: +${added} new (${resultMap.size} total unique)`);
    };

    // ============================================================
    // TIER 1: LLM
    // ============================================================
    this.emit('status', { status: 'searching', message: 'Dang tim kiem bai hat tu AI...' });
    this.log.info(`=== SEARCH START: "${theme}" (min ${this.settings.maxResultsPerSearch}) ===`);

    // Keywords extraction + LLM in parallel
    const keywordsPromise = this.keywordExtractor
      ? this.keywordExtractor.extract(theme).catch((err: any) => {
          this.log.error(`Keyword extraction failed: ${err.message}`);
          return [theme];
        })
      : Promise.resolve([theme]);

    try {
      this.log.info('Tier 1: Starting Gemini generation...');
      const llmCandidates = await this.llm.generate(theme, this.settings.maxResultsPerSearch);
      this.log.info(`Tier 1: Gemini returned ${llmCandidates.length} candidates`);
      addCandidates(llmCandidates, 'Tier1-LLM');
      this.emit('status', {
        status: 'searching',
        message: `AI tim duoc ${llmCandidates.length} bai hat.`,
      });
    } catch (err: any) {
      this.log.error(`Tier 1 FAILED: ${err.message}`);
      this.emit('status', {
        status: 'searching',
        message: `LLM loi: ${err.message}. Tiep tuc voi nguon khac...`,
      });
    }

    const keywords = await keywordsPromise;
    this.log.info(`Keywords: [${keywords.join(', ')}]`);

    // ============================================================
    // TIER 2: Genius + Spotify
    // ============================================================
    if (elapsed() < SearchOrchestrator.HARD_TIMEOUT_MS - 10000) {
      const tier2Promises: Promise<void>[] = [];

      if (this.genius) {
        this.log.info('Tier 2: Starting Genius search...');
        tier2Promises.push(
          this.genius.searchByKeywords(keywords)
            .then((c) => { addCandidates(c, 'Tier2-Genius'); })
            .catch((err: any) => { this.log.error(`Tier 2 Genius FAILED: ${err.message}`); })
        );
      } else {
        this.log.info('Tier 2: Genius SKIPPED (no API key)');
      }

      if (this.lastfm) {
        this.log.info('Tier 2: Starting Last.fm search...');
        tier2Promises.push(
          this.lastfm.searchByKeywords(keywords, theme)
            .then((c) => { addCandidates(c, 'Tier2-Lastfm'); })
            .catch((err: any) => { this.log.error(`Tier 2 Last.fm FAILED: ${err.message}`); })
        );
      } else {
        this.log.info('Tier 2: Last.fm SKIPPED (no API key)');
      }

      if (tier2Promises.length > 0) {
        await Promise.race([
          Promise.allSettled(tier2Promises),
          new Promise((resolve) =>
            setTimeout(resolve, Math.max(0, SearchOrchestrator.HARD_TIMEOUT_MS - elapsed() - 8000))
          ),
        ]);
      }
    }

    this.log.info(`After Tier 1+2: ${resultMap.size} unique candidates`);

    // ============================================================
    // TIER 3: Web search fallback
    // ============================================================
    if (
      resultMap.size < SearchOrchestrator.TIER3_THRESHOLD &&
      elapsed() < SearchOrchestrator.HARD_TIMEOUT_MS - 8000
    ) {
      this.log.info(`Tier 3: Starting web search (only ${resultMap.size} < ${SearchOrchestrator.TIER3_THRESHOLD})...`);
      this.emit('status', {
        status: 'searching',
        message: `Dang tim them tu web...`,
      });

      try {
        const webCandidates = await Promise.race([
          this.webSearch.search(keywords, theme),
          new Promise<SongCandidate[]>((resolve) =>
            setTimeout(() => resolve([]), Math.max(0, SearchOrchestrator.HARD_TIMEOUT_MS - elapsed() - 6000))
          ),
        ]);
        addCandidates(webCandidates, 'Tier3-WebSearch');
      } catch (err: any) {
        this.log.error(`Tier 3 FAILED: ${err.message}`);
      }
    }

    this.log.info(`=== CANDIDATE PHASE DONE: ${resultMap.size} unique candidates in ${elapsed()}ms ===`);

    // ============================================================
    // DEDUP + RANK
    // ============================================================
    const allResults = Array.from(resultMap.values());
    const rankedResults = this.scoring.rankAndDeduplicate(
      allResults,
      this.settings.maxResultsPerSearch + 10
    );

    // ============================================================
    // VCPMC VERIFICATION
    // ============================================================
    if (rankedResults.length > 0) {
      this.emit('status', {
        status: 'checking-vcpmc',
        message: `Dang kiem tra ${rankedResults.length} bai hat tren VCPMC...`,
      });

      const uniqueAuthors = [...new Set(rankedResults.map((r) => r.author))];
      const vcpmcCache = new Map<string, import('../../shared/types').VcpmcRecord[]>();

      let checkedAuthors = 0;
      for (const author of uniqueAuthors) {
        if (elapsed() > SearchOrchestrator.HARD_TIMEOUT_MS) break;
        try {
          const records = await this.vcpmc.searchByAuthor(author);
          vcpmcCache.set(author, records);
          checkedAuthors++;
          this.emit('status', {
            status: 'checking-vcpmc',
            message: `VCPMC: ${checkedAuthors}/${uniqueAuthors.length} tac gia...`,
          });
        } catch (err: any) {
          this.log.warn(`VCPMC lookup failed for "${author}": ${err.message}`);
        }
      }

      for (const result of rankedResults) {
        try {
          if (!result.title || !result.author) {
            result.vcpmcStatus = 'not-found';
            this.emit('result', result);
            continue;
          }
          const authorRecords = vcpmcCache.get(result.author) ?? [];
          let match = this.vcpmc.findMatch(result.title, authorRecords);

          // Fallback: search VCPMC directly by song title
          if (!match && elapsed() < SearchOrchestrator.HARD_TIMEOUT_MS) {
            try {
              this.emit('status', {
                status: 'checking-vcpmc',
                message: `VCPMC: thu tim theo ten "${result.title}"...`,
              });
              const titleRecords = await this.vcpmc.searchByTitle(result.title);
              match = this.vcpmc.findMatch(result.title, titleRecords);
            } catch {
              // ignore
            }
          }

          if (match) {
            result.vcpmcStatus = 'verified';
            result.vcpmcRecord = match;
            // Link to the specific title search or author search depending on how we found it
            result.vcpmcLink = this.vcpmc.buildSearchUrl(match.musicAuthor || result.author, 'author');
          } else {
            result.vcpmcStatus = 'not-found';
          }
        } catch (err: any) {
          this.log.error(`VCPMC match error for "${result.title}": ${err.message}`);
          result.vcpmcStatus = 'not-found';
        }
        this.emit('result', result);
      }
    }

    // ============================================================
    // FINAL
    // ============================================================
    const verified = rankedResults.filter((r) => r.vcpmcStatus === 'verified');
    const finalResults = verified.slice(0, this.settings.maxResultsPerSearch);

    this.log.info(`=== SEARCH DONE: ${finalResults.length} verified / ${rankedResults.length} ranked / ${allCandidates.length} total in ${elapsed()}ms ===`);

    const session: SearchSession = {
      theme,
      results: finalResults,
      status: 'done',
      stats: {
        totalCandidates: allCandidates.length,
        vcpmcVerified: finalResults.length,
        vcpmcNotFound: rankedResults.filter((r) => r.vcpmcStatus === 'not-found').length,
        vcpmcPending: 0,
        elapsedMs: elapsed(),
        sources: this.getActiveSources(),
      },
    };

    this.emit('status', {
      status: 'done',
      message: `Hoan thanh! ${finalResults.length} bai hat co tren VCPMC (${(elapsed() / 1000).toFixed(1)}s)`,
    });
    this.emit('complete', session);
  }

  private getActiveSources(): string[] {
    const sources: string[] = [];
    if (this.settings.geminiApiKey) sources.push('gemini');
    if (this.genius) sources.push('genius');
    if (this.lastfm) sources.push('lastfm');
    sources.push('web-search');
    return sources;
  }

  private normalizeKey(title: string, author: string): string {
    const norm = (s: string | undefined | null) =>
      (s ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return `${norm(title)}::${norm(author)}`;
  }
}
