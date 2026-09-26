import type { WmoCode } from '../core/conditions.ts';

export type Lang = 'en' | 'tr';
export const LANGS: readonly Lang[] = ['en', 'tr'];

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

/** Every user-facing string. `en.ts` and `tr.ts` must both satisfy it. */
export interface Messages {
  readonly lang: Lang;
  /** BCP 47 tag for Intl (country names, plural rules). */
  readonly locale: string;
  readonly decimalSeparator: string;
  /** "68%" in English, "%68" in Turkish. */
  percent(value: string): string;

  /** Sunday first, like Date#getUTCDay. */
  readonly weekdays: readonly string[];
  readonly months: readonly string[];
  readonly today: string;
  readonly tomorrow: string;

  readonly conditions: Readonly<Record<WmoCode, string>>;
  readonly unknownCondition: string;
  /** Eight points, clockwise from north. */
  readonly compass: readonly string[];
  readonly uv: {
    readonly low: string;
    readonly moderate: string;
    readonly high: string;
    readonly veryHigh: string;
    readonly extreme: string;
  };
  readonly units: {
    readonly kmh: string;
    readonly mph: string;
    readonly mm: string;
    readonly in: string;
    readonly hPa: string;
    readonly inHg: string;
  };

  readonly weather: {
    feelsLike(value: string): string;
    readonly humidity: string;
    readonly wind: string;
    gusts(value: string): string;
    readonly uv: string;
    readonly sunrise: string;
    readonly sunset: string;
    readonly polarNight: string;
    readonly midnightSun: string;
    readonly pressure: string;
    readonly clouds: string;
    todayRange(low: string, high: string): string;
    readonly noData: string;
    chanceOfRain(value: string): string;
  };

  readonly forecast: {
    title(days: number): string;
    readonly day: string;
    readonly condition: string;
    readonly low: string;
    readonly high: string;
    readonly range: string;
    readonly rain: string;
    readonly precipitation: string;
    readonly wind: string;
  };

  readonly hourly: {
    title(hours: number): string;
    readonly day: string;
    readonly time: string;
    readonly temperature: string;
    readonly rain: string;
    readonly condition: string;
    readonly wind: string;
    rainPeak(value: string): string;
    readonly dry: string;
  };

  readonly compare: {
    title(count: number): string;
    readonly place: string;
    readonly now: string;
    readonly feelsLike: string;
    readonly condition: string;
    readonly wind: string;
    readonly humidity: string;
    readonly today: string;
  };

  readonly cli: CliMessages;

  /** Plain-text place for coordinates: "41.01°N, 28.95°E". */
  coordinates(latitude: string, longitude: string): string;
  readonly north: string;
  readonly south: string;
  readonly east: string;
  readonly west: string;
}

/** Help text, prompts, notices and errors of the command line. */
export interface CliMessages {
  readonly description: string;
  /** Commander's section titles, keyed by the English original. */
  readonly headings: Readonly<Record<string, string>>;
  readonly examples: string;
  helpChoices(choices: string): string;
  helpDefault(value: string): string;
  readonly options: {
    readonly help: string;
    readonly helpCommand: string;
    readonly version: string;
    readonly units: string;
    readonly lang: string;
    readonly json: string;
    readonly noColor: string;
    readonly compact: string;
    readonly verbose: string;
    readonly ascii: string;
    readonly noCache: string;
    readonly lat: string;
    readonly lon: string;
    readonly country: string;
    readonly days: string;
    readonly hours: string;
  };
  readonly arguments: {
    readonly city: string;
    readonly cities: string;
    readonly shell: string;
    readonly key: string;
    readonly value: string;
    readonly favorite: string;
  };
  readonly commands: {
    readonly now: string;
    readonly forecast: string;
    readonly hourly: string;
    readonly compare: string;
    readonly config: string;
    readonly configList: string;
    readonly configGet: string;
    readonly configSet: string;
    readonly configUnset: string;
    readonly configReset: string;
    readonly configPath: string;
    readonly fav: string;
    readonly favAdd: string;
    readonly favRemove: string;
    readonly favList: string;
    readonly completion: string;
    readonly cache: string;
    readonly cacheClear: string;
    readonly cachePath: string;
  };

  readonly fetching: string;
  choosePlace(query: string): string;
  bestGuess(place: string, query: string, example: string): string;
  readonly orUseCountry: string;
  invalidEnvUrl(variable: string, value: string): string;
  staleService(time: string, age: string): string;
  /** Argument names in commander's "missing …" errors. */
  readonly argumentNames: Readonly<Record<string, string>>;
  staleData(time: string, age: string): string;
  minutesAgo(minutes: number): string;
  hoursAgo(hours: number): string;
  readonly noCity: string;
  readonly latLonPair: string;
  readonly cityOrCoordinates: string;
  invalidLatitude(value: string): string;
  invalidLongitude(value: string): string;
  invalidInteger(value: string, min: number, max: number): string;
  invalidCountry(value: string): string;
  readonly compareNeedsTwo: string;
  compareTooMany(max: number): string;
  compareFailed(query: string, reason: string): string;
  didYouMean(command: string): string;

  readonly errors: {
    notFound(query: string): string;
    network(host: string): string;
    timeout(host: string): string;
    upstream(status: number, reason: string): string;
    readonly rateLimited: string;
    readonly invalidResponse: string;
    configInvalidJson(path: string): string;
    configInvalidValue(path: string, key: string): string;
    configUnreadable(path: string, code: string): string;
    configNotAFile(path: string): string;
    storage(path: string, reason: string): string;
    notFoundQualified(query: string): string;
    internal(message: string): string;
    readonly verboseHint: string;
    readonly unknownOption: (option: string) => string;
    readonly unknownCommand: (command: string) => string;
    readonly missingArgument: (name: string) => string;
    readonly optionMissingValue: (option: string) => string;
    readonly tooManyArguments: string;
    invalidChoice(value: string, choices: string): string;
    suggestion(options: string): string;
  };

  readonly config: {
    readonly keys: Readonly<Record<'city' | 'units' | 'lang', string>>;
    readonly notSet: string;
    readonly automatic: (value: string) => string;
    fromEnv(value: string, variable: string): string;
    saved(key: string, value: string): string;
    cleared(key: string): string;
    reset(favorites: number): string;
    resetBackup(path: string): string;
    unknownKey(key: string, keys: string): string;
    invalidValue(key: string, value: string, allowed: string): string;
  };

  readonly favorites: {
    added(place: string): string;
    alreadyAdded(place: string): string;
    removed(place: string): string;
    notFound(ref: string): string;
    ambiguous(ref: string): string;
    readonly empty: string;
  };

  readonly home: {
    readonly empty: string;
  };

  cacheCleared(count: number): string;
}
