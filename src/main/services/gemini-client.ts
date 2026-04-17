import axios, { AxiosInstance } from 'axios';
import { Logger } from './logger';

/**
 * Thin HTTP client for Google Gemini REST API.
 * Uses generateContent endpoint — no @google/generative-ai package needed.
 */
export class GeminiClient {
  private readonly http: AxiosInstance;
  private readonly model: string;
  private readonly log = new Logger('GeminiClient');

  constructor(apiKey: string, model = 'gemini-2.5-flash') {
    this.model = model;
    this.http = axios.create({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      params: { key: apiKey },
      timeout: 120_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Send a prompt and get back the text response.
   *
   * Implementation notes:
   * - Gemini 2.5 models enable "thinking" by default, which silently consumes
   *   maxOutputTokens before any visible text is emitted. We explicitly set
   *   thinkingBudget=0 so the entire budget is usable for the answer.
   * - `responseMimeType: application/json` hints the model to return raw JSON
   *   when we enable it via `expectJson`, improving parse success rate.
   * - We surface finishReason in errors so upstream retries can reason about
   *   MAX_TOKENS / SAFETY / RECITATION failures.
   */
  async ask(userMessage: string, system?: string, maxTokens = 4096, expectJson = true): Promise<string> {
    const body: Record<string, any> = {
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.3,
        // Disable Gemini 2.5 "thinking" — otherwise reasoning tokens eat the
        // entire budget and candidatesTokenCount comes back undefined.
        thinkingConfig: { thinkingBudget: 0 },
        ...(expectJson ? { responseMimeType: 'application/json' } : {}),
      },
    };

    if (system) {
      body.system_instruction = { parts: [{ text: system }] };
    }

    try {
      const { data } = await this.http.post(
        `/models/${this.model}:generateContent`,
        body,
      );

      const candidate = data?.candidates?.[0];
      const text: string = candidate?.content?.parts?.[0]?.text ?? '';
      const finishReason: string | undefined = candidate?.finishReason;

      const usage = data?.usageMetadata;
      if (usage) {
        this.log.debug(
          `Tokens: in=${usage.promptTokenCount} out=${usage.candidatesTokenCount ?? 0} think=${usage.thoughtsTokenCount ?? 0} finish=${finishReason ?? 'n/a'}`,
        );
      }

      if (!text) {
        // Empty text is almost always MAX_TOKENS (thinking-budget) or SAFETY.
        throw new Error(
          `Gemini returned empty text (finishReason=${finishReason ?? 'unknown'}, out=${usage?.candidatesTokenCount ?? 0})`,
        );
      }

      return text;
    } catch (err: any) {
      const msg = err.response?.data?.error?.message ?? err.message;
      const status = err.response?.status;
      this.log.error(`API error${status ? ` [${status}]` : ''}: ${msg}`);
      throw new Error(`Gemini API error: ${msg}`);
    }
  }

  /** Parse JSON from model response, handling markdown code blocks. */
  static extractJson(text: string): any {
    const stripped = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    for (const [open, close] of (() => {
      const o = stripped.indexOf('{'), a = stripped.indexOf('[');
      return (o >= 0 && (a < 0 || o < a))
        ? [['{','}'],['[',']']] : [['[',']'],['{','}']];
    })() as [string,string][]) {
      const start = stripped.indexOf(open);
      if (start === -1) continue;
      let depth = 0, inStr = false, esc = false, end = -1;
      for (let i = start; i < stripped.length; i++) {
        const ch = stripped[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === open) depth++;
        else if (ch === close) { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end !== -1) {
        try { return JSON.parse(stripped.slice(start, end + 1)); } catch { /* try next */ }
      }
    }
    throw new Error(`No valid JSON in response: ${stripped.slice(0, 100)}`);
  }
}
