import type { Forecast, UnitSystem } from './models.ts';

export interface UnitLabels {
  readonly temperature: string;
  readonly speed: string;
  readonly precipitation: string;
  readonly pressure: string;
}

export const UNIT_LABELS: Record<UnitSystem, UnitLabels> = {
  metric: {
    temperature: '°C',
    speed: 'km/h',
    precipitation: 'mm',
    pressure: 'hPa',
  },
  imperial: {
    temperature: '°F',
    speed: 'mph',
    precipitation: 'in',
    pressure: 'inHg',
  },
};

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Converts canonical metric values. Metric values pass through untouched. */
export const convert = {
  temperature: (celsius: number, units: UnitSystem): number =>
    units === 'metric' ? celsius : round((celsius * 9) / 5 + 32, 1),
  speed: (kmh: number, units: UnitSystem): number =>
    units === 'metric' ? kmh : round(kmh / 1.609344, 1),
  precipitation: (mm: number, units: UnitSystem): number =>
    units === 'metric' ? mm : round(mm / 25.4, 2),
  pressure: (hPa: number, units: UnitSystem): number =>
    units === 'metric' ? hPa : round(hPa * 0.0295299830714, 2),
};

function maybe<T extends number | null>(
  value: T,
  fn: (value: number) => number
): T | number {
  return value === null ? value : fn(value);
}

/** Returns the forecast with every measurement in `units`. */
export function convertForecast(
  forecast: Forecast,
  units: UnitSystem
): Forecast {
  if (units === 'metric') return forecast;
  const t = (v: number): number => convert.temperature(v, units);
  const s = (v: number): number => convert.speed(v, units);
  const p = (v: number): number => convert.precipitation(v, units);
  const current = forecast.current;
  return {
    ...forecast,
    current: current && {
      ...current,
      temperature: t(current.temperature),
      feelsLike: t(current.feelsLike),
      windSpeed: s(current.windSpeed),
      windGusts: maybe(current.windGusts, s),
      precipitation: maybe(current.precipitation, p),
      pressure: maybe(current.pressure, v => convert.pressure(v, units)),
    },
    daily: forecast.daily.map(day => ({
      ...day,
      temperatureMax: t(day.temperatureMax),
      temperatureMin: t(day.temperatureMin),
      precipitationSum: maybe(day.precipitationSum, p),
      windSpeedMax: maybe(day.windSpeedMax, s),
    })),
    hourly: forecast.hourly.map(hour => ({
      ...hour,
      temperature: maybe(hour.temperature, t),
      feelsLike: maybe(hour.feelsLike, t),
      precipitation: maybe(hour.precipitation, p),
      windSpeed: maybe(hour.windSpeed, s),
    })),
  };
}

/**
 * Countries that use Fahrenheit and miles in daily life, with the time zones
 * they span. Plenty of people outside the US keep an "en_US" locale, so the
 * time zone has to agree before imperial units become the default.
 */
const IMPERIAL_ZONES: Record<string, readonly string[]> = {
  US: [
    'America/',
    'US/',
    'Pacific/Honolulu',
    'Pacific/Guam',
    'Pacific/Saipan',
    'Pacific/Pago_Pago',
  ],
  LR: ['Africa/Monrovia'],
  MM: ['Asia/Yangon', 'Asia/Rangoon'],
  BS: ['America/Nassau'],
  BZ: ['America/Belize'],
  KY: ['America/Cayman'],
  PW: ['Pacific/Palau'],
};

/** A sensible default from a BCP 47 locale ("en-US") and an IANA time zone. */
export function unitsForLocale(
  locale: string | undefined,
  timeZone?: string
): UnitSystem {
  if (!locale) return 'metric';
  try {
    const region = new Intl.Locale(locale).maximize().region;
    const zones = region ? IMPERIAL_ZONES[region] : undefined;
    if (!zones) return 'metric';
    if (!timeZone) return 'imperial';
    return zones.some(zone => timeZone.startsWith(zone))
      ? 'imperial'
      : 'metric';
  } catch {
    return 'metric';
  }
}
