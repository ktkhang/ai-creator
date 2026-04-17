import { ClaudeClient } from './claude-client';
import { ItunesClient } from './itunes-client';
import { VcpmcRecord } from '../../shared/types';
import { IAiAgent, SearchCriteria, CuratedSong } from './ai-agent';
import { Logger } from './logger';

export type { SearchCriteria, CuratedSong };

interface EnrichedRecord {
  vcpmcRecord: VcpmcRecord;
  itunesInfo: any | null;
}

/**
 * Claude-powered agent (via TrollLLM API).
 */
export class ClaudeAgent implements IAiAgent {
  private readonly claude: ClaudeClient;
  private readonly itunes: ItunesClient;
  private readonly log = new Logger('ClaudeAgent');

  constructor(apiKey: string, model = 'claude-sonnet-4.6') {
    this.claude = new ClaudeClient(apiKey, model);
    this.itunes = new ItunesClient();
  }

  // ─── STEP 1: Extract criteria ──────────────────────────────────

  async extractCriteria(userInput: string): Promise<SearchCriteria> {
    this.log.info(`Extracting criteria: "${userInput}"`);

    const user = `Phân tích yêu cầu tìm bài hát Việt Nam: "${userInput}"

ĐỐI TƯỢNG MẶC ĐỊNH: Gen Z / giới trẻ (< 30 tuổi) — ƯU TIÊN bài hát 2018-nay trừ khi user nói khác.

Trả về JSON (không markdown, không giải thích):
{
  "description": "mô tả ngắn 1 câu",
  "vcpmcKeywords": ["từ khóa chủ đề 1", "từ khóa 2", "từ khóa 3"],
  "artistKeywords": ["Tên Ca Sĩ/Nhạc Sĩ 1", "Tên 2", "Tên 3", ...],
  "includeGenres": [],
  "excludeGenres": [],
  "targetAudience": "Gen Z",
  "eraPreference": "2018-2025"
}

HƯỚNG DẪN QUAN TRỌNG:

1. "artistKeywords" là phần QUAN TRỌNG NHẤT. Liệt kê 18-25 tên NHẠC SĨ (composer) + CA SĨ Việt Nam TRẺ, ƯU TIÊN THẾ HỆ HIT 2018-nay.
   - TỐI THIỂU 70% danh sách phải là nghệ sĩ/nhạc sĩ hoạt động mạnh từ 2018 trở đi (Gen Z-friendly)
   - TỐI ĐA 30% là nghệ sĩ kinh điển/cựu trào (chỉ thêm nếu user nhắc rõ "cũ", "kinh điển", "bolero", "nhạc vàng", "cách mạng")
   - Dùng tên đầy đủ, có dấu tiếng Việt
   - VCPMC lưu theo TÁC GIẢ/NHẠC SĨ, vì vậy ưu tiên NHẠC SĨ SÁNG TÁC (composer) hơn ca sĩ thể hiện
   - NHẠC SĨ TRẺ HOT bắt buộc cân nhắc nếu chủ đề là "nhạc trẻ / tình yêu / v-pop":
     Hứa Kim Tuyền, Khắc Hưng, Châu Đăng Khoa, Mr.Siro, Tiên Cookie, Nguyễn Văn Chung,
     Tăng Duy Tân, Bùi Công Nam, Vũ Cát Tường, Hoàng Dũng, Phan Mạnh Quỳnh,
     DTAP, GREY D, Phúc Du, Andiez, Kai Đinh, Đạt G, Rhymastic, JustaTee, Trang,
     ONLYC, Tage, Obito, Wren Evans, Madihu, Low G, HIEUTHUHAI, W/n.
   - CA SĨ TRẺ HOT để BỔ SUNG (chỉ khi họ cũng soạn nhạc hoặc có đăng ký VCPMC):
     Sơn Tùng M-TP, Hà Anh Tuấn, Đen Vâu, Amee, Erik, Hoàng Thùy Linh, MONO, Tlinh,
     Mỹ Anh, Juky San, Min, Bùi Lan Hương.
   - Ví dụ "nhạc trẻ V-pop tình yêu" (Gen Z preset):
     ["Hứa Kim Tuyền","Khắc Hưng","Châu Đăng Khoa","Mr.Siro","Tiên Cookie","Hoàng Dũng","Phan Mạnh Quỳnh","Vũ Cát Tường","Tăng Duy Tân","Bùi Công Nam","DTAP","GREY D","Kai Đinh","Andiez","Nguyễn Văn Chung","Sơn Tùng M-TP","Hà Anh Tuấn","Đen Vâu","Amee","Erik","Trang","ONLYC"]
   - Ví dụ "nhạc đỏ cách mạng" (kinh điển): ["Phạm Tuyên","Đỗ Nhuận","Huy Du","Văn Cao","Trần Hoàn","Hoàng Vân","Thuận Yến"]
   - Ví dụ "bolero" (kinh điển): ["Vinh Sử","Hàn Châu","Thanh Sơn","Trúc Phương","Quang Lê","Lệ Quyên","Phi Nhung"]

2. "vcpmcKeywords" là 3-6 từ khóa CHỦ ĐỀ ngắn, XUẤT HIỆN TRONG TÊN BÀI HÁT (full-text search của VCPMC):
   - "tình yêu" → ["yêu em", "nhớ em", "tình yêu", "yêu anh", "đợi em"] (tránh chỉ "yêu" — quá phổ biến, mang rác)
   - "mùa hè" → ["mùa hè", "nắng hạ", "biển", "hạ vàng"]
   - "quê hương" → ["quê hương", "quê mẹ", "làng quê"]
   - TRÁNH từ quá chung (1 âm) vì sẽ kéo rác; DÙNG 2-3 âm tiết có ngữ cảnh.
   - KHÔNG dùng "nhạc trẻ", "v-pop", "genz" — không xuất hiện trong tên bài.

3. "eraPreference": mặc định "2018-2025" trừ khi user yêu cầu cũ.`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const text = await this.claude.ask(user, undefined, 1024);
        const parsed = ClaudeClient.extractJson(text);

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
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000));
        }
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

    const user = `NHIỆM VỤ: Chọn các bài hát PHÙ HỢP CHỦ ĐỀ từ danh sách VCPMC cho đối tượng GEN Z / GIỚI TRẺ.

YÊU CẦU KHÁCH HÀNG: "${userInput}"
TIÊU CHÍ: ${criteria.description}${includeStr}${excludeStr}${audienceStr}${eraStr}

DANH SÁCH BÀI HÁT (từ VCPMC):
${recordList}

CÁCH CHẤM ĐIỂM (1-10) — ƯU TIÊN: khớp chủ đề + hợp gu Gen Z:
- 9-10: Tên bài RẤT khớp chủ đề + nhạc sĩ trẻ hit 2018-nay (Hứa Kim Tuyền, Khắc Hưng, Mr.Siro, Hoàng Dũng, Vũ Cát Tường, Tăng Duy Tân, Bùi Công Nam, Tiên Cookie, Châu Đăng Khoa, DTAP, GREY D, Andiez, Kai Đinh, Đạt G, ...)
- 7-8: Khớp chủ đề + nhạc sĩ thế hệ 2010s hoặc V-pop mainstream
- 5-6: Khớp chủ đề nhưng nhạc sĩ cựu trào / ít phổ biến với Gen Z
- 1-4: KHÔNG khớp chủ đề / liên khúc (LK) / remix / karaoke / beat / cover / cùng tác giả đã có nhiều bài / quá cũ (< 2000) trừ khi user yêu cầu rõ

LUẬT LOẠI BỎ BẮT BUỘC (score = 1):
- Tên bắt đầu bằng "LK" hoặc chứa "Liên Khúc", "Medley", "Mashup" — đây là liên khúc ghép nhiều bài, KHÔNG HỢP LỆ
- Tên chứa "Remix", "Beat", "Karaoke", "Instrumental", "Cover", "Demo", "Nhạc Chuông", "Ringtone", "Ver.2", "Ver 3", ...
- Bài có tên giống/gần giống bài đã chấm cao (chỉ giữ 1 phiên bản gốc)

LUẬT ƯU TIÊN ĐA DẠNG:
- Mỗi nhạc sĩ chỉ nên có TỐI ĐA 2-3 bài trong output → nếu đã thấy 1 nhạc sĩ xuất hiện nhiều lần, hạ điểm các bài sau của họ
- Nếu tiêu đề chung chung ("Yêu Em", "Nhớ Em") và có nhiều bài trùng tên của tác giả khác nhau → chỉ giữ 1 bài của nhạc sĩ nổi tiếng nhất

LUẬT THỜI ĐẠI:
- Mặc định (không chỉ định) → ưu tiên bài 2018-2025 (Gen Z era)
- Chỉ chấp nhận bài pre-2010 khi: (a) user yêu cầu rõ ("bolero", "nhạc vàng", "cũ", "kinh điển"), HOẶC (b) đó là bài nhạc đỏ/cách mạng/quê hương mang tính biểu tượng.
- Bài sau 2010-2017 chấp nhận nhưng điểm cap ở 8

TRẢ VỀ JSON array (KHÔNG markdown):
[{
  "vcpmcTitle": "tên bài hát đúng như trên VCPMC",
  "vcpmcAuthor": "tên nhạc sĩ đúng như trên VCPMC",
  "relevanceScore": 8,
  "reason": "lý do 1 câu ngắn",
  "genre": "V-pop/indie/nhạc đỏ/bolero/...",
  "year": 2022
}]
Nếu không có bài đủ điểm: []

Lưu ý: "genre" và "year" điền dựa trên kiến thức của bạn. Nếu không chắc → null. Bài < ${minScore} điểm → loại bỏ.`;

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

    const user = `Đang tìm bài hát Việt Nam trên VCPMC cho chủ đề: "${userInput}"
Đã search tên: ${usedKeywords.map((k) => `"${k}"`).join(', ')}
Tìm được ${currentCount}/${targetCount}. Cần đề xuất tên mới.

Đề xuất 6-10 TÊN NHẠC SĨ / CA SĨ VIỆT NAM TRẺ (ưu tiên hoạt động 2018-nay, Gen Z-friendly) CHƯA có trong danh sách đã search.
- KHÔNG lặp lại tên đã search (kể cả biến thể)
- ƯU TIÊN NHẠC SĨ SÁNG TÁC (composer), vì VCPMC lưu theo composer
- Tên nhạc sĩ trẻ gợi ý nếu phù hợp chủ đề: Hứa Kim Tuyền, Khắc Hưng, Mr.Siro, Tiên Cookie, Châu Đăng Khoa, Tăng Duy Tân, Bùi Công Nam, Hoàng Dũng, Vũ Cát Tường, DTAP, GREY D, Kai Đinh, Andiez, Đạt G, Phúc Du, Nguyễn Văn Chung, Wren Evans, Madihu, Rhymastic, Onionn, Only C, Trang, W/n.
- KHÔNG gợi ý nhạc sĩ cựu trào (trước 2000) trừ khi user nhắc đến "cũ", "bolero", "nhạc vàng", "cách mạng".

Trả về JSON array THUẦN (không markdown): ["Tên 1","Tên 2",...]`;

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
