import type { Messages } from './types.ts';

export const en: Messages = {
  lang: 'en',
  locale: 'en',
  decimalSeparator: '.',
  percent: value => `${value}%`,

  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  months: [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ],
  today: 'Today',
  tomorrow: 'Tomorrow',

  conditions: {
    0: 'Clear',
    1: 'Mostly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Freezing fog',
    51: 'Light drizzle',
    53: 'Drizzle',
    55: 'Heavy drizzle',
    56: 'Light freezing drizzle',
    57: 'Freezing drizzle',
    61: 'Light rain',
    63: 'Rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Freezing rain',
    71: 'Light snow',
    73: 'Snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Light showers',
    81: 'Showers',
    82: 'Heavy showers',
    85: 'Light snow showers',
    86: 'Snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with hail',
    99: 'Thunderstorm with heavy hail',
  },
  unknownCondition: 'Unknown',
  compass: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  uv: {
    low: 'low',
    moderate: 'moderate',
    high: 'high',
    veryHigh: 'very high',
    extreme: 'extreme',
  },
  units: {
    kmh: 'km/h',
    mph: 'mph',
    mm: 'mm',
    in: 'in',
    hPa: 'hPa',
    inHg: 'inHg',
  },

  weather: {
    feelsLike: value => `feels like ${value}`,
    humidity: 'Humidity',
    wind: 'Wind',
    gusts: value => `gusts ${value}`,
    uv: 'UV',
    sunrise: 'Sunrise',
    sunset: 'Sunset',
    polarNight: 'Polar night',
    midnightSun: 'Midnight sun',
    pressure: 'Pressure',
    clouds: 'Clouds',
    todayRange: (low, high) => `Today ${low} to ${high}`,
    chanceOfRain: value => `rain ${value}`,
    noData: 'No data for this period yet.',
  },

  forecast: {
    title: days => (days === 1 ? 'Today' : `${days}-day forecast`),
    day: 'Day',
    condition: 'Condition',
    low: 'Low',
    high: 'High',
    range: 'Range',
    rain: 'Rain',
    precipitation: 'Amount',
    wind: 'Wind',
  },

  hourly: {
    title: hours => (hours === 1 ? 'Next hour' : `Next ${hours} hours`),
    day: 'Day',
    time: 'Time',
    temperature: 'Temp',
    rain: 'Rain',
    condition: 'Condition',
    wind: 'Wind',
    rainPeak: value => `peak ${value}`,
    dry: 'dry',
  },

  compare: {
    title: count => `${count} places`,
    place: 'Place',
    now: 'Now',
    feelsLike: 'Feels',
    condition: 'Condition',
    wind: 'Wind',
    humidity: 'Humidity',
    today: 'Today',
  },

  cli: {
    description:
      'Weather in your terminal: ASCII art, colour-coded forecasts and side-by-side city comparisons.',
    headings: {
      'Usage:': 'Usage:',
      'Arguments:': 'Arguments:',
      'Options:': 'Options:',
      'Global Options:': 'Global Options:',
      'Commands:': 'Commands:',
    },
    examples: 'Examples:',
    helpChoices: choices => `one of: ${choices}`,
    helpDefault: value => `default: ${value}`,
    options: {
      help: 'show help',
      helpCommand: 'show help for a command',
      version: 'show the version',
      units: 'unit system',
      lang: 'language',
      json: 'print JSON, for scripts',
      noColor: 'plain text without colours',
      compact: 'shorter output',
      verbose: 'explain what happens, on stderr',
      ascii: 'ASCII only, no Unicode symbols',
      noCache: 'always fetch fresh data',
      lat: 'latitude, instead of a city',
      lon: 'longitude, instead of a city',
      country: 'only places in this country (ISO code, e.g. TR)',
      days: 'number of days, 1–16',
      hours: 'number of hours, 1–168',
    },
    arguments: {
      city: 'place name; add the country to be precise: "Paris, France"',
      cities: 'two or more places; quote names with spaces',
      shell: 'bash, zsh or fish',
      key: 'city, units or lang',
      value: 'the new value',
      favorite: 'name or number from "fav list"',
    },
    commands: {
      now: 'current weather',
      forecast: 'daily forecast',
      hourly: 'hour-by-hour forecast with charts',
      compare: 'compare places side by side',
      config: 'show or change settings',
      configList: 'show all settings',
      configGet: 'show one setting',
      configSet: 'change a setting',
      configUnset: 'go back to the default for a setting',
      configReset: 'go back to the defaults for everything',
      configPath: 'show where settings are stored',
      fav: 'manage favourite places',
      favAdd: 'add a favourite',
      favRemove: 'remove a favourite',
      favList: 'list favourites',
      completion: 'print a shell completion script',
      cache: 'manage cached responses',
      cacheClear: 'delete cached responses',
      cachePath: 'show where cached responses are stored',
    },

    fetching: 'Fetching the weather…',
    choosePlace: query => `Which “${query}”?`,
    bestGuess: (place, query, example) =>
      `Showing ${place}. Other places are called “${query}” too: add a country or region, like “${example}”.`,
    orUseCountry: 'Or use --country.',
    invalidEnvUrl: (variable, value) =>
      `${variable} must be a full http(s) URL without a password, not “${value}”.`,
    staleService: (time, age) =>
      `The weather service is not answering: showing data from ${time} (${age}).`,
    argumentNames: {
      command: 'a command',
      place: 'a place',
      places: 'the places',
      shell: 'the shell',
      key: 'the setting',
      value: 'the value',
      favorite: 'the favourite',
    },
    staleData: (time, age) => `Offline: showing data from ${time} (${age}).`,
    minutesAgo: minutes =>
      minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`,
    hoursAgo: hours => (hours === 1 ? '1 hour ago' : `${hours} hours ago`),
    noCity:
      'Which place? Try “skycast now Istanbul”, or set a default with “skycast config set city Istanbul”.',
    latLonPair: '--lat and --lon go together.',
    cityOrCoordinates: 'Give either a place name or --lat/--lon, not both.',
    invalidLatitude: value =>
      `“${value}” is not a latitude between -90 and 90.`,
    invalidLongitude: value =>
      `“${value}” is not a longitude between -180 and 180.`,
    invalidInteger: (value, min, max) =>
      `“${value}” is not a whole number from ${min} to ${max}.`,
    invalidCountry: value =>
      `“${value}” is not a two-letter country code (TR, DE, US…).`,
    compareNeedsTwo: 'Compare needs at least two places.',
    compareTooMany: max => `Compare up to ${max} places at a time.`,
    compareFailed: (query, reason) => `${query}: ${reason}`,
    didYouMean: command => `Did you mean “skycast ${command}”?`,

    errors: {
      notFound: query =>
        `No place called “${query}”. Check the spelling, or add the country: “${query}, TR”.`,
      network: host =>
        `Could not reach ${host}. Check your connection; recent results are kept for offline use.`,
      timeout: host => `${host} did not answer in time. Try again in a moment.`,
      upstream: (status, reason) =>
        `The weather service returned an error (${status}): ${reason}`,
      rateLimited:
        'Too many requests to the weather service. Wait a minute and try again.',
      invalidResponse:
        'The weather service sent an answer skycast does not understand. Try again later.',
      configInvalidJson: path =>
        `The settings file ${path} is not valid JSON. Fix it, or run “skycast config reset”: the old file is kept as a backup.`,
      configInvalidValue: (path, key) =>
        `The setting “${key}” in ${path} is not valid. Change it with “skycast config set”, or run “skycast config reset”; favourites are kept.`,
      configUnreadable: (path, code) =>
        `skycast cannot read ${path} (${code}). Check the file's permissions.`,
      configNotAFile: path =>
        `${path} should be a file, but it is a folder. Move it out of the way.`,
      storage: (path, reason) =>
        `skycast could not write ${path} (${reason}). Check that the folder exists and is writable.`,
      notFoundQualified: query =>
        `No place called “${query}”. Check the spelling.`,
      internal: message => `Something went wrong: ${message}`,
      verboseHint:
        'Run it again with --verbose for details, and report it at https://github.com/mylcin/weather-cli/issues',
      unknownOption: option => `unknown option ${option}`,
      unknownCommand: command => `unknown command “${command}”`,
      missingArgument: name => `missing ${name}`,
      optionMissingValue: option => `${option} needs a value`,
      tooManyArguments: 'too many arguments',
      invalidChoice: (value, choices) => `“${value}” is not one of: ${choices}`,
      suggestion: options => `Did you mean ${options}?`,
    },

    config: {
      keys: { city: 'city', units: 'units', lang: 'lang' },
      notSet: 'not set',
      automatic: value => `${value} (automatic)`,
      fromEnv: (value, variable) => `${value} (from ${variable})`,
      saved: (key, value) => `${key} set to ${value}.`,
      cleared: key => `${key} is back to its default.`,
      reset: favorites =>
        favorites === 0
          ? 'Settings are back to their defaults.'
          : `Settings are back to their defaults; ${favorites === 1 ? '1 favourite was' : `${favorites} favourites were`} kept.`,
      resetBackup: path =>
        `Settings are back to their defaults. The old file is at ${path}.`,
      unknownKey: (key, keys) =>
        `There is no setting called “${key}”. Settings: ${keys}.`,
      invalidValue: (key, value, allowed) =>
        `“${value}” is not a valid ${key}. Use one of: ${allowed}.`,
    },

    favorites: {
      added: place => `Added ${place} to favourites.`,
      alreadyAdded: place => `${place} is already a favourite.`,
      removed: place => `Removed ${place} from favourites.`,
      notFound: ref => `No favourite matches “${ref}”. See “skycast fav list”.`,
      ambiguous: ref =>
        `More than one favourite matches “${ref}”. Remove it by its number from “skycast fav list”.`,
      empty: 'No favourites yet. Add one with “skycast fav add Istanbul”.',
    },

    home: {
      empty:
        'Set a default place with “skycast config set city Istanbul” or add favourites with “skycast fav add Paris”; then plain “skycast” shows them.',
    },

    cacheCleared: count =>
      count === 1
        ? 'Removed 1 cached response.'
        : `Removed ${count} cached responses.`,
  },

  coordinates: (latitude, longitude) => `${latitude}, ${longitude}`,
  north: 'N',
  south: 'S',
  east: 'E',
  west: 'W',
};
