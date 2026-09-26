import {
  CommanderError,
  type CommandUnknownOpts,
} from '@commander-js/extra-typings';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  ConfigError,
  ExitCode,
  LocationNotFoundError,
  UsageError,
} from '../core/errors.ts';
import { getMessages, type Messages } from '../i18n/index.ts';
import {
  createConfigStore,
  EMPTY_CONFIG,
  type Config,
} from '../infra/config-store.ts';
import { createFileCache } from '../infra/file-cache.ts';
import { resolvePaths } from '../infra/paths.ts';
import { renderJson } from '../renderers/json.ts';
import { createPaint } from '../renderers/paint.ts';
import * as configCommands from './commands/config.ts';
import * as favorites from './commands/favorites.ts';
import { home } from './commands/home.ts';
import * as weather from './commands/weather.ts';
import { editDistance } from '../utils/edit-distance.ts';
import { completionScript } from './completion.ts';
import { describeError, translateCommanderError } from './errors.ts';
import type { Hooks, Io } from './io.ts';
import { buildProgram, type Actions } from './program.ts';
import { createSession, type GlobalOptions, type Session } from './session.ts';
import { optionArgs, resolveLang, scanLang } from './settings.ts';
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
      if (editDistance(lower, name) <= allowed) {
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
  const options = optionArgs(argv);
  const early = {
    json: options.includes('--json'),
    color: !options.includes('--no-color'),
    verbose: options.includes('--verbose'),
  };
  const errPaint = createPaint(colorLevel(io.stderr, io.env, early.color));
  const paths = resolvePaths(io.env, io.platform, hooks.homedir ?? homedir());
  const store = createConfigStore(join(paths.config, 'config.json'));
  const fileCache = createFileCache(join(paths.cache, 'http'), hooks.now);

  // A broken settings file must not stop `config reset`, help or completion,
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

  const session = (
    command: CommandUnknownOpts,
    saved: Config = settings()
  ): Session => {
    const created = createSession({
      io,
      hooks,
      options: globalsOf(command),
      saved: { units: saved.units, lang: saved.lang },
      cache: fileCache,
    });
    t = created.t;
    return created;
  };
  const defaultCity = () => config.city;
  /**
   * Settings commands work from whatever still validates, so a bad value
   * can be fixed with `config set` instead of only by editing the file.
   */
  const configCommand = async (command: CommandUnknownOpts) => {
    const { config: salvaged } = await store.salvage();
    return {
      session: session(command, salvaged),
      store,
      config: salvaged,
      env: io.env,
    };
  };
  const print = (
    command: CommandUnknownOpts,
    json: object,
    text: string
  ): void => {
    io.stdout.write(
      globalsOf(command).json ? renderJson(json as never) : `${text}\n`
    );
  };

  const actions: Actions = {
    async home(words, command) {
      if (words.length > 0) {
        try {
          await weather.now(session(command), { words });
        } catch (error) {
          // Only a word that isn't a place can be a mistyped command.
          if (error instanceof LocationNotFoundError)
            checkTypo(words, command, t);
          throw error;
        }
        return;
      }
      const current = session(command);
      if (await home(current, settings())) return;
      if (current.json) {
        io.stdout.write(renderJson({ city: null, favorites: [] }));
        return;
      }
      io.stdout.write(`${t.cli.home.empty}\n\n`);
      command.outputHelp();
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
      async list(command) {
        configCommands.list(await configCommand(command));
      },
      async get(key, command) {
        configCommands.get(await configCommand(command), key);
      },
      async set(key, value, flags, command) {
        await configCommands.set(
          await configCommand(command),
          key,
          value,
          flags.country
        );
      },
      async unset(key, command) {
        await configCommands.unset(await configCommand(command), key);
      },
      async reset(command) {
        // Works on a broken file too: that is what it is for.
        const result = await store.reset();
        print(
          command,
          { reset: true, ...result },
          result.backup
            ? t.cli.config.resetBackup(result.backup)
            : t.cli.config.reset(result.favorites)
        );
      },
      path(command) {
        print(command, { path: store.path }, store.path);
      },
    },
    favorites: {
      async add(words, flags, command) {
        await favorites.add(await configCommand(command), words, flags.country);
      },
      async remove(ref, command) {
        await favorites.remove(await configCommand(command), ref);
      },
      async list(command) {
        favorites.list({ ...(await configCommand(command)) });
      },
    },
    cache: {
      async clear(command) {
        const count = await fileCache.clear();
        print(command, { cleared: count }, t.cli.cacheCleared(count));
      },
      path(command) {
        print(command, { path: fileCache.directory }, fileCache.directory);
      },
    },
  };

  // Set from callbacks, so an object: TypeScript would narrow a plain `let`.
  const errors = { reported: false };
  const report = (code: string, message: string, exit: number): void => {
    errors.reported = true;
    if (early.json) {
      io.stderr.write(
        `${JSON.stringify({ error: { code, message, exitCode: exit } })}\n`
      );
    } else {
      io.stderr.write(`${errPaint.error('skycast:')} ${message}\n`);
    }
  };

  const program = buildProgram({
    t,
    actions,
    output: {
      writeOut: text => io.stdout.write(text),
      // In JSON mode stderr carries one JSON error line, so help printed
      // as an error (`skycast cache`) is left out.
      writeErr: text => {
        if (!early.json) io.stderr.write(text);
      },
      outputError: text => {
        report('USAGE', translateCommanderError(text, t), ExitCode.usage);
      },
    },
  });

  try {
    await program.parseAsync([...argv], { from: 'user' });
    return exitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      // Help and --version "fail" with exit code 0.
      if (error.exitCode === 0) return ExitCode.ok;
      // A parent command without its subcommand shows help as an error.
      if (!errors.reported && early.json) {
        report(
          'USAGE',
          t.cli.errors.missingArgument(
            t.cli.argumentNames.command ?? 'command'
          ),
          ExitCode.usage
        );
      }
      return ExitCode.usage;
    }
    const failure = describeError(error, t);
    if (failure.message)
      report(failure.code, failure.message, failure.exitCode);
    if (failure.unexpected && !early.json) {
      io.stderr.write(`${errPaint.dim(t.cli.errors.verboseHint)}\n`);
      if (early.verbose && error instanceof Error && error.stack) {
        io.stderr.write(`${errPaint.dim(error.stack)}\n`);
      }
    }
    return failure.exitCode;
  }
}
