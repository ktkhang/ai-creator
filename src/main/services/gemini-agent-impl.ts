import { GeminiClient } from './gemini-client';
import { ItunesClient } from './itunes-client';
import { VcpmcRecord } from '../../shared/types';
import { IAiAgent, SearchCriteria, CuratedSong } from './ai-agent';
import { Logger } from './logger';

interface EnrichedRecord {
  vcpmcRecord: VcpmcRecord;
  itunesInfo: any | null;
}

/**
 * Gemini-powered agent using Google's REST API (no SDK needed).
 * Same prompts and logic as ClaudeAgent — only the HTTP client differs.
 */
export class GeminiAgent implements IAiAgent {
  private readonly gemini: GeminiClient;
  private readonly itunes: ItunesClient;
  private readonly log = new Logger('GeminiAgent');

  constructor(apiKey: string, model = 'gemini-2.5-flash') {
    this.gemini = new GeminiClient(apiKey, model);
    this.itunes = new ItunesClient();
  }

  // ─── STEP 1: Extract criteria ──────────────────────────────────

  async extractCriteria(userInput: string): Promise<SearchCriteria> {
    this.log.info(`Extracting criteria: "${userInput}"`);

    const user = `Phân tích yêu cầu tìm bài hát Việt Nam: "${userInput}"

ĐỐI TƯỢNG MẶC ĐỊNH: Gen Z / giới trẻ < 30 tuổi — ƯU TIÊN bài 2018-nay trừ khi user nói khác.

Trả về JSON (không markdown, không giải thích):
{
  "description": "mô tả ngắn 1 câu",
  "vcpmcKeywords": ["từ khóa chủ đề 1", "từ khóa 2", "từ khóa 3"],
  "artistKeywords": ["Tên 1", "Tên 2", ...],
  "includeGenres": [],
  "excludeGenres": [],
  "targetAudience": "Gen Z",
  "eraPreference": "2018-2025"
}

"artistKeywords": 18-25 tên NHẠC SĨ + CA SĨ VN — TỐI THIỂU 70% là thế hệ hit 2018-nay.
- VCPMC lưu theo TÁC GIẢ/NHẠC SĨ — ưu tiên NHẠC SĨ SÁNG TÁC hơn ca sĩ thể hiện.
- Nhạc sĩ trẻ hot (ưu tiên): Hứa Kim Tuyền, Khắc Hưng, Châu Đăng Khoa, Mr.Siro, Tiên Cookie, Nguyễn Văn Chung, Tăng Duy Tân, Bùi Công Nam, Hoàng Dũng, Phan Mạnh Quỳnh, Vũ Cát Tường, DTAP, GREY D, Kai Đinh, Andiez, Đạt G, Phúc Du, Wren Evans, Madihu, Rhymastic, JustaTee, Trang, ONLYC.
- Ca sĩ trẻ bổ sung: Sơn Tùng M-TP, Hà Anh Tuấn, Đen Vâu, Amee, Erik, MONO, Tlinh, Mỹ Anh, Juky San.
- CHỈ thêm nhạc sĩ cựu trào (trước 2000) khi user nhắc "cũ/bolero/nhạc vàng/cách mạng".

"vcpmcKeywords": 3-6 cụm 2-3 âm tiết XUẤT HIỆN trong TÊN BÀI (full-text VCPMC).
- "tình yêu" → ["yêu em","nhớ em","tình yêu","yêu anh","đợi em"]
- TRÁNH 1 âm chung ("yêu"), tránh "nhạc trẻ"/"v-pop" (không xuất hiện trong tên).`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const text = await this.gemini.ask(user, undefined, 2048);
        const parsed = GeminiClient.extractJson(text);

        const criteria: SearchCriteria = {
          description: str(parsed.description, userInput),
          vcpmcKeywords: strArr(parsed.vcpmcKeywords, []),
          artistKeywords: strArr(parsed.artistKeywords ?? parsed.artists ?? parsed.suggestedArtists, []),
          includeGenres: strArr(parsed.includeGenres, []),
          excludeGenres: strArr(parsed.excludeGenres, []),
          targetAudience: str(parsed.targetAudience, ''),
          eraPreference: str(parsed.eraPreference, ''),
        };

        this.log.info(`Criteria: ${criteria.artistKeywords.length} artists, ${criteria.vcpmcKeywords.length} thematic`);
        return criteria;
      } catch (err: any) {
        this.log.error(`extractCriteria attempt ${attempt} failed: ${err.message}`);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return {
      description: userInput,
      vcpmcKeywords: [userInput],
      artistKeywords: [],
      includeGenres: [],
      excludeGenres: [],
      targetAudience: '',
      eraPreference: '',
    };
  }

