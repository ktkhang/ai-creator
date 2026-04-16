import { ClaudeClient } from './claude-client';
import { ItunesClient, ItunesTrackInfo } from './itunes-client';
import { VcpmcRecord } from '../../shared/types';
import { Logger } from './logger';

export interface SearchCriteria {
  description: string;
  vcpmcKeywords: string[];
  /** Explicit genres/styles to INCLUDE, e.g. "V-pop", "indie", "nhạc trẻ" */
  includeGenres: string[];
  /** Explicit genres/styles to EXCLUDE, e.g. "bolero", "cải lương", "nhạc vàng" */
  excludeGenres: string[];
  /** Target audience e.g. "giới trẻ", "thiếu nhi", "người lớn tuổi" */
  targetAudience: string;
  /** Era preference e.g. "hiện đại (2010+)", "cổ điển (trước 2000)" */
  eraPreference: string;
}

export interface EnrichedRecord {
  vcpmcRecord: VcpmcRecord;
  itunesInfo: ItunesTrackInfo | null;
}

export interface CuratedSong {
  vcpmcTitle: string;
  vcpmcAuthor: string;
  relevanceScore: number; // 1-10
  reason: string;
  genre?: string;       // Claude tự điền từ knowledge
  releaseYear?: number; // Claude tự điền từ knowledge
}

/**
 * Claude-powered agent (via TrollLLM API) for:
 * 1. Parsing user input → structured SearchCriteria
 * 2. Curating VCPMC records enriched with iTunes metadata
 * 3. Generating fallback keywords when results are insufficient
 */
export class ClaudeAgent {
  private readonly claude: ClaudeClient;
  private readonly itunes: ItunesClient;
  private readonly log = new Logger('ClaudeAgent');

  constructor(apiKey: string) {
    this.claude = new ClaudeClient(apiKey);
    this.itunes = new ItunesClient();
  }

  // ─── STEP 1: Extract criteria ──────────────────────────────────

  async extractCriteria(userInput: string): Promise<SearchCriteria> {
    this.log.info(`Extracting criteria: "${userInput}"`);

    const user = `Phân tích yêu cầu tìm bài hát Việt Nam: "${userInput}"

Trả về JSON (không markdown, không giải thích):
{"description":"tiêu chí ngắn 1 câu","vcpmcKeywords":["kw1","kw2","kw3"],"includeGenres":["thể loại cần có"],"excludeGenres":["thể loại loại bỏ"],"targetAudience":"đối tượng","eraPreference":"thời kỳ"}

vcpmcKeywords: 3-5 từ khóa tiếng Việt có dấu để tìm trực tiếp trên VCPMC. Dùng từ ngắn, cụ thể. Ví dụ "bài hát 2/9 quốc khánh": ["quốc khánh","độc lập","ngày lễ","nhạc đỏ","yêu nước"]`;

    // Retry up to 2 times on server errors
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const text = await this.claude.ask(user, undefined, 512);
        const parsed = ClaudeClient.extractJson(text);

        const criteria: SearchCriteria = {
          description: str(parsed.description, userInput),
          vcpmcKeywords: strArr(parsed.vcpmcKeywords, [userInput]),
          includeGenres: strArr(parsed.includeGenres, []),
          excludeGenres: strArr(parsed.excludeGenres, []),
          targetAudience: str(parsed.targetAudience, ''),
          eraPreference: str(parsed.eraPreference, ''),
        };

        this.log.info(`Criteria: ${JSON.stringify(criteria)}`);
        return criteria;
      } catch (err: any) {
        this.log.error(`extractCriteria attempt ${attempt} failed: ${err.message}`);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    // Fallback: use raw input as keyword
    return {
      description: userInput,
      vcpmcKeywords: [userInput],
      includeGenres: [],
      excludeGenres: [],
      targetAudience: '',
      eraPreference: '',
    };
  }

  // ─── STEP 2: Enrich + Curate ───────────────────────────────────

