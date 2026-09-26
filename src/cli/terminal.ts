import type { ColorLevel } from '../renderers/paint.ts';
import type { Io, OutputStream } from './io.ts';

type Env = Io['env'];

const truthy = (value: string | undefined): boolean =>
  value !== undefined && value !== '' && value !== '0' && value !== 'false';

/**
 * How many colours a stream can show. `--no-color` and NO_COLOR win, then
 * FORCE_COLOR; otherwise pipes and dumb terminals get none.
 */
export function colorLevel(
  stream: OutputStream,
  env: Env,
  enabled = true
): ColorLevel {
  if (!enabled) return 0;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return 0;
  const force = env.FORCE_COLOR;
  if (force !== undefined) {
    if (force === '0' || force === 'false') return 0;
    if (force === '2') return 2;
    if (force === '3') return 3;
    return Math.max(1, depthLevel(stream, env)) as ColorLevel;
  }
  if (env.TERM === 'dumb' || !stream.isTTY) return 0;
  return depthLevel(stream, env);
}

function depthLevel(stream: OutputStream, env: Env): ColorLevel {
  const depth = stream.getColorDepth?.(env) ?? 1;
  if (depth >= 24) return 3;
  if (depth >= 8) return 2;
  if (depth >= 4) return 1;
  return 0;
}

/** A trimmed copy of the is-unicode-supported heuristic. */
export function supportsUnicode(env: Env, platform: string): boolean {
  if (platform !== 'win32') return env.TERM !== 'linux';
  return (
    Boolean(env.WT_SESSION) ||
    Boolean(env.TERMINUS_SUBLIME) ||
    env.ConEmuTask === '{cmd::Cmder}' ||
    env.TERM_PROGRAM === 'Terminus-Sublime' ||
    env.TERM_PROGRAM === 'vscode' ||
    env.TERM === 'xterm-256color' ||
    env.TERM === 'alacritty' ||
    env.TERM === 'rxvt-unicode' ||
    env.TERM === 'rxvt-unicode-256color' ||
    env.TERMINAL_EMULATOR === 'JetBrains-JediTerm' ||
    truthy(env.CI)
  );
}

/** Columns to lay out for: COLUMNS, then the terminal, then 80. */
export function terminalWidth(stream: OutputStream, env: Env): number {
  const fromEnv = Number(env.COLUMNS);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return Math.max(20, fromEnv);
  if (stream.isTTY && stream.columns && stream.columns > 0) {
    return Math.max(20, stream.columns);
  }
  return 80;
}

/** Someone is at the keyboard: prompts and spinners make sense. */
export function isInteractive(io: Io): boolean {
  return (
    Boolean(io.stdin.isTTY) &&
    Boolean(io.stderr.isTTY) &&
    !truthy(io.env.CI) &&
    io.env.TERM !== 'dumb'
  );
}
