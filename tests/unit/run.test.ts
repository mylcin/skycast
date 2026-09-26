import { describe, expect, it } from 'vitest';
import { VERSION } from '../../src/version.ts';
import { runCli } from '../helpers/cli.ts';

describe('run', () => {
  it('prints the version', async () => {
    const result = await runCli(['--version']);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(VERSION);
  });
});
