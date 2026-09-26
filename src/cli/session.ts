import { CancelledError, UsageError } from '../core/errors.ts';
import type { ChooseLocation } from '../core/location-service.ts';
import type { UnitSystem } from '../core/models.ts';
import { getMessages, type Lang, type Messages } from '../i18n/index.ts';
import type { Cache } from '../infra/cache.ts';
import type { RenderContext } from '../renderers/context.ts';
import { createPaint, type Paint } from '../renderers/paint.ts';
import { getSymbols } from '../renderers/symbols.ts';
import { createServices, type Services } from './container.ts';
import type { Hooks, Io } from './io.ts';
import { choosePlace } from './prompt.ts';
import { resolveLang, resolveUnits } from './settings.ts';
import { createSpinner, type Spinner } from './spinner.ts';
import {
  colorLevel,
  isInteractive,
  supportsUnicode,
  terminalWidth,
} from './terminal.ts';

/** Options every command accepts (defined on the root program). */
export interface GlobalOptions {
  readonly units?: UnitSystem | undefined;
  readonly lang?: Lang | undefined;
  readonly json?: true | undefined;
  readonly color: boolean;
  readonly compact?: true | undefined;
  readonly verbose?: true | undefined;
  readonly ascii?: true | undefined;
  readonly cache: boolean;
}

/** Saved settings the session falls back on (see config-store.ts). */
export interface Saved {
  readonly units?: UnitSystem | undefined;
  readonly lang?: Lang | undefined;
}

/** Shared by every command for one run. */
export interface Session {
  readonly t: Messages;
  readonly lang: Lang;
  readonly units: UnitSystem;
  readonly json: boolean;
  readonly compact: boolean;
  readonly verbose: boolean;
  /** For stdout. */
  readonly render: RenderContext;
  /** For stderr, which may be a terminal while stdout is piped. */
  readonly errPaint: Paint;
  readonly services: Services;
  readonly spinner: Spinner;
  readonly signal?: AbortSignal;
  /** Set when someone can answer a prompt. */
  readonly choose?: ChooseLocation;
  now(): Date;
  out(text: string): void;
  notice(text: string): void;
  log(text: string): void;
}

export interface SessionOptions {
  readonly io: Io;
  readonly hooks: Hooks;
  readonly options: GlobalOptions;
  readonly saved: Saved;
  readonly cache: Cache | null;
}

const isCancel = (error: unknown): boolean =>
  error instanceof CancelledError ||
  (error instanceof Error &&
    (error.name === 'ExitPromptError' || error.name === 'AbortPromptError'));

/** Overrides for the API endpoints must be plain http(s) URLs. */
function checkEndpoints(env: Io['env'], t: Messages): void {
  for (const variable of ['SKYCAST_FORECAST_URL', 'SKYCAST_GEOCODING_URL']) {
    const value = env[variable];
    if (value === undefined || value === '') continue;
    const url = URL.canParse(value) ? new URL(value) : null;
    const valid =
      url !== null &&
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password;
    if (!valid) throw new UsageError(t.cli.invalidEnvUrl(variable, value));
  }
}

export function createSession({
  io,
  hooks,
  options,
  saved,
  cache,
}: SessionOptions): Session {
  const lang = resolveLang({
    flag: options.lang,
    env: io.env,
    saved: saved.lang,
  });
  const t = getMessages(lang);
  checkEndpoints(io.env, t);
  const unicode = !options.ascii && supportsUnicode(io.env, io.platform);
  const symbols = getSymbols(unicode);
  const json = Boolean(options.json);
  const errPaint = createPaint(colorLevel(io.stderr, io.env, options.color));
  const verbose = Boolean(options.verbose);

  const log = (text: string): void => {
    if (verbose) io.stderr.write(`${errPaint.dim(`› ${text}`)}\n`);
  };
  const interactive = hooks.choose !== undefined || isInteractive(io);
  const spinner = createSpinner({
    enabled: isInteractive(io) && !json && !verbose,
    text: t.cli.fetching,
    unicode,
  });

  // One prompt at a time, even when several places resolve in parallel.
  // Cancelling one cancels the ones still waiting.
  let queue: Promise<unknown> = Promise.resolve();
  let cancelled = false;
  const pick =
    hooks.choose ??
    ((places, query) =>
      choosePlace(places, query, {
        t,
        symbols,
        ...(io.signal && { signal: io.signal }),
      }));
  const choose: ChooseLocation = (places, query) => {
    const next = queue.then(async () => {
      if (cancelled) throw new CancelledError();
      spinner.stop();
      try {
        return await pick(places, query);
      } catch (error) {
        if (isCancel(error)) cancelled = true;
        throw error;
      }
    });
    queue = next.catch(() => undefined);
    return next;
  };

  return {
    t,
    lang,
    units: resolveUnits({
      flag: options.units,
      env: io.env,
      saved: saved.units,
    }),
    json,
    compact: Boolean(options.compact),
    verbose,
    render: {
      t,
      symbols,
      // JSON never contains colour, whatever the terminal supports.
      paint: createPaint(
        json ? 0 : colorLevel(io.stdout, io.env, options.color)
      ),
      width: terminalWidth(io.stdout, io.env),
    },
    errPaint,
    services: createServices({
      io,
      hooks,
      cache: options.cache ? cache : null,
      log,
    }),
    spinner,
    ...(io.signal && { signal: io.signal }),
    ...(interactive && !json && { choose }),
    now: hooks.now ?? (() => new Date()),
    out: text => {
      io.stdout.write(text);
    },
    notice: text => {
      spinner.stop();
      io.stderr.write(`${errPaint.warn(text)}\n`);
    },
    log,
  };
}
