/**
 * Errors the app knows how to explain. Each carries a stable code (used in
 * `--json` error output) and the process exit code the CLI returns for it.
 * Messages are English and meant for logs; the CLI shows translated text.
 */

export const ExitCode = {
  ok: 0,
  internal: 1,
  usage: 2,
  notFound: 3,
  network: 4,
  upstream: 5,
  cancelled: 130,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

export type ErrorCode =
  | 'USAGE'
  | 'CONFIG'
  | 'STORAGE'
  | 'LOCATION_NOT_FOUND'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'UPSTREAM'
  | 'RATE_LIMITED'
  | 'INVALID_RESPONSE'
  | 'CANCELLED';

export abstract class SkycastError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly exitCode: ExitCode;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Wrong flags or arguments. The message is already translated. */
export class UsageError extends SkycastError {
  readonly code = 'USAGE';
  readonly exitCode = ExitCode.usage;
}

/**
 * What is wrong with the settings file: not JSON, a value that doesn't
 * validate (`detail` names it), a file that can't be read (`detail` is the
 * OS error code), or something that isn't a file at all.
 */
export type ConfigProblem =
  'invalid-json' | 'invalid-value' | 'unreadable' | 'not-a-file';

export class ConfigError extends SkycastError {
  readonly code = 'CONFIG';
  readonly exitCode = ExitCode.internal;

  readonly path: string;
  readonly problem: ConfigProblem;
  readonly detail: string;

  constructor(
    path: string,
    problem: ConfigProblem,
    detail = '',
    options?: ErrorOptions
  ) {
    super(
      `Config file ${path}: ${problem}${detail ? ` (${detail})` : ''}`,
      options
    );
    this.path = path;
    this.problem = problem;
    this.detail = detail;
  }
}

/** Settings or cache could not be written: permissions, a full disk, a lock. */
export class StorageError extends SkycastError {
  readonly code = 'STORAGE';
  readonly exitCode = ExitCode.internal;

  readonly path: string;
  /** The OS error code, such as EACCES, or EBUSY for a held lock. */
  readonly reason: string;

  constructor(path: string, reason: string, options?: ErrorOptions) {
    super(`Could not write ${path} (${reason})`, options);
    this.path = path;
    this.reason = reason;
  }
}

export class LocationNotFoundError extends SkycastError {
  readonly code = 'LOCATION_NOT_FOUND';
  readonly exitCode = ExitCode.notFound;

  readonly query: string;
  /** The query already named a country or region, so don't suggest adding one. */
  readonly qualified: boolean;

  constructor(query: string, qualified = false) {
    super(`No place found for "${query}"`);
    this.query = query;
    this.qualified = qualified;
  }
}

/** The request never got a response: offline, DNS failure, refused. */
export class NetworkError extends SkycastError {
  readonly code: ErrorCode = 'NETWORK';
  readonly exitCode = ExitCode.network;

  readonly host: string;

  constructor(host: string, options?: ErrorOptions) {
    super(`Could not reach ${host}`, options);
    this.host = host;
  }
}

export class TimeoutError extends NetworkError {
  override readonly code = 'TIMEOUT';

  readonly timeoutMs: number;

  constructor(host: string, timeoutMs: number) {
    super(host);
    this.message = `${host} did not respond within ${timeoutMs} ms`;
    this.timeoutMs = timeoutMs;
  }
}

/** The API answered with an error. */
export class UpstreamError extends SkycastError {
  readonly code: ErrorCode = 'UPSTREAM';
  readonly exitCode = ExitCode.upstream;

  readonly host: string;
  readonly status: number;
  readonly reason: string | null;

  constructor(host: string, status: number, reason: string | null) {
    super(`${host} responded ${status}${reason ? `: ${reason}` : ''}`);
    this.host = host;
    this.status = status;
    this.reason = reason;
  }
}

export class RateLimitError extends UpstreamError {
  override readonly code = 'RATE_LIMITED';
}

/** The API answered 200 with something we don't understand. */
export class InvalidResponseError extends UpstreamError {
  override readonly code = 'INVALID_RESPONSE';

  constructor(host: string, detail: string) {
    super(host, 200, detail);
    this.message = `Unexpected response from ${host}: ${detail}`;
  }
}

/** Ctrl+C, or a prompt the user dismissed. */
export class CancelledError extends SkycastError {
  readonly code = 'CANCELLED';
  readonly exitCode = ExitCode.cancelled;

  constructor() {
    super('Cancelled');
  }
}
