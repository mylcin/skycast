import { conditionGroup, isPrecipitation } from './conditions.ts';
import type {
  Forecast,
  HourlyForecast,
  LocalDate,
  LocalDateTime,
  UnitSystem,
} from './models.ts';

/**
 * What changes next, read off the forecast with fixed thresholds. Nothing
 * here predicts anything the forecast doesn't say: every change names its
 * hour, and precipitation keeps the forecast's own probability.
 */

export type Precipitation = 'rain' | 'snow' | 'storm' | 'freezing';

export type Change =
  | {
      readonly kind: 'precipitation-starts' | 'precipitation-eases';
      readonly time: LocalDateTime;
      readonly precipitation: Precipitation;
      /** The forecast's probability for that hour, %. */
      readonly probability: number;
    }
  | {
      readonly kind: 'gusts';
      /** The first hour with strong gusts. */
      readonly time: LocalDateTime;
      /** The strongest gust from then on, within the window. */
      readonly speed: number;
    }
  | {
      readonly kind: 'temperature';
      readonly date: LocalDate;
      /** Tomorrow's high, and today's: the difference is between them. */
      readonly high: number;
      readonly previous: number;
    };

/** Hours ahead that are looked at, after the current one. */
export const WINDOW_HOURS = 12;

/** Precipitation is likely from this probability, %. */
const LIKELY = 50;

interface Thresholds {
  /** An hour is wet from this amount on, if it is also likely. */
  readonly wet: number;
  /** An hour is dry below this amount, if it is also not likely. */
  readonly dry: number;
  /** A change in the high, in whole degrees, worth mentioning. */
  readonly temperature: number;
  /** Gusts from this speed on. */
  readonly gusts: number;
}

/** In the report's own units. Inches arrive rounded to hundredths. */
const THRESHOLDS: Record<UnitSystem, Thresholds> = {
  metric: { wet: 0.2, dry: 0.1, temperature: 5, gusts: 50 },
  imperial: { wet: 0.01, dry: 0.01, temperature: 9, gusts: 31 },
};

function precipitationOf(code: number | null): Precipitation {
  const group = conditionGroup(code);
  if (group === 'snow' || group === 'heavy-snow') return 'snow';
  if (group === 'thunderstorm') return 'storm';
  if (group === 'freezing-rain') return 'freezing';
  // Drizzle and rain, and wet hours whose code only says "cloudy".
  return 'rain';
}

/**
 * The changes worth a line in the `now` view, most useful first: rain or
 * snow starting or easing, then strong gusts, then a warmer or colder day
 * tomorrow. Empty when nothing crosses a threshold or the data isn't there.
 */
export function nextChanges(forecast: Forecast, units: UnitSystem): Change[] {
  const limits = THRESHOLDS[units];
  const { current, daily } = forecast;
  // Hour 0 is the current hour; the window is the hours after it.
  const [now, ...rest] = forecast.hourly;
  const ahead = rest.slice(0, WINDOW_HOURS);
  const chance = (hour: HourlyForecast): number =>
    hour.precipitationProbability ?? 0;
  const amount = (hour: HourlyForecast): number => hour.precipitation ?? 0;
  const wet = (hour: HourlyForecast): boolean =>
    chance(hour) >= LIKELY && amount(hour) >= limits.wet;
  // Both rules are strict on purpose: rain is announced, and its end too,
  // only when amount and probability agree.
  const dry = (hour: HourlyForecast | undefined): boolean =>
    hour === undefined || (chance(hour) < LIKELY && amount(hour) < limits.dry);

  const changes: Change[] = [];

  const fallingNow =
    current !== null && isPrecipitation(conditionGroup(current.weatherCode))
      ? current.weatherCode
      : now && wet(now)
        ? now.weatherCode
        : undefined;
  if (fallingNow === undefined) {
    const start = ahead.find(wet);
    if (start) {
      changes.push({
        kind: 'precipitation-starts',
        time: start.time,
        precipitation: precipitationOf(start.weatherCode),
        probability: chance(start),
      });
    }
  } else {
    // One dry hour in the middle of rain is a lull, not the end of it.
    const index = ahead.findIndex((hour, i) => dry(hour) && dry(ahead[i + 1]));
    const end = ahead[index];
    if (end) {
      changes.push({
        kind: 'precipitation-eases',
        time: end.time,
        precipitation: precipitationOf(fallingNow),
        probability: chance(end),
      });
    }
  }

  // Gusts that are already blowing are not a change.
  const strong = (gust: number | null): boolean =>
    gust !== null && gust >= limits.gusts;
  if (!strong(now?.windGusts ?? null) && !strong(current?.windGusts ?? null)) {
    const first = ahead.findIndex(hour => strong(hour.windGusts));
    const start = ahead[first];
    if (start) {
      changes.push({
        kind: 'gusts',
        time: start.time,
        speed: Math.max(...ahead.slice(first).map(hour => hour.windGusts ?? 0)),
      });
    }
  }

  // Today is the later of the data's clock and its first day: a cached
  // answer read after midnight still says yesterday.
  const today = [current?.time.slice(0, 10), daily[0]?.date]
    .filter((date): date is string => date !== undefined)
    .reduce((a, b) => (b > a ? b : a), '');
  const index = daily.findIndex(day => day.date === today);
  const [todays, tomorrows] = index === -1 ? [] : daily.slice(index, index + 2);
  if (todays && tomorrows) {
    const difference =
      Math.round(tomorrows.temperatureMax) - Math.round(todays.temperatureMax);
    if (Math.abs(difference) >= limits.temperature) {
      changes.push({
        kind: 'temperature',
        date: tomorrows.date,
        high: tomorrows.temperatureMax,
        previous: todays.temperatureMax,
      });
    }
  }

  return changes;
}