  /**
   * Curate VCPMC records as a content creator.
   * iTunes enrichment runs in background and is used only if it resolves fast.
   * Primary curation is done using singer/title heuristics.
   */
  async enrichAndCurate(
    records: VcpmcRecord[],
    criteria: SearchCriteria,
    userInput: string,
    minScore = 6
  ): Promise<CuratedSong[]> {
    if (records.length === 0) return [];

    // Cap at 60, run all batches of 30 in parallel
    const MAX = 60;
    const capped = records.slice(0, MAX);
    this.log.info(`Curating ${capped.length} records (of ${records.length})...`);

    const BATCH = 20;
    const batches: VcpmcRecord[][] = [];
    for (let i = 0; i < capped.length; i += BATCH) {
      batches.push(capped.slice(i, i + BATCH));
    }

    // Kick off iTunes lookup in background (best-effort, non-blocking)
    // We give it a 10s window to return metadata; if slower, skip it
    const itunesPromise = Promise.race([
      this.itunes.batchLookup(capped.map((r) => ({ title: r.title, artist: r.musicAuthor }))),
      new Promise<Map<string, any>>((resolve) =>
        setTimeout(() => resolve(new Map()), 10_000)
      ),
    ]);

    // Run Claude curation batches in parallel (no iTunes wait)
    const enriched: EnrichedRecord[] = capped.map((r) => ({
      vcpmcRecord: r,
      itunesInfo: null, // will be filled in post
    }));

    const batchResults = await Promise.all(
      batches.map((_, i) =>
        this.curateBatch(
          enriched.slice(i * BATCH, (i + 1) * BATCH),
          criteria, userInput, minScore
        )
      )
    );

    // Merge results
    const allCurated = batchResults.flat();

    // Try to attach iTunes metadata if available within the window
    try {
      const itunesMap = await itunesPromise;
      if (itunesMap.size > 0) {
        const matched = [...itunesMap.values()].filter(Boolean).length;
        this.log.info(`iTunes: ${matched}/${capped.length} matched`);
        for (const song of allCurated) {
          const key = `${this.normKey(song.vcpmcTitle)}::${this.normKey(song.vcpmcAuthor)}`;
          const info = itunesMap.get(key);
          if (info) {
            song.genre = info.genre || undefined;
            song.releaseYear = info.releaseYear || undefined;
          }
        }
      } else {
        this.log.info('iTunes: timeout or no matches, skipping enrichment');
      }
    } catch {
      // ignore iTunes errors
    }

    allCurated.sort((a, b) => b.relevanceScore - a.relevanceScore);
    this.log.info(`Curated ${allCurated.length} songs from ${capped.length} records`);
    return allCurated;
  }

