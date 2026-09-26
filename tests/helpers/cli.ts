import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, type Hooks, type Io } from '../../src/cli/run.ts';

export interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CliOptions {
  readonly env?: Record<string, string | undefined>;
  readonly hooks?: Hooks;
  /** Pretend stdout/stderr/stdin are terminals. */
  readonly tty?: boolean;
  readonly columns?: number;
  readonly colorDepth?: number;
  /** Reuse settings and cache between runs (see tempHome). */
  readonly home?: string;
}

/** A fresh, empty home for settings and cache. */
export function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'skycast-test-'));
}

/** Runs the CLI in memory, like a user in a terminal (or a pipe). */
export async function runCli(
  argv: readonly string[],
  options: CliOptions = {}
): Promise<CliResult> {
  let stdout = '';
  let stderr = '';
  const home = options.home ?? tempHome();
  const stream = (write: (text: string) => void) => ({
    write: (text: string) => {
      write(text);
      return true;
    },
    isTTY: options.tty ?? false,
    columns: options.columns ?? 80,
    getColorDepth: () => options.colorDepth ?? 24,
  });
  const io: Io = {
    stdout: stream(text => (stdout += text)),
    stderr: stream(text => (stderr += text)),
    stdin: { isTTY: options.tty ?? false },
    env: {
      LANG: 'en_US.UTF-8',
      SKYCAST_CONFIG_DIR: join(home, 'config'),
      SKYCAST_CACHE_DIR: join(home, 'cache'),
      ...options.env,
    },
    platform: 'linux',
  };
  const code = await run(argv, io, {
    now: () => new Date('2026-09-26T21:30:00Z'),
    sleep: () => Promise.resolve(),
    ...options.hooks,
  });
  return { code, stdout, stderr };
}
