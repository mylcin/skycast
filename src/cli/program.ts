import {
  Argument,
  Command,
  Option,
  type CommandUnknownOpts,
  type OutputConfiguration,
} from '@commander-js/extra-typings';
import type { Messages } from '../i18n/index.ts';
import { NAME, VERSION } from '../version.ts';
import { SHELLS, type Shell } from './completion.ts';
import { countryCode, integer, latitude, longitude } from './parsers.ts';

export interface LocationFlags {
  readonly lat?: number | undefined;
  readonly lon?: number | undefined;
  readonly country?: string | undefined;
}

/** What each command does; kept apart so the tree can be built on its own. */
export interface Actions {
  home(words: string[], command: CommandUnknownOpts): Promise<void>;
  now(
    words: string[],
    flags: LocationFlags,
    command: CommandUnknownOpts
  ): Promise<void>;
  forecast(
    words: string[],
    flags: LocationFlags & { days: number },
    command: CommandUnknownOpts
  ): Promise<void>;
  hourly(
    words: string[],
    flags: LocationFlags & { hours: number },
    command: CommandUnknownOpts
  ): Promise<void>;
  compare(places: string[], command: CommandUnknownOpts): Promise<void>;
  completion(shell: Shell, command: CommandUnknownOpts): Promise<void>;
}

const EXAMPLES = [
  'skycast Istanbul',
  'skycast forecast "Paris, France" --days 3',
  'skycast hourly Tokyo --hours 12 --compact',
  'skycast compare Istanbul Ankara Izmir',
  'skycast now --lat 41.01 --lon 28.95 --json',
  'skycast now Berlin --units imperial --lang tr',
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

  program
    .command('completion')
    .description(c.completion)
    .addArgument(new Argument('<shell>', a.shell).choices(SHELLS))
    .action((shell, _options, command) => actions.completion(shell, command));

  return program;
}
