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

/** The config file exists but can't be read or doesn't validate. */
export class ConfigError extends SkycastError {
  readonly code = 'CONFIG';
  readonly exitCode = ExitCode.internal;

  readonly path: string;
  readonly detail: string;

  constructor(path: string, detail: string, options?: ErrorOptions) {
    super(`Invalid config file ${path}: ${detail}`, options);
    this.path = path;
    this.detail = detail;
  }
}

export class LocationNotFoundError extends SkycastError {
  readonly code = 'LOCATION_NOT_FOUND';
  readonly exitCode = ExitCode.notFound;

  readonly query: string;

  constructor(query: string) {
    super(`No place found for "${query}"`);
    this.query = query;
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
