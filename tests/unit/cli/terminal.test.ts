import { describe, expect, it } from 'vitest';
import type { Io, OutputStream } from '../../../src/cli/io.ts';
import {
  colorLevel,
  isInteractive,
  supportsUnicode,
  terminalWidth,
} from '../../../src/cli/terminal.ts';

const tty = (depth = 24, columns = 100): OutputStream => ({
  write: () => true,
  isTTY: true,
  columns,
  getColorDepth: () => depth,
});
const pipe: OutputStream = { write: () => true, isTTY: false };

describe('colorLevel', () => {
  it('follows the terminal colour depth', () => {
    expect(colorLevel(tty(24), {})).toBe(3);
    expect(colorLevel(tty(8), {})).toBe(2);
    expect(colorLevel(tty(4), {})).toBe(1);
    expect(colorLevel(tty(1), {})).toBe(0);
  });

  it('has no colour for pipes and dumb terminals', () => {
    expect(colorLevel(pipe, {})).toBe(0);
    expect(colorLevel(tty(), { TERM: 'dumb' })).toBe(0);
  });

  it('lets --no-color and NO_COLOR win over everything', () => {
    expect(colorLevel(tty(), {}, false)).toBe(0);
    expect(colorLevel(tty(), { NO_COLOR: '1', FORCE_COLOR: '3' })).toBe(0);
    // An empty NO_COLOR is ignored, per no-color.org.
    expect(colorLevel(tty(), { NO_COLOR: '' })).toBe(3);
  });

  it('honours FORCE_COLOR, even for pipes', () => {
    expect(colorLevel(pipe, { FORCE_COLOR: '1' })).toBe(1);
    expect(colorLevel(pipe, { FORCE_COLOR: '' })).toBe(1);
    expect(colorLevel(pipe, { FORCE_COLOR: '2' })).toBe(2);
    expect(colorLevel(pipe, { FORCE_COLOR: '3' })).toBe(3);
    expect(colorLevel(tty(), { FORCE_COLOR: '0' })).toBe(0);
    expect(colorLevel(tty(), { FORCE_COLOR: 'false' })).toBe(0);
  });
});

describe('supportsUnicode', () => {
  it('assumes Unicode outside Windows, except the Linux console', () => {
    expect(supportsUnicode({}, 'darwin')).toBe(true);
    expect(supportsUnicode({ TERM: 'xterm-256color' }, 'linux')).toBe(true);
    expect(supportsUnicode({ TERM: 'linux' }, 'linux')).toBe(false);
  });

  it('recognises modern Windows terminals only', () => {
    expect(supportsUnicode({}, 'win32')).toBe(false);
    expect(supportsUnicode({ WT_SESSION: 'x' }, 'win32')).toBe(true);
    expect(supportsUnicode({ TERM_PROGRAM: 'vscode' }, 'win32')).toBe(true);
    expect(supportsUnicode({ CI: 'true' }, 'win32')).toBe(true);
  });
});

describe('terminalWidth', () => {
  it('prefers COLUMNS, then the terminal, then 80', () => {
    expect(terminalWidth(tty(24, 120), { COLUMNS: '60' })).toBe(60);
    expect(terminalWidth(tty(24, 120), {})).toBe(120);
    expect(terminalWidth(pipe, {})).toBe(80);
    expect(terminalWidth(pipe, { COLUMNS: 'wide' })).toBe(80);
  });

  it('never lays out narrower than 30 columns', () => {
    expect(terminalWidth(pipe, { COLUMNS: '5' })).toBe(30);
    expect(terminalWidth(tty(24, 3), {})).toBe(30);
  });
});

describe('isInteractive', () => {
  const io = (overrides: Partial<Io>): Io => ({
    stdout: tty(),
    stderr: tty(),
    stdin: { isTTY: true },
    env: {},
    platform: 'linux',
    ...overrides,
  });

  it('needs a terminal on stdin and stderr, outside CI', () => {
    expect(isInteractive(io({}))).toBe(true);
    expect(isInteractive(io({ stdin: { isTTY: false } }))).toBe(false);
    expect(isInteractive(io({ stderr: pipe }))).toBe(false);
    expect(isInteractive(io({ env: { CI: 'true' } }))).toBe(false);
    expect(isInteractive(io({ env: { CI: 'false' } }))).toBe(true);
    // stdout may be piped: `skycast now Paris > file` can still ask.
    expect(isInteractive(io({ stdout: pipe }))).toBe(true);
  });
});
