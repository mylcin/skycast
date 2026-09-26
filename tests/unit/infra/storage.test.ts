import {
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError } from '../../../src/core/errors.ts';
import { createConfigStore } from '../../../src/infra/config-store.ts';
import { createFileCache } from '../../../src/infra/file-cache.ts';
import { writeFileAtomic } from '../../../src/infra/fs.ts';
import { tempHome } from '../../helpers/cli.ts';

const posix = process.platform !== 'win32';

describe('writeFileAtomic', () => {
  it('creates missing folders and leaves no temporary files', async () => {
    const dir = join(tempHome(), 'a', 'b');
    await writeFileAtomic(join(dir, 'file.json'), '{"ok":true}');
    expect(readFileSync(join(dir, 'file.json'), 'utf8')).toBe('{"ok":true}');
    expect(readdirSync(dir)).toEqual(['file.json']);
  });

  it.runIf(posix)('keeps the file private', async () => {
    const file = join(tempHome(), 'secret.json');
    await writeFileAtomic(file, '{}');
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('replaces the whole file', async () => {
    const file = join(tempHome(), 'file.json');
    await writeFileAtomic(file, 'first version, quite long');
    await writeFileAtomic(file, 'second');
    expect(readFileSync(file, 'utf8')).toBe('second');
  });
});

describe('file cache', () => {
  const key = 'ab'.repeat(32);

  it('stores, reads back and clears entries', async () => {
    const cache = createFileCache(join(tempHome(), 'http'));
    expect(await cache.get(key)).toBeNull();
    await cache.set(key, { storedAt: 1000, data: { value: 1 } });
    expect(await cache.get(key)).toEqual({
      storedAt: 1000,
      data: { value: 1 },
    });
    expect(await cache.clear()).toBe(1);
    expect(await cache.get(key)).toBeNull();
  });

  it('treats unreadable entries as misses', async () => {
    const dir = join(tempHome(), 'http');
    const cache = createFileCache(dir);
    await cache.set(key, { storedAt: 1, data: 1 });
    writeFileSync(join(dir, `${key}.json`), '{ not json');
    expect(await cache.get(key)).toBeNull();
    writeFileSync(join(dir, `${key}.json`), '{"v":99,"storedAt":1,"data":1}');
    expect(await cache.get(key)).toBeNull();
  });

  it('refuses keys that could escape the folder', async () => {
    const cache = createFileCache(join(tempHome(), 'http'));
    await expect(
      cache.set('../../etc/passwd', { storedAt: 1, data: 1 })
    ).rejects.toThrow('Invalid cache key');
  });

  it('clears a folder that does not exist yet', async () => {
    expect(await createFileCache(join(tempHome(), 'missing')).clear()).toBe(0);
  });

  it('prunes week-old entries on the first write', async () => {
    const dir = join(tempHome(), 'http');
    const old = 'cd'.repeat(32);
    await createFileCache(dir).set(old, { storedAt: 1, data: 1 });
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
    utimesSync(join(dir, `${old}.json`), eightDaysAgo, eightDaysAgo);
    await createFileCache(dir).set(key, { storedAt: 2, data: 2 });
    expect(readdirSync(dir)).toEqual([`${key}.json`]);
  });
});

describe('config store', () => {
  const file = () => join(tempHome(), 'config.json');
  const paris = {
    name: 'Paris',
    latitude: 48.85,
    longitude: 2.35,
    countryCode: 'FR',
  };

  it('starts empty when there is no file', async () => {
    expect(await createConfigStore(file()).load()).toEqual({ favorites: [] });
  });

  it('round-trips settings and favourites', async () => {
    const store = createConfigStore(file());
    await store.save({
      city: paris,
      units: 'imperial',
      lang: 'tr',
      favorites: [paris],
    });
    expect(await store.load()).toEqual({
      city: paris,
      units: 'imperial',
      lang: 'tr',
      favorites: [paris],
    });
    expect(JSON.parse(readFileSync(store.path, 'utf8'))).toMatchObject({
      version: 1,
    });
  });

  it('ignores keys from newer versions', async () => {
    const path = file();
    writeFileSync(
      path,
      JSON.stringify({ version: 1, favorites: [], theme: 'dark' })
    );
    expect(await createConfigStore(path).load()).toEqual({ favorites: [] });
  });

  it('explains what is wrong with a broken file', async () => {
    const path = file();
    writeFileSync(path, '{ "units": ');
    await expect(createConfigStore(path).load()).rejects.toThrow(ConfigError);
    writeFileSync(path, JSON.stringify({ units: 'kelvin' }));
    const error = (await createConfigStore(path)
      .load()
      .catch((e: unknown) => e)) as ConfigError;
    expect(error.path).toBe(path);
    expect(error.detail).toContain('units');
  });

  it('removes the file', async () => {
    const store = createConfigStore(file());
    expect(await store.remove()).toBe(false);
    await store.save({ favorites: [] });
    expect(await store.remove()).toBe(true);
  });
});