  // ─── STEP 2: Enrich + Curate ───────────────────────────────────

  async enrichAndCurate(
    records: VcpmcRecord[],
    criteria: SearchCriteria,
    userInput: string,
    minScore = 6
  ): Promise<CuratedSong[]> {
    if (records.length === 0) return [];

    const MAX = 60;
    const capped = records.slice(0, MAX);
    this.log.info(`Curating ${capped.length} records (of ${records.length})...`);

    const BATCH = 20;
    const batches: VcpmcRecord[][] = [];
    for (let i = 0; i < capped.length; i += BATCH) {
      batches.push(capped.slice(i, i + BATCH));
    }

    const itunesPromise = Promise.race([
      this.itunes.batchLookup(capped.map((r) => ({ title: r.title, artist: r.musicAuthor }))),
      new Promise<Map<string, any>>((resolve) => setTimeout(() => resolve(new Map()), 10_000)),
    ]);

    const enriched: EnrichedRecord[] = capped.map((r) => ({ vcpmcRecord: r, itunesInfo: null }));

    const batchResults = await Promise.all(
      batches.map((_, i) =>
        this.curateBatch(enriched.slice(i * BATCH, (i + 1) * BATCH), criteria, userInput, minScore)
      )
    );

    const allCurated = batchResults.flat();

    try {
      const itunesMap = await itunesPromise;
      if (itunesMap.size > 0) {
        for (const song of allCurated) {
          const key = `${this.normKey(song.vcpmcTitle)}::${this.normKey(song.vcpmcAuthor)}`;
          const info = itunesMap.get(key);
          if (info) { song.genre = info.genre || undefined; song.releaseYear = info.releaseYear || undefined; }
        }
      }
    } catch { /* ignore */ }

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
      return [`${i + 1}.`, `Tên: "${r.title}"`, `Nhạc sĩ: "${r.musicAuthor}"`,
        r.singer ? `Ca sĩ: "${r.singer}"` : null].filter(Boolean).join(' | ');
    }).join('\n');

    const includeStr = criteria.includeGenres.length ? `\nBẮT BUỘC thuộc thể loại: ${criteria.includeGenres.join(', ')}` : '';
    const excludeStr = criteria.excludeGenres.length ? `\nLOẠI BỎ nếu thuộc: ${criteria.excludeGenres.join(', ')}` : '';
    const audienceStr = criteria.targetAudience ? `\nĐối tượng: ${criteria.targetAudience}` : '';
    const eraStr = criteria.eraPreference ? `\nThời kỳ ưa thích: ${criteria.eraPreference}` : '';

    const system = `Bạn là content creator âm nhạc Việt Nam. Hiểu rõ: V-pop, indie, bolero, nhạc vàng, cải lương, nhạc đỏ, rap, thiếu nhi. Trả lời JSON thuần túy.`;

    const user = `NHIỆM VỤ: Chọn bài hát KHỚP CHỦ ĐỀ cho GEN Z / GIỚI TRẺ từ VCPMC.

YÊU CẦU: "${userInput}"
TIÊU CHÍ: ${criteria.description}${includeStr}${excludeStr}${audienceStr}${eraStr}

DANH SÁCH:
${recordList}

CHẤM ĐIỂM (1-10):
- 9-10: Khớp chủ đề + nhạc sĩ trẻ hit 2018-nay (Hứa Kim Tuyền, Khắc Hưng, Mr.Siro, Hoàng Dũng, Vũ Cát Tường, Tăng Duy Tân, Bùi Công Nam, DTAP, GREY D, ...)
- 7-8: Khớp + nhạc sĩ V-pop 2010s / mainstream
- 5-6: Khớp nhưng nhạc sĩ cựu trào
- 1-4: KHÔNG khớp / liên khúc / remix / karaoke / beat / cover / quá cũ

LOẠI BẮT BUỘC (score=1):
- Tên bắt đầu "LK" / chứa "Liên Khúc"/"Medley"/"Mashup" — KHÔNG HỢP LỆ (liên khúc ghép bài).
- Chứa "Remix"/"Beat"/"Karaoke"/"Instrumental"/"Cover"/"Demo"/"Ver.2"/"Nhạc Chuông".

ƯU TIÊN ĐA DẠNG:
- Mỗi nhạc sĩ tối đa 2-3 bài. Nhiều bài của cùng nhạc sĩ → hạ điểm bài sau.
- Tiêu đề chung ("Yêu Em") trùng giữa nhiều tác giả → giữ 1 bài của nhạc sĩ nổi nhất.

THỜI ĐẠI:
- Mặc định ưu tiên 2018-2025. Pre-2010 chỉ khi user yêu cầu rõ (cũ/bolero/cách mạng).
- 2010-2017 cap điểm ở 8.

TRẢ VỀ JSON (không markdown):
[{"vcpmcTitle":"...","vcpmcAuthor":"...","relevanceScore":8,"reason":"...","genre":"V-pop/...","year":2022}]
Nếu không có → []. Bài < ${minScore} → loại.`;

    try {
      const text = await this.gemini.ask(user, system, 4096);
      const parsed = GeminiClient.extractJson(text);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((item: any) =>
          item && typeof item.vcpmcTitle === 'string' && item.vcpmcTitle.trim() &&
          typeof item.vcpmcAuthor === 'string' &&
          typeof item.relevanceScore === 'number' && item.relevanceScore >= minScore
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

    const user = `Đang tìm bài hát VN trên VCPMC cho chủ đề: "${userInput}"
Đã search: ${usedKeywords.map((k) => `"${k}"`).join(', ')}
Có ${currentCount}/${targetCount}. Cần thêm.

Đề xuất 6-10 TÊN NHẠC SĨ/CA SĨ VIỆT NAM TRẺ (ưu tiên 2018-nay, Gen Z) CHƯA có trong danh sách trên.
- KHÔNG lặp tên đã search.
- ƯU TIÊN NHẠC SĨ SÁNG TÁC (VCPMC lưu theo composer).
- Gợi ý: Hứa Kim Tuyền, Khắc Hưng, Mr.Siro, Tiên Cookie, Châu Đăng Khoa, Tăng Duy Tân, Bùi Công Nam, Hoàng Dũng, Vũ Cát Tường, DTAP, GREY D, Kai Đinh, Andiez, Đạt G, Phúc Du, Nguyễn Văn Chung, Wren Evans, Madihu, Rhymastic, Onionn, Only C, Trang, W/n.
- KHÔNG gợi ý cựu trào trừ khi user nói rõ.

Trả JSON array: ["Tên 1","Tên 2",...]`;

    try {
      const text = await this.gemini.ask(user, undefined, 512);
      const parsed = GeminiClient.extractJson(text);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((k: any) => typeof k === 'string' && k.trim() && !usedKeywords.includes(k.trim()));
    } catch {
      return [];
    }
  }

  private normKey(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }
}

function str(v: any, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function strArr(v: any, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  const filtered = v.filter((x: any) => typeof x === 'string' && x.trim());
  return filtered.length > 0 ? filtered : fallback;
}
