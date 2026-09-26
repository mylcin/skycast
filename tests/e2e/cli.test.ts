import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  HANGING_LATITUDE,
  startFixtureServer,
  type FixtureServer,
} from '../../scripts/fixture-server.ts';
import pkg from '../../package.json' with { type: 'json' };

/**
 * Runs the built, bundled CLI as a real child process on the current Node
 * version, against a local fixture server. `npm run build` first.
 */
const CLI = new URL('../../dist/cli.mjs', import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  '$1'
);

let server: FixtureServer;

beforeAll(async () => {
  if (!existsSync(CLI))
    throw new Error('dist/cli.mjs is missing: run `npm run build` first.');
  server = await startFixtureServer();
});

afterAll(async () => {
  await server.close();
});

interface Result {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function skycast(
  args: string[],
  options: {
    env?: Record<string, string>;
    closeStdout?: boolean;
    interruptAfterMs?: number;
  } = {}
): Promise<Result> {
  const home = mkdtempSync(join(tmpdir(), 'skycast-e2e-'));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: {
        PATH: process.env.PATH ?? '',
        LANG: 'en_US.UTF-8',
        TZ: 'Europe/Istanbul',
        SKYCAST_FORECAST_URL: server.forecastUrl,
        SKYCAST_GEOCODING_URL: server.geocodingUrl,
        SKYCAST_CONFIG_DIR: join(home, 'config'),
        SKYCAST_CACHE_DIR: join(home, 'cache'),
        ...options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    if (options.closeStdout) child.stdout.destroy();
    else
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    if (options.interruptAfterMs !== undefined) {
      setTimeout(() => child.kill('SIGINT'), options.interruptAfterMs);
    }
    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

describe('built CLI', () => {
  it('prints the package version', async () => {
    const { code, stdout } = await skycast(['--version']);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe(pkg.version);
  });

  it('shows the weather without colour when piped', async () => {
    const { code, stdout, stderr } = await skycast(['now', 'Istanbul']);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('Istanbul, Türkiye');
    expect(stdout).not.toContain('\u001b[');
  });

  it('prints parseable JSON', async () => {
    const { stdout } = await skycast([
      'forecast',
      'Istanbul',
      '--days',
      '3',
      '--json',
    ]);
    const json = JSON.parse(stdout) as {
      daily: unknown[];
      schemaVersion: number;
    };
    expect(json.schemaVersion).toBe(1);
    expect(json.daily.length).toBeGreaterThan(0);
  });

  it('compares places', async () => {
    const { code, stdout } = await skycast([
      'compare',
      'Istanbul',
      'Paris, France',
      'Tokyo',
    ]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/Istanbul, TR[\s\S]*Paris, FR[\s\S]*Tokyo, JP/);
  });

  it('exits 3 for an unknown place and 2 for bad usage', async () => {
    expect((await skycast(['now', 'Nowhereville'])).code).toBe(3);
    expect((await skycast(['forecast', 'Istanbul', '--days', '99'])).code).toBe(
      2
    );
  });

  it('prints completion scripts', async () => {
    const { code, stdout } = await skycast(['completion', 'zsh']);
    expect(code).toBe(0);
    expect(stdout.startsWith('#compdef skycast')).toBe(true);
  });

  it('exits quietly when the reader goes away (EPIPE)', async () => {
    const { code, stderr } = await skycast(['now', 'Istanbul'], {
      closeStdout: true,
    });
    expect(code).toBe(0);
    expect(stderr).not.toMatch(/Error|EPIPE/);
  });

  it.skipIf(process.platform === 'win32')(
    'Ctrl+C stops a pending request with exit code 130',
    async () => {
      const { code, stderr } = await skycast(
        ['now', '--lat', HANGING_LATITUDE, '--lon', '0'],
        {
          interruptAfterMs: 1000,
        }
      );
      expect(code).toBe(130);
      expect(stderr).not.toContain('    at ');
    }
  );
});
