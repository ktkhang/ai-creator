/**
 * Simple LRU cache with TTL expiration.
 * Used to cache VCPMC author lookups so repeated searches don't re-scrape.
 */
export class LruCache<T> {
  private cache = new Map<string, { value: T; expiresAt: number }>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize = 200, ttlMs = 60 * 60 * 1000 /* 1 hour */) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    // Prune expired before reporting size
    for (const [key, entry] of this.cache) {
      if (Date.now() > entry.expiresAt) this.cache.delete(key);
    }
    return this.cache.size;
  }
}
