import axios, { AxiosInstance } from 'axios';
import { Logger } from './logger';
import { withRetry, isRetryableHttpError } from './retry';

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
  private readonly model: string;
  private readonly log = new Logger('ClaudeClient');

  constructor(apiKey: string, model = 'claude-sonnet-4.6') {
    this.model = model;
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
   *
   * Retries transient failures (network errors, 5xx, 429) with exponential
   * backoff — the TrollLLM proxy occasionally returns generic "Request failed"
   * errors under load, and a single retry is almost always enough.
   */
  async ask(userMessage: string, system?: string, maxTokens = 4096): Promise<string> {
    const messages: ClaudeMessage[] = [{ role: 'user', content: userMessage }];

    const body: Record<string, any> = {
      model: this.model,
      max_tokens: maxTokens,
      messages,
    };
    if (system) body.system = system;

    return withRetry(
      async () => {
        try {
          const { data } = await this.http.post<ClaudeResponse>('/messages', body);
          const text = data.content.find((c) => c.type === 'text')?.text ?? '';
          this.log.debug(`Tokens: in=${data.usage.input_tokens} out=${data.usage.output_tokens}`);
          if (!text) {
            throw new Error(`Claude returned empty response (stop=${data.stop_reason})`);
          }
          return text;
        } catch (err: any) {
          const status = err.response?.status;
          const msg = err.response?.data?.error?.message ?? err.message;
          this.log.error(`API error${status ? ` [${status}]` : ''}: ${msg}`);
          // Wrap so retry logic can still inspect original via `cause`
          const wrapped = new Error(`Claude API error: ${msg}`);
          (wrapped as any).response = err.response;
          (wrapped as any).cause = err;
          throw wrapped;
        }
      },
      {
        maxRetries: 2,
        baseDelayMs: 1500,
        maxDelayMs: 6000,
        retryIf: (err: any) => {
          // Retry network/timeout/5xx/429; also retry the generic
          // "Request failed" message from TrollLLM which has no status code.
          if (!err.response) return true;
          if (isRetryableHttpError(err)) return true;
          const msg = String(err.message ?? '');
          return /request failed/i.test(msg);
        },
      },
    );
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

    // Determine whether to try object or array first based on what appears first
    const objStart = stripped.indexOf('{');
    const arrStart = stripped.indexOf('[');

    const pairs: [string, string][] = [];
    if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
      pairs.push(['{', '}'], ['[', ']']);
    } else {
      pairs.push(['[', ']'], ['{', '}']);
    }

    for (const [open, close] of pairs) {
      const start = stripped.indexOf(open);
      if (start === -1) continue;

      let depth = 0;
      let inStr = false;
      let esc = false;
      let end = -1;
      for (let i = start; i < stripped.length; i++) {
        const ch = stripped[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === open) depth++;
        else if (ch === close) {
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
