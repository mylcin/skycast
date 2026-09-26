import { createHash } from 'node:crypto';

export interface CacheEntry {
  /** Epoch milliseconds. */
  readonly storedAt: number;
  readonly data: unknown;
}

/** A key-value store for API responses. See file-cache.ts for the disk one. */
export interface Cache {
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, entry: CacheEntry): Promise<void>;
  /** Removes every entry and resolves to how many were removed. */
  clear(): Promise<number>;
}

/** A stable key for a request: parameter order doesn't matter. */
export function cacheKey(url: URL): string {
  const canonical = new URL(url);
  canonical.searchParams.sort();
  return createHash('sha256').update(canonical.href).digest('hex');
}

export function createMemoryCache(): Cache {
  const entries = new Map<string, CacheEntry>();
  return {
    get: key => Promise.resolve(entries.get(key) ?? null),
    set(key, entry) {
      entries.set(key, entry);
      return Promise.resolve();
    },
    clear() {
      const size = entries.size;
      entries.clear();
      return Promise.resolve(size);
    },
  };
}
