import { GoogleGenerativeAI } from '@google/generative-ai';
import { Logger } from './logger';

/**
 * Uses Gemini Flash to extract 3-5 concise search keywords from a theme.
 * These keywords are used for Genius/Last.fm API searches.
 */
export class KeywordExtractor {
  private genAI: GoogleGenerativeAI;
  private readonly log = new Logger('KeywordExtractor');

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async extract(theme: string): Promise<string[]> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const systemPrompt = `# NHIỆM VỤ
Trích xuất 4-5 từ khóa (keywords) ngắn gọn bằng tiếng Việt từ chủ đề người dùng cung cấp. Mục tiêu là dùng các từ khóa này để tìm kiếm bài hát trên các nền tảng âm nhạc như Spotify và Genius.

# RÀNG BUỘC
- Mỗi từ khóa là một cụm từ tiếng Việt từ 1 đến 3 chữ.
- Từ khóa phải phản ánh trực tiếp nội dung âm nhạc (cảm xúc, bối cảnh, đối tượng).
- Không giải thích, không cung cấp văn bản khác.

# ĐỊNH DẠNG ĐẦU RA
Trả về DUY NHẤT một mảng JSON (JSON array) các chuỗi (string). Không kèm markdown block.
Ví dụ nếu chủ đề là "Nhạc buồn về tình yêu đơn phương":
["tình yêu", "buồn", "đơn phương", "chia tay", "nhớ nhung"]`;

      const result = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: `Chủ đề: "${theme}"` }] }
        ],
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          topK: 40,
        },
      });

      const content = result.response.text();
      const match = content.match(/\[[\s\S]*?\]/);
      
      if (!match) {
        this.log.warn('No JSON array found, falling back to raw theme');
        return [theme];
      }

      const parsed = JSON.parse(match[0]);

      if (!Array.isArray(parsed)) {
        this.log.warn('Parsed result is not an array');
        return [theme];
      }

      const keywords = parsed
        .filter((item: any) => typeof item === 'string' && item.trim().length > 0)
        .map((item: string) => item.trim());

      if (keywords.length === 0) {
        this.log.warn('No valid keywords extracted, falling back to raw theme');
        return [theme];
      }

      this.log.info(`Extracted keywords: ${keywords.join(', ')}`);
      return keywords;
    } catch (err: any) {
      this.log.warn(`Extraction failed: ${err.message}, falling back to raw theme`);
      return [theme];
    }
  }
}
