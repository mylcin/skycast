import {
  CommanderError,
  type CommandUnknownOpts,
} from '@commander-js/extra-typings';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, ExitCode, UsageError } from '../core/errors.ts';
import { getMessages, type Messages } from '../i18n/index.ts';
import {
  createConfigStore,
  EMPTY_CONFIG,
  type Config,
} from '../infra/config-store.ts';
import { createFileCache } from '../infra/file-cache.ts';
import { resolvePaths } from '../infra/paths.ts';
import { createPaint } from '../renderers/paint.ts';
import * as configCommands from './commands/config.ts';
import * as favorites from './commands/favorites.ts';
import { home } from './commands/home.ts';
import * as weather from './commands/weather.ts';
import { completionScript } from './completion.ts';
import { describeError, translateCommanderError } from './errors.ts';
import type { Hooks, Io } from './io.ts';
import { buildProgram, type Actions } from './program.ts';
import { createSession, type GlobalOptions, type Session } from './session.ts';
import { resolveLang, scanLang } from './settings.ts';
import { colorLevel } from './terminal.ts';

export type { Hooks, Io } from './io.ts';

/** The global options of a command, after commander has validated them. */
function globalsOf(command: CommandUnknownOpts): GlobalOptions {
  const options = command.optsWithGlobals() as Record<string, unknown>;
  return {
    units:
      options.units === 'imperial' || options.units === 'metric'
        ? options.units
        : undefined,
    lang:
      options.lang === 'en' || options.lang === 'tr' ? options.lang : undefined,
    json: options.json === true ? true : undefined,
    color: options.color !== false,
    compact: options.compact === true ? true : undefined,
    verbose: options.verbose === true ? true : undefined,
    ascii: options.ascii === true ? true : undefined,
    cache: options.cache !== false,
  };
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j] ?? 0;
      row[j] = Math.min(
        current + 1,
        (row[j - 1] ?? 0) + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      previous = current;
    }
  }
  return row[b.length] ?? 0;
}

/**
 * `skycast Istanbul` is short for `skycast now Istanbul`, so a mistyped
 * command would be looked up as a place. Catch the obvious typos first.
 */
function checkTypo(
  words: readonly string[],
  program: CommandUnknownOpts,
  t: Messages
): void {
  const [word] = words;
  if (words.length !== 1 || !word || word.length < 3) return;
  const lower = word.toLowerCase();
  const allowed = lower.length <= 5 ? 1 : 2;
  for (const command of program.commands) {
    for (const name of [command.name(), ...command.aliases()]) {
      if (distance(lower, name) <= allowed) {
        throw new UsageError(t.cli.didYouMean(name));
      }
    }
  }
}

/**
 * Runs the CLI with the given arguments and resolves to the exit code. It
 * never calls process.exit, so output is flushed and tests can call it.
 */
export async function run(
  argv: readonly string[],
  io: Io,
  hooks: Hooks = {}
): Promise<number> {
  const early = {
    json: argv.includes('--json'),
    color: !argv.includes('--no-color'),
    verbose: argv.includes('--verbose'),
  };
  const errPaint = createPaint(colorLevel(io.stderr, io.env, early.color));
  const paths = resolvePaths(io.env, io.platform, hooks.homedir ?? homedir());
  const store = createConfigStore(join(paths.config, 'config.json'));
  const fileCache = createFileCache(join(paths.cache, 'http'), hooks.now);

  // A broken config file must not stop `config reset`, help or completion,
  // so the error is kept and raised only by commands that read settings.
  let config: Config = EMPTY_CONFIG;
  let configError: ConfigError | undefined;
  try {
    config = await store.load();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    configError = error;
  }
  const settings = (): Config => {
    if (configError) throw configError;
    return config;
  };

  let t = getMessages(
    resolveLang({ flag: scanLang(argv), env: io.env, saved: config.lang })
  );
  let exitCode: number = ExitCode.ok;

  const session = (command: CommandUnknownOpts): Session => {
    const { units, lang } = settings();
    const created = createSession({
      io,
      hooks,
      options: globalsOf(command),
      saved: { units, lang },
      cache: fileCache,
    });
    t = created.t;
    return created;
  };
  const defaultCity = () => config.city;
  const configCommand = (command: CommandUnknownOpts) => ({
    session: session(command),
    store,
    config: settings(),
    env: io.env,
  });

  const actions: Actions = {
    async home(words, command) {
      if (words.length > 0) {
        checkTypo(words, command, t);
        await weather.now(session(command), { words });
        return;
      }
      if (!(await home(session(command), settings()))) {
        io.stdout.write(`${t.cli.home.empty}\n\n`);
        command.outputHelp();
      }
    },
    now: (words, flags, command) =>
      weather.now(session(command), { words, ...flags }, defaultCity),
    forecast: (words, flags, command) =>
      weather.forecast(session(command), { words, ...flags }, defaultCity),
    hourly: (words, flags, command) =>
      weather.hourly(session(command), { words, ...flags }, defaultCity),
    async compare(places, command) {
      exitCode = await weather.compare(session(command), places);
    },
    completion(shell, command) {
      io.stdout.write(completionScript(shell, command.parent ?? command));
    },
    config: {
      list: command => {
        configCommands.list(configCommand(command));
      },
      get: (key, command) => {
        configCommands.get(configCommand(command), key);
      },
      set: (key, value, command) =>
        configCommands.set(configCommand(command), key, value),
      unset: (key, command) =>
        configCommands.unset(configCommand(command), key),
      async reset() {
        // Works on a broken file too: that is what it is for. Favourites
        // survive a reset when the file could still be read.
        if (configError) await store.remove();
        else await store.save({ favorites: config.favorites });
        io.stdout.write(`${t.cli.config.reset}\n`);
      },
      path() {
        io.stdout.write(`${store.path}\n`);
      },
    },
    favorites: {
      add: (words, flags, command) =>
        favorites.add(configCommand(command), words, flags.country),
      remove: (ref, command) => favorites.remove(configCommand(command), ref),
      list: command => {
        favorites.list(configCommand(command));
      },
    },
    cache: {
      async clear() {
        io.stdout.write(`${t.cli.cacheCleared(await fileCache.clear())}\n`);
      },
      path() {
        io.stdout.write(`${fileCache.directory}\n`);
      },
    },
  };

  const program = buildProgram({
    t,
    actions,
    output: {
      writeOut: text => io.stdout.write(text),
      writeErr: text => io.stderr.write(text),
      outputError: (text, write) => {
        write(
          `${errPaint.error('skycast:')} ${translateCommanderError(text, t)}\n`
        );
      },
    },
  });

  try {
    await program.parseAsync([...argv], { from: 'user' });
    return exitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      // Help and --version "fail" with exit code 0.
      return error.exitCode === 0 ? ExitCode.ok : ExitCode.usage;
    }
    const failure = describeError(error, t);
    if (failure.message) {
      if (early.json) {
        const payload = {
          code: failure.code,
          message: failure.message,
          exitCode: failure.exitCode,
        };
        io.stderr.write(`${JSON.stringify({ error: payload })}\n`);
      } else {
        io.stderr.write(`${errPaint.error('skycast:')} ${failure.message}\n`);
      }
    }
    if (failure.unexpected && !early.json) {
      io.stderr.write(`${errPaint.dim(t.cli.errors.verboseHint)}\n`);
      if (early.verbose && error instanceof Error && error.stack) {
        io.stderr.write(`${errPaint.dim(error.stack)}\n`);
      }
    }
    return failure.exitCode;
  }
}