  private async curateBatch(
    enriched: EnrichedRecord[],
    criteria: SearchCriteria,
    userInput: string,
    minScore: number
  ): Promise<CuratedSong[]> {
    const recordList = enriched.map((e, i) => {
      const r = e.vcpmcRecord;
      const parts = [
        `${i + 1}.`,
        `Tên: "${r.title}"`,
        `Nhạc sĩ: "${r.musicAuthor}"`,
        r.singer ? `Ca sĩ: "${r.singer}"` : null,
      ].filter(Boolean).join(' | ');
      return parts;
    }).join('\n');

    const includeStr = criteria.includeGenres.length
      ? `\nBẮT BUỘC thuộc thể loại: ${criteria.includeGenres.join(', ')}` : '';
    const excludeStr = criteria.excludeGenres.length
      ? `\nLOẠI BỎ nếu thuộc: ${criteria.excludeGenres.join(', ')}` : '';
    const audienceStr = criteria.targetAudience
      ? `\nĐối tượng: ${criteria.targetAudience}` : '';
    const eraStr = criteria.eraPreference
      ? `\nThời kỳ ưa thích: ${criteria.eraPreference}` : '';

    const system = `Bạn là content creator âm nhạc Việt Nam. Hiểu rõ: V-pop, indie, bolero, nhạc vàng, cải lương, nhạc đỏ, rap, thiếu nhi. Trả lời JSON thuần túy.`;

    const user = `NHIỆM VỤ: Kiểm duyệt danh sách bài hát từ VCPMC cho yêu cầu của khách hàng.

YÊU CẦU KHÁCH HÀNG: "${userInput}"
TIÊU CHÍ: ${criteria.description}${includeStr}${excludeStr}${audienceStr}${eraStr}

DANH SÁCH BÀI HÁT (từ VCPMC):
${recordList}

CÁCH CHẤM ĐIỂM (1-10):
- 9-10: Phù hợp hoàn toàn, bài hát NỔI TIẾNG, dễ tìm trên YouTube/Spotify
- 7-8: Phù hợp, bài hát được biết đến rộng rãi
- 5-6: Phù hợp nhưng bài ít nổi tiếng hoặc khó tìm kiếm
- 1-4: Không phù hợp hoặc bài hát không tồn tại / không ai biết

NGUYÊN TẮC QUAN TRỌNG:
- ƯU TIÊN bài hát NỔI TIẾNG mà người dùng có thể tìm thấy trên YouTube — đây là tiêu chí hàng đầu
- Loại bỏ bài có tên quá chung chung, tên trùng với nhiều bài khác, hoặc bài của nghệ sĩ vô danh
- Dựa vào tên ca sĩ để đánh giá độ nổi tiếng và thể loại
- Bài có điểm < ${minScore} → loại bỏ

TRẢ VỀ JSON array (KHÔNG markdown):
[{
  "vcpmcTitle": "tên bài hát đúng như trên VCPMC",
  "vcpmcAuthor": "tên nhạc sĩ đúng như trên VCPMC",
  "relevanceScore": 8,
  "reason": "lý do 1 câu",
  "genre": "thể loại âm nhạc (V-pop/indie/nhạc đỏ/bolero/...)",
  "year": 2020
}]
Nếu không có bài đủ điểm: []

Lưu ý: "genre" và "year" hãy điền dựa trên kiến thức của bạn về bài hát/nhạc sĩ đó. Nếu không chắc thì để null.`;

    try {
      const text = await this.claude.ask(user, system, 4096);
      const parsed = ClaudeClient.extractJson(text);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((item: any) =>
          item &&
          typeof item.vcpmcTitle === 'string' && item.vcpmcTitle.trim() &&
          typeof item.vcpmcAuthor === 'string' &&
          typeof item.relevanceScore === 'number' &&
          item.relevanceScore >= minScore
        )
        .map((item: any) => ({
          vcpmcTitle: item.vcpmcTitle.trim(),
          vcpmcAuthor: item.vcpmcAuthor.trim(),
          relevanceScore: item.relevanceScore,
          reason: typeof item.reason === 'string' ? item.reason.trim() : '',
          genre: typeof item.genre === 'string' && item.genre ? item.genre.trim() : undefined,
          releaseYear: item.year != null ? parseInt(String(item.year), 10) || undefined : undefined,
        }));
    } catch (err: any) {
      this.log.error(`curateBatch failed: ${err.message}`);
      return [];
    }
  }

  // ─── STEP 3: Generate more keywords ───────────────────────────

  async generateMoreKeywords(
    userInput: string,
    usedKeywords: string[],
    currentCount: number,
    targetCount: number
  ): Promise<string[]> {
    this.log.info(`Generating more keywords (${currentCount}/${targetCount} found)...`);

    const user = `Đang tìm bài hát Việt Nam trên VCPMC cho: "${userInput}"
Đã dùng: ${usedKeywords.map((k) => `"${k}"`).join(', ')}
Tìm được ${currentCount}/${targetCount}. Cần thêm bài.

Đề xuất 3-4 từ khóa MỚI cho VCPMC (tiếng Việt có dấu, tên ca sĩ hoặc chủ đề liên quan).
Trả về JSON array: ["kw1","kw2","kw3"]`;

    try {
      const text = await this.claude.ask(user, undefined, 512);
      const parsed = ClaudeClient.extractJson(text);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (k: any) => typeof k === 'string' && k.trim() && !usedKeywords.includes(k.trim())
      );
    } catch {
      return [];
    }
  }

  private normKey(s: string): string {
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

// ─── Helpers ───────────────────────────────────────────────────

function str(v: any, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function strArr(v: any, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  const filtered = v.filter((x: any) => typeof x === 'string' && x.trim());
  return filtered.length > 0 ? filtered : fallback;
}
