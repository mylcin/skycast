import type { SkycastError } from '../core/errors.ts';
import {
  CancelledError,
  ConfigError,
  StorageError,
  InvalidResponseError,
  LocationNotFoundError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  UpstreamError,
  UsageError,
  ExitCode,
} from '../core/errors.ts';
import type { Messages } from '../i18n/index.ts';

export interface Failure {
  /** Stable, for `--json` error output. */
  readonly code: string;
  /** Translated; empty for a quiet cancel. */
  readonly message: string;
  readonly exitCode: number;
  /** A bug rather than a situation: worth the stack trace with --verbose. */
  readonly unexpected: boolean;
}

/** Turns anything thrown into what the user reads and the exit code. */
export function describeError(error: unknown, t: Messages): Failure {
  const e = t.cli.errors;
  const known = (message: string, source: SkycastError): Failure => ({
    code: source.code,
    message,
    exitCode: source.exitCode,
    unexpected: false,
  });

  if (error instanceof LocationNotFoundError) {
    const message = error.qualified
      ? e.notFoundQualified(error.query)
      : e.notFound(error.query);
    return known(message, error);
  }
  if (error instanceof TimeoutError) return known(e.timeout(error.host), error);
  if (error instanceof NetworkError) return known(e.network(error.host), error);
  if (error instanceof RateLimitError) return known(e.rateLimited, error);
  if (error instanceof InvalidResponseError) {
    return known(e.invalidResponse, error);
  }
  if (error instanceof UpstreamError) {
    return known(e.upstream(error.status, error.reason ?? error.host), error);
  }
  if (error instanceof ConfigError) {
    const message = {
      'invalid-json': () => e.configInvalidJson(error.path),
      'invalid-value': () => e.configInvalidValue(error.path, error.detail),
      unreadable: () => e.configUnreadable(error.path, error.detail),
      'not-a-file': () => e.configNotAFile(error.path),
    }[error.problem]();
    return known(message, error);
  }
  if (error instanceof StorageError) {
    return known(e.storage(error.path, error.reason), error);
  }
  if (error instanceof UsageError || error instanceof CancelledError) {
    return known(error.message === 'Cancelled' ? '' : error.message, error);
  }
  // @inquirer throws these when a prompt is closed with Ctrl+C or aborted.
  if (
    error instanceof Error &&
    (error.name === 'ExitPromptError' || error.name === 'AbortPromptError')
  ) {
    return {
      code: 'CANCELLED',
      message: '',
      exitCode: ExitCode.cancelled,
      unexpected: false,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: 'INTERNAL',
    message: e.internal(message),
    exitCode: ExitCode.internal,
    unexpected: true,
  };
}

type Pattern = readonly [RegExp, (...groups: string[]) => string];

/**
 * Commander writes its own English errors; this rewrites the common ones in
 * the UI language. Unknown messages pass through unchanged.
 */
export function translateCommanderError(message: string, t: Messages): string {
  const e = t.cli.errors;
  let text = message.replace(/^error:\s*/, '').trim();
  let suggestion = '';
  const hint = /\s*\(Did you mean (?:one of )?(.+)\?\)$/.exec(text);
  if (hint?.[1]) {
    suggestion = e.suggestion(hint[1]);
    text = text.slice(0, hint.index).trim();
  }
  const invalid =
    /^(?:option '.+' argument|command-argument value) '(.+)' is invalid(?: for argument '.+')?\.\s*/;
  const patterns: readonly Pattern[] = [
    [/^unknown option '(.+)'$/, option => e.unknownOption(option)],
    [/^unknown command '(.+)'$/, command => e.unknownCommand(command)],
    [
      /^missing required argument '(.+)'$/,
      name => e.missingArgument(t.cli.argumentNames[name] ?? name),
    ],
    [
      /^option '(.+)' argument missing$/,
      option => e.optionMissingValue(option),
    ],
    [/^too many arguments/, () => e.tooManyArguments],
    [
      new RegExp(`${invalid.source}Allowed choices are (.+)\\.$`),
      (value, choices) => e.invalidChoice(value, choices),
    ],
    // Our own parsers throw translated messages; drop commander's preamble.
    [new RegExp(`${invalid.source}(.+)$`), (_value, reason) => reason],
  ];
  for (const [pattern, format] of patterns) {
    const match = pattern.exec(text);
    if (match) {
      text = format(...match.slice(1).map(group => group));
      break;
    }
  }
  return [text, suggestion].filter(Boolean).join(' ');
}
