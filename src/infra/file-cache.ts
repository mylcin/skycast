import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Cache, CacheEntry } from './cache.ts';
import { isMissing, writeFileAtomic } from './fs.ts';

const VERSION = 1;
/** Entries older than this are deleted now and then; none is useful by then. */
const MAX_AGE_MS = 7 * 86_400_000;
const KEY = /^[a-f0-9]{16,128}$/;

export interface FileCache extends Cache {
  readonly directory: string;
}

/**
 * One JSON file per response, named by the request's hash. Reads that fail
 * for any reason count as a miss: the cache is only ever an optimisation.
 */
export function createFileCache(
  directory: string,
  now: () => Date = () => new Date()
): FileCache {
  const file = (key: string): string => {
    if (!KEY.test(key)) throw new Error(`Invalid cache key: ${key}`);
    return join(directory, `${key}.json`);
  };
  let pruned = false;

  async function prune(): Promise<void> {
    pruned = true;
    const cutoff = now().getTime() - MAX_AGE_MS;
    const names = await readdir(directory).catch(() => []);
    await Promise.all(
      names
        .filter(name => name.endsWith('.json'))
        .map(async name => {
          const path = join(directory, name);
          const info = await stat(path).catch(() => null);
          if (info && info.mtimeMs < cutoff) await rm(path, { force: true });
        })
    );
  }

  return {
    directory,
    async get(key) {
      try {
        const body: unknown = JSON.parse(await readFile(file(key), 'utf8'));
        if (
          typeof body === 'object' &&
          body !== null &&
          'v' in body &&
          body.v === VERSION &&
          'storedAt' in body &&
          typeof body.storedAt === 'number' &&
          'data' in body
        ) {
          return {
            storedAt: body.storedAt,
            data: body.data,
          } satisfies CacheEntry;
        }
        return null;
      } catch {
        return null;
      }
    },
    async set(key, entry) {
      await writeFileAtomic(
        file(key),
        JSON.stringify({
          v: VERSION,
          storedAt: entry.storedAt,
          data: entry.data,
        })
      );
      if (!pruned) await prune().catch(() => undefined);
    },
    async clear() {
      let names: string[];
      try {
        names = await readdir(directory);
      } catch (error) {
        if (isMissing(error)) return 0;
        throw error;
      }
      const entries = names.filter(name => name.endsWith('.json'));
      await Promise.all(
        entries.map(name => rm(join(directory, name), { force: true }))
      );
      return entries.length;
    },
  };
}
