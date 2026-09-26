import type { Location } from '../core/models.ts';

/** The parts of a writable stream the CLI uses. */
export interface OutputStream {
  write(chunk: string): unknown;
  readonly isTTY?: boolean;
  readonly columns?: number;
  getColorDepth?(env?: Readonly<Record<string, string | undefined>>): number;
}

/** Everything the CLI takes from the process, so tests can run it in memory. */
export interface Io {
  readonly stdout: OutputStream;
  readonly stderr: OutputStream;
  readonly stdin: { readonly isTTY?: boolean };
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  /** Aborted on Ctrl+C. */
  readonly signal?: AbortSignal;
}

/** Test seams. Production leaves them unset. */
export interface Hooks {
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  /** Replaces the interactive picker; also makes the session interactive. */
  readonly choose?: (
    places: readonly Location[],
    query: string
  ) => Promise<Location>;
  readonly homedir?: string;
  /** Replaces the retry back-off wait. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}
