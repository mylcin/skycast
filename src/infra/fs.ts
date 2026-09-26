import { randomBytes } from 'node:crypto';
import { mkdir, open, realpath, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { StorageError } from '../core/errors.ts';

const LOCKED = new Set(['EPERM', 'EACCES', 'EBUSY']);

export const errorCode = (error: unknown): string | undefined =>
  error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;

export function isMissing(error: unknown): boolean {
  return errorCode(error) === 'ENOENT';
}

/** Windows virus scanners and indexers hold files open for a moment. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      if (attempt >= 5 || !LOCKED.has(errorCode(error) ?? '')) throw error;
      await new Promise(resolve => setTimeout(resolve, 20 * 2 ** attempt));
    }
  }
}

/**
 * Writes a whole file or nothing: to a temporary file next to it, flushed,
 * then renamed over the target. A crash never leaves half a file behind.
 * A symlinked target (a dotfiles repository) is written through, not
 * replaced. Failures are StorageErrors naming the real file.
 */
export async function writeFileAtomic(
  file: string,
  data: string,
  mode = 0o600
): Promise<void> {
  let target = file;
  try {
    target = await realpath(file);
  } catch (error) {
    if (!isMissing(error))
      throw new StorageError(file, errorCode(error) ?? 'EIO', { cause: error });
  }
  const temp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const handle = await open(temp, 'wx', mode);
    try {
      await handle.writeFile(data, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameWithRetry(temp, target);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw new StorageError(target, errorCode(error) ?? 'EIO', { cause: error });
  }
}

/** Waits this long for another skycast process before giving up. */
const LOCK_WAIT_MS = 3000;
/** A lock older than this was left by a process that died. */
const STALE_LOCK_MS = 10_000;

/**
 * Runs `task` while holding `<file>.lock`, so two skycast processes
 * changing settings at the same time can't overwrite each other.
 */
export async function withFileLock<T>(
  file: string,
  task: () => Promise<T>
): Promise<T> {
  const lock = `${file}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  try {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  } catch (error) {
    throw new StorageError(file, errorCode(error) ?? 'EIO', { cause: error });
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await (await open(lock, 'wx')).close();
      break;
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') {
        throw new StorageError(lock, errorCode(error) ?? 'EIO', {
          cause: error,
        });
      }
      const info = await stat(lock).catch(() => null);
      if (info && Date.now() - info.mtimeMs > STALE_LOCK_MS) {
        await rm(lock, { force: true });
        continue;
      }
      if (Date.now() > deadline) throw new StorageError(file, 'EBUSY');
      await new Promise(resolve =>
        setTimeout(resolve, Math.min(100, 15 + attempt * 10))
      );
    }
  }
  try {
    return await task();
  } finally {
    await rm(lock, { force: true });
  }
}
