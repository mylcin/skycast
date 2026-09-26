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

/** Countries that use Fahrenheit and miles in daily life. */
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW']);

/** A sensible default from a BCP 47 locale such as "en-US". */
export function unitsForLocale(locale: string | undefined): UnitSystem {
  if (!locale) return 'metric';
  try {
    const region = new Intl.Locale(locale).maximize().region;
    return region && IMPERIAL_REGIONS.has(region) ? 'imperial' : 'metric';
  } catch {
    return 'metric';
  }
}
