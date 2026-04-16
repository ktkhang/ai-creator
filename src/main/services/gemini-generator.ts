import { GoogleGenerativeAI } from '@google/generative-ai';
import { AppSettings, SongCandidate } from '../../shared/types';
import { Logger } from './logger';

/**
 * Uses Gemini Flash 2.5 to generate song candidates based on a theme.
 * Fast, reasoning-capable model.
 */
export class GeminiCandidateGenerator {
  private settings: AppSettings;
  private readonly log = new Logger('GeminiGenerator');

  constructor(settings: AppSettings) {
    this.settings = settings;
  }

  async generate(theme: string, minResults: number): Promise<SongCandidate[]> {
    if (!this.settings.geminiApiKey) {
      throw new Error('Gemini API key chua duoc cau hinh. Vao Settings de thiet lap.');
    }

    // Determine the number of songs per era to maintain diversity
    const total = Math.max(minResults, 30);
    const oldEra = Math.floor(total * 0.3); // pre-2000
    const midEra = Math.floor(total * 0.4); // 2000-2015
    const newEra = total - oldEra - midEra; // 2016-present

    const genAI = new GoogleGenerativeAI(this.settings.geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const systemPrompt = `# VAI TRÒ
Bạn là một chuyên gia nghiên cứu âm nhạc Việt Nam. Bạn có kiến thức sâu rộng về mọi thể loại nhạc Việt (nhạc tiền chiến, nhạc đỏ, nhạc vàng, bolero, nhạc nhẹ, V-pop, indie, rap/hip-hop) từ thế kỷ 20 đến nay.

# NHIỆM VỤ
Cho một chủ đề người dùng yêu cầu, hãy phân tích chủ đề đó và cung cấp danh sách CHÍNH XÁC ${total} bài hát Việt Nam có nội dung/cảm xúc/lời bài hát thực sự phù hợp với chủ đề.

# RÀNG BUỘC NGHIÊM NGẶT
1. **ĐỘ CHÍNH XÁC**: 
   - Mỗi bài hát PHẢI là bài hát CÓ THẬT, đã được phát hành chính thức tại Việt Nam. 
   - Không được bịa ra tên bài hát hoặc tên tác giả.
   - Bài hát phải hoàn toàn khớp với chủ đề được yêu cầu.
2. **ĐA DẠNG THỜI ĐẠI**: Hãy đảm bảo danh sách bao trùm nhiều thế hệ âm nhạc:
   - Khoảng ${oldEra} bài từ trước năm 2000 (nhạc tiền chiến, nhạc vàng, làn sóng xanh đời đầu).
   - Khoảng ${midEra} bài từ năm 2000 đến 2015 (thời kỳ hoàng kim V-pop, pop ballad).
   - Khoảng ${newEra} bài từ năm 2016 đến nay (indie, rap, V-pop hiện đại).
3. **ĐA DẠNG TÁC GIẢ**: Tối đa 2 bài hát cho cùng một tác giả. Phân bổ đều cho nhiều nhạc sĩ khác nhau.
4. **TÊN TÁC GIẢ**: 
   - Ghi tên **TÁC GIẢ SÁNG TÁC** (người viết nhạc/lời), **KHÔNG** phải ca sĩ trình bày. 
   - Ví dụ: bài "Chạy Ngay Đi", tác giả là "Sơn Tùng M-TP", KHÔNG phải tên ca sĩ cover. Bài "Nơi Tình Yêu Bắt Đầu", tác giả là "Tiến Minh", ca sĩ là Bùi Anh Tuấn -> ghi tác giả "Tiến Minh".
5. **ĐỘ PHỔ BIẾN**: Ưu tiên những bài hát nổi tiếng, dễ dàng tìm thấy thông tin trên mạng và có khả năng đã được đăng ký tác quyền tại VCPMC.

# ĐỊNH DẠNG ĐẦU RA
Bạn phải trả về DUY NHẤT một mảng JSON (JSON array) hợp lệ, không có code block markdown (\`\`\`json), không có văn bản giải thích.
Cấu trúc mẫu:
[
  {"title": "Diễm Xưa", "author": "Trịnh Công Sơn", "year": 1960},
  {"title": "Chạy Ngay Đi", "author": "Sơn Tùng M-TP", "year": 2018}
]
- "title" (string): Tên bài hát
- "author" (string): Tên nhạc sĩ sáng tác
- "year" (number): Năm sáng tác hoặc phát hành (ước chừng)`;

    try {
      this.log.info(`Generating ${total} candidates with Gemini 2.5 Flash...`);
      const result = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: `Chủ đề: "${theme}"` }] }
        ],
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.4,
          topP: 0.8,
          topK: 40,
        },
      });

      const content = result.response.text();
      this.log.debug(`Gemini response length: ${content.length}`);

      // Extract JSON
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) {
        this.log.warn('No JSON array found in Gemini response. Raw:', content);
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!Array.isArray(parsed)) {
        this.log.warn('Parsed result is not an array');
        return [];
      }

      const validated: SongCandidate[] = [];
      for (const item of parsed) {
        if (item == null || typeof item !== 'object') continue;

        const title = typeof item.title === 'string' ? item.title.trim() : '';
        const author = typeof item.author === 'string' ? item.author.trim() : '';
        const year = typeof item.year === 'number' ? item.year : undefined;

        if (!title || !author) continue;
        validated.push({ title, author, yearApprox: year, source: 'llm' });
      }

      this.log.info(`Parsed ${validated.length} valid candidates from Gemini`);
      return validated;

    } catch (err: any) {
      this.log.error('Gemini generation failed:', err.message);
      throw new Error(`Lỗi gọi Gemini API: ${err.message}`);
    }
  }
}
