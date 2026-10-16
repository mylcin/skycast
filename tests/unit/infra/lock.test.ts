import { chmodSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { StorageError } from '../../../src/core/errors.ts';
import { withFileLock } from '../../../src/infra/fs.ts';
import { tempHome } from '../../helpers/cli.ts';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, stat: vi.fn(actual.stat) };
});

/** A settings file whose lock was left behind by a crash a minute ago. */
function crashed(): { file: string; lock: string } {
  const file = join(tempHome(), 'config.json');
  const lock = `${file}.lock`;
  writeFileSync(lock, '');
  const aMinuteAgo = new Date(Date.now() - 60_000);
  utimesSync(lock, aMinuteAgo, aMinuteAgo);
  return { file, lock };
}

describe('withFileLock', () => {
  it('lets a slower waiter find the stale lock already taken over', async () => {
    const actual = await vi.importActual<typeof fs>('node:fs/promises');
    const { file, lock } = crashed();

    let holders = 0;
    let most = 0;
    let locked = (): void => undefined;
    const firstLocked = new Promise<void>(resolve => {
      locked = resolve;
    });
    const task = async () => {
      most = Math.max(most, ++holders);
      locked();
      await new Promise(resolve => setTimeout(resolve, 50));
      holders--;
    };

    // The slow waiter finds the lock stale, but hears so only after a
    // faster one has taken it over and locked again.
    let fast: Promise<void> | undefined;
    vi.mocked(fs.stat).mockImplementation(async (path, options) => {
      const info = await actual.stat(path, options);
      if (path === lock && !fast) {
        fast = withFileLock(file, task);
        await firstLocked;
      }
      return info;
    });
    try {
      await withFileLock(file, task);
      await fast;
    } finally {
      vi.mocked(fs.stat).mockImplementation(actual.stat);
    }

    expect(fast).toBeDefined();
    expect(most).toBe(1);
    expect(readdirSync(dirname(file))).toEqual([]);
  });

  it('recovers from a crash in the middle of a takeover', async () => {
    const { file, lock } = crashed();
    writeFileSync(`${lock}.takeover`, '');
    const aMinuteAgo = new Date(Date.now() - 60_000);
    utimesSync(`${lock}.takeover`, aMinuteAgo, aMinuteAgo);

    await expect(withFileLock(file, () => Promise.resolve(1))).resolves.toBe(1);
    expect(readdirSync(dirname(file))).toEqual([]);
  });

  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)(
    'reports a takeover it cannot start as a storage error',
    async () => {
      const { file, lock } = crashed();
      chmodSync(dirname(file), 0o500);
      const error = await withFileLock(file, () => Promise.resolve()).catch(
        (e: unknown) => e
      );
      chmodSync(dirname(file), 0o700);
      expect(error).toBeInstanceOf(StorageError);
      expect(error).toMatchObject({
        path: `${lock}.takeover`,
        reason: 'EACCES',
      });
    }
  );
});
