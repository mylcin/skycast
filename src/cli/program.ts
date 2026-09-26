import {
  Argument,
  Command,
  Option,
  type CommandUnknownOpts,
  type OutputConfiguration,
} from '@commander-js/extra-typings';
import { UsageError } from '../core/errors.ts';
import type { Messages } from '../i18n/index.ts';
import { closest } from '../utils/edit-distance.ts';
import { NAME, VERSION } from '../version.ts';
import { CONFIG_KEYS, type ConfigKey } from './commands/config.ts';
import { SHELLS, type Shell } from './completion.ts';
import { countryCode, integer, latitude, longitude } from './parsers.ts';

export interface LocationFlags {
  readonly lat?: number | undefined;
  readonly lon?: number | undefined;
  readonly country?: string | undefined;
}

/** What each command does; kept apart so the tree can be built on its own. */
export interface Actions {
  home(words: string[], command: CommandUnknownOpts): void | Promise<void>;
  now(
    words: string[],
    flags: LocationFlags,
    command: CommandUnknownOpts
  ): void | Promise<void>;
  forecast(
    words: string[],
    flags: LocationFlags & { days: number },
    command: CommandUnknownOpts
  ): void | Promise<void>;
  hourly(
    words: string[],
    flags: LocationFlags & { hours: number },
    command: CommandUnknownOpts
  ): void | Promise<void>;
  compare(places: string[], command: CommandUnknownOpts): void | Promise<void>;
  completion(shell: Shell, command: CommandUnknownOpts): void | Promise<void>;
  config: {
    list(command: CommandUnknownOpts): void | Promise<void>;
    get(key: ConfigKey, command: CommandUnknownOpts): void | Promise<void>;
    set(
      key: ConfigKey,
      value: string[],
      flags: { country?: string | undefined },
      command: CommandUnknownOpts
    ): void | Promise<void>;
    unset(key: ConfigKey, command: CommandUnknownOpts): void | Promise<void>;
    reset(command: CommandUnknownOpts): void | Promise<void>;
    path(command: CommandUnknownOpts): void | Promise<void>;
  };
  favorites: {
    add(
      words: string[],
      flags: { country?: string | undefined },
      command: CommandUnknownOpts
    ): void | Promise<void>;
    remove(ref: string, command: CommandUnknownOpts): void | Promise<void>;
    list(command: CommandUnknownOpts): void | Promise<void>;
  };
  cache: {
    clear(command: CommandUnknownOpts): void | Promise<void>;
    path(command: CommandUnknownOpts): void | Promise<void>;
  };
}

const EXAMPLES = [
  'skycast Istanbul',
  'skycast forecast "Paris, France" --days 3',
  'skycast hourly Tokyo --hours 12 --compact',
  'skycast compare Istanbul Ankara Izmir',
  'skycast now --lat 41.01 --lon 28.95 --json',
  'skycast now Berlin --units imperial --lang tr',
  'skycast config set city Istanbul',
  'skycast fav add "Paris, France"',
];

export interface ProgramOptions {
  readonly t: Messages;
  readonly actions: Actions;
  readonly output: OutputConfiguration;
}

/**
 * The command tree. Descriptions are resolved here, so the language must be
 * known before the arguments are parsed (see settings.scanLang).
 */
