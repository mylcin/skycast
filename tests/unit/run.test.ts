import { describe, expect, it } from 'vitest';
import { run } from '../../src/cli/run.ts';
import { VERSION } from '../../src/version.ts';

function capture() {
  let out = '';
  let err = '';
  return {
    io: {
      stdout: { write: (text: string) => (out += text) },
      stderr: { write: (text: string) => (err += text) },
    },
    out: () => out,
    err: () => err,
  };
}

describe('run', () => {
  it('prints the version', async () => {
    const c = capture();
    expect(await run(['--version'], c.io)).toBe(0);
    expect(c.out().trim()).toBe(VERSION);
  });
});
