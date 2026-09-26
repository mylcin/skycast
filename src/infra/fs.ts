import { randomBytes } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

const LOCKED = new Set(['EPERM', 'EACCES', 'EBUSY']);

const code = (error: unknown): string | undefined =>
  error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;

/** Windows virus scanners and indexers hold files open for a moment. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      if (attempt >= 5 || !LOCKED.has(code(error) ?? '')) throw error;
      await new Promise(resolve => setTimeout(resolve, 20 * 2 ** attempt));
    }
  }
}

/**
 * Writes a whole file or nothing: to a temporary file next to it, flushed,
 * then renamed over the target. A crash never leaves half a config behind.
 */
export async function writeFileAtomic(
  file: string,
  data: string,
  mode = 0o600
): Promise<void> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    const handle = await open(temp, 'wx', mode);
    try {
      await handle.writeFile(data, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameWithRetry(temp, file);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function isMissing(error: unknown): boolean {
  return code(error) === 'ENOENT';
}