export function buildProgram({
  t,
  actions,
  output,
}: ProgramOptions): CommandUnknownOpts {
  const o = t.cli.options;
  const c = t.cli.commands;
  const a = t.cli.arguments;

  const program = new Command()
    .name(NAME)
    .description(t.cli.description)
    // Set before adding subcommands: they inherit these settings.
    .exitOverride()
    .configureOutput(output)
    .configureHelp({
      showGlobalOptions: true,
      styleTitle: title => t.cli.headings[title] ?? title,
      // Commander appends "(choices: …)" and "(default: …)" in English.
      optionDescription: option => {
        const extras: string[] = [];
        if (option.argChoices)
          extras.push(t.cli.helpChoices(option.argChoices.join(', ')));
        if (
          typeof option.defaultValue === 'number' ||
          typeof option.defaultValue === 'string'
        ) {
          extras.push(t.cli.helpDefault(String(option.defaultValue)));
        }
        return extras.length
          ? `${option.description} (${extras.join('; ')})`
          : option.description;
      },
      argumentDescription: argument => argument.description,
    })
    .showSuggestionAfterError()
    .version(VERSION, '-V, --version', o.version)
    .helpOption('-h, --help', o.help)
    .helpCommand('help [command]', o.helpCommand)
    .addOption(
      new Option('-u, --units <system>', o.units).choices([
        'metric',
        'imperial',
      ] as const)
    )
    .addOption(
      new Option('-l, --lang <lang>', o.lang).choices(['en', 'tr'] as const)
    )
    .option('--json', o.json)
    .option('-c, --compact', o.compact)
    .option('--no-color', o.noColor)
    .option('--ascii', o.ascii)
    .option('--no-cache', o.noCache)
    .option('--verbose', o.verbose)
    .argument('[place...]', a.city)
    .addHelpText(
      'after',
      `\n${t.cli.examples}\n${EXAMPLES.map(line => `  ${line}`).join('\n')}\n`
    )
    .action((words, _options, command) => actions.home(words, command));

  const lat = () => new Option('--lat <degrees>', o.lat).argParser(latitude(t));
  const lon = () =>
    new Option('--lon <degrees>', o.lon).argParser(longitude(t));
  const country = () =>
    new Option('--country <code>', o.country).argParser(countryCode(t));

  program
    .command('now')
    .alias('current')
    .description(c.now)
    .argument('[place...]', a.city)
    .addOption(lat())
    .addOption(lon())
    .addOption(country())
    .action((words, flags, command) => actions.now(words, flags, command));

  program
    .command('forecast')
    .description(c.forecast)
    .argument('[place...]', a.city)
    .addOption(
      new Option('-d, --days <n>', o.days)
        .argParser(integer(t, 1, 16))
        .default(7)
    )
    .addOption(lat())
    .addOption(lon())
    .addOption(country())
    .action((words, flags, command) => actions.forecast(words, flags, command));

  program
    .command('hourly')
    .description(c.hourly)
    .argument('[place...]', a.city)
    .addOption(
      new Option('-H, --hours <n>', o.hours)
        .argParser(integer(t, 1, 168))
        .default(24)
    )
    .addOption(lat())
    .addOption(lon())
    .addOption(country())
    .action((words, flags, command) => actions.hourly(words, flags, command));

  program
    .command('compare')
    .description(c.compare)
    .argument('<places...>', a.cities)
    .action((places, _options, command) => actions.compare(places, command));

  const key = () => new Argument('<key>', a.key).choices(CONFIG_KEYS);
  // `config` and `fav` alone list. Anything else after them is a mistyped
  // subcommand: say so, with a suggestion, not "too many arguments".
  const listByDefault = (
    command: CommandUnknownOpts,
    list: () => void | Promise<void>
  ) => {
    const [word] = command.args;
    if (word === undefined) return list();
    const names = command.commands.flatMap(sub => [
      sub.name(),
      ...sub.aliases(),
    ]);
    const [suggestion] = closest(word.toLowerCase(), names, 2);
    throw new UsageError(
      [
        t.cli.errors.unknownCommand(word),
        suggestion ? t.cli.errors.suggestion(suggestion) : '',
      ]
        .filter(Boolean)
        .join(' ')
    );
  };
  const config = program
    .command('config')
    .description(c.config)
    .allowExcessArguments()
    .action((_options, command) =>
      listByDefault(command, () => actions.config.list(command))
    );
  config
    .command('list')
    .alias('ls')
    .description(c.configList)
    .action((_options, command) => actions.config.list(command));
  config
    .command('get')
    .description(c.configGet)
    .addArgument(key())
    .action((name, _options, command) => actions.config.get(name, command));
  config
    .command('set')
    .description(c.configSet)
    .addArgument(key())
    .argument('<value...>', a.value)
    .addOption(country())
    .action((name, value, flags, command) =>
      actions.config.set(name, value, flags, command)
    );
  config
    .command('unset')
    .description(c.configUnset)
    .addArgument(key())
    .action((name, _options, command) => actions.config.unset(name, command));
  config
    .command('reset')
    .description(c.configReset)
    .action((_options, command) => actions.config.reset(command));
  config
    .command('path')
    .description(c.configPath)
    .action((_options, command) => actions.config.path(command));

  const favorites = program
    .command('fav')
    .alias('favorites')
    .description(c.fav)
    .allowExcessArguments()
    .action((_options, command) =>
      listByDefault(command, () => actions.favorites.list(command))
    );
  favorites
    .command('add')
    .description(c.favAdd)
    .argument('<place...>', a.city)
    .addOption(country())
    .action((words, flags, command) =>
      actions.favorites.add(words, flags, command)
    );
  favorites
    .command('remove')
    .alias('rm')
    .description(c.favRemove)
    .argument('<favorite>', a.favorite)
    .action((ref, _options, command) => actions.favorites.remove(ref, command));
  favorites
    .command('list')
    .alias('ls')
    .description(c.favList)
    .action((_options, command) => actions.favorites.list(command));

  const cache = program.command('cache').description(c.cache);
  cache
    .command('clear')
    .description(c.cacheClear)
    .action((_options, command) => actions.cache.clear(command));
  cache
    .command('path')
    .description(c.cachePath)
    .action((_options, command) => actions.cache.path(command));

  program
    .command('completion')
    .description(c.completion)
    .addArgument(new Argument('<shell>', a.shell).choices(SHELLS))
    .action((shell, _options, command) => actions.completion(shell, command));

  return program;
}
