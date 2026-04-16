/**
 * Retry utility with exponential backoff.
 * Used for flaky network requests (VCPMC, Genius, Spotify, Google).
 */
export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Only retry on these error conditions. Default: retry on all errors. */
  retryIf?: (error: any) => boolean;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'retryIf'>> = {
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 5000,
};

/**
 * Execute an async function with retry + exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = { ...DEFAULT_OPTIONS, ...options };
  const retryIf = options.retryIf ?? (() => true);

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      if (attempt >= maxRetries || !retryIf(err)) {
        throw err;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 200,
        maxDelayMs
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Check if an axios error is retryable (network/5xx, not 4xx).
 */
export function isRetryableHttpError(error: any): boolean {
  if (!error.response) return true; // network error, timeout
  const status = error.response.status;
  return status >= 500 || status === 429; // server error or rate limited
}
