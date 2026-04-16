import axios, { AxiosInstance } from 'axios';
import { Logger } from './logger';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Thin HTTP client for the TrollLLM/Anthropic-compatible API.
 * Endpoint: https://chat.trollllm.xyz/v1/messages
 */
export class ClaudeClient {
  private readonly http: AxiosInstance;
  private readonly model = 'claude-sonnet-4.6';
  private readonly log = new Logger('ClaudeClient');

  constructor(apiKey: string) {
    this.http = axios.create({
      baseURL: 'https://chat.trollllm.xyz/v1',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      timeout: 120_000,
    });
  }

  /**
   * Send a single user message with an optional system prompt.
   * Returns the assistant's text response.
   */
  async ask(userMessage: string, system?: string, maxTokens = 4096): Promise<string> {
    const messages: ClaudeMessage[] = [{ role: 'user', content: userMessage }];

    const body: Record<string, any> = {
      model: this.model,
      max_tokens: maxTokens,
      messages,
    };
    if (system) body.system = system;

    try {
      const { data } = await this.http.post<ClaudeResponse>('/messages', body);
      const text = data.content.find((c) => c.type === 'text')?.text ?? '';
      this.log.debug(`Tokens: in=${data.usage.input_tokens} out=${data.usage.output_tokens}`);
      return text;
    } catch (err: any) {
      const msg = err.response?.data?.error?.message ?? err.message;
      this.log.error(`API error: ${msg}`);
      throw new Error(`Claude API error: ${msg}`);
    }
  }

  /**
   * Parse JSON from a Claude response, handling markdown code blocks.
   */
  static extractJson(text: string): any {
    // Strip markdown code blocks
    const stripped = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    // Try to find the LARGEST valid JSON array or object
    // by scanning for balanced brackets
    for (const [open, close] of [['[', ']'], ['{', '}']]) {
      const start = stripped.indexOf(open);
      if (start === -1) continue;

      let depth = 0;
      let end = -1;
      for (let i = start; i < stripped.length; i++) {
        if (stripped[i] === open) depth++;
        else if (stripped[i] === close) {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      if (end !== -1) {
        try {
          return JSON.parse(stripped.slice(start, end + 1));
        } catch {
          // try next pattern
        }
      }
    }

    throw new Error(`No valid JSON found in response: ${stripped.slice(0, 100)}`);
  }
}
