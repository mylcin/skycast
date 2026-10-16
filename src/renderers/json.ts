import { nextChanges } from '../core/changes.ts';
import { conditionGroup } from '../core/conditions.ts';
import type { Location, WeatherReport } from '../core/models.ts';
import { UNIT_LABELS } from '../core/units.ts';
import type { Messages } from '../i18n/index.ts';
import { describeChange } from './changes.ts';
import { conditionText } from './common.ts';
import { getSymbols } from './symbols.ts';

/**
 * The `--json` contract. Bump the version on breaking changes; adding fields
 * is not breaking. Numbers are in the units named in `units`.
 */
export const JSON_SCHEMA_VERSION = 1;

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json | undefined };

export function locationJson(location: Location): Json {
  return {
    name: location.name,
    region: location.region,
    country: location.country,
    countryCode: location.countryCode,
    latitude: location.latitude,
    longitude: location.longitude,
    timezone: location.timezone,
  };
}

const condition = (code: number | null, t: Messages) => ({
  weatherCode: code,
  condition: conditionGroup(code),
  description: conditionText(code, t),
});

export function reportJson(
  report: WeatherReport,
  t: Messages
): { [key: string]: Json | undefined } {
  const { current } = report;
  return {
    location: locationJson(report.location),
    units: { system: report.units, ...UNIT_LABELS[report.units] },
    current: current && {
      time: current.time,
      temperature: current.temperature,
      feelsLike: current.feelsLike,
      humidity: current.humidity,
      windSpeed: current.windSpeed,
      windGusts: current.windGusts,
      windDirection: current.windDirection,
      ...condition(current.weatherCode, t),
      isDay: current.isDay,
      uvIndex: current.uvIndex,
      precipitation: current.precipitation,
      pressure: current.pressure,
      cloudCover: current.cloudCover,
    },
    daily: report.daily.map(day => ({
      date: day.date,
      ...condition(day.weatherCode, t),
      temperatureMin: day.temperatureMin,
      temperatureMax: day.temperatureMax,
      precipitationSum: day.precipitationSum,
      precipitationProbability: day.precipitationProbability,
      windSpeedMax: day.windSpeedMax,
      windDirection: day.windDirection,
      uvIndexMax: day.uvIndexMax,
      sunrise: day.sunrise,
      sunset: day.sunset,
      // Tells polar night (0) from midnight sun (86400) when there is no sunrise.
      daylightSeconds: day.daylightSeconds,
    })),
    hourly: report.hourly.map(hour => ({
      time: hour.time,
      temperature: hour.temperature,
      feelsLike: hour.feelsLike,
      precipitationProbability: hour.precipitationProbability,
      precipitation: hour.precipitation,
      ...condition(hour.weatherCode, t),
      isDay: hour.isDay,
      windSpeed: hour.windSpeed,
      windGusts: hour.windGusts,
    })),
    meta: {
      fetchedAt: report.freshness.fetchedAt.toISOString(),
      cached: report.freshness.cached,
      stale: report.freshness.stale,
      // "offline" or "unavailable"; left out for fresh data.
      staleBecause: report.freshness.staleBecause,
    },
    attribution: report.attribution.map(a => ({
      text: a.text,
      url: a.url,
      license: a.license,
    })),
  };
}

/**
 * What changes next (see core/changes.ts), each with its sentence in the
 * UI language, for status bars and notifications.
 */
export function changesJson(report: WeatherReport, t: Messages): Json[] {
  const symbols = getSymbols(true);
  return nextChanges(report, report.units).map(change => ({
    ...change,
    description: describeChange(change, report, t, symbols),
  }));
}

/**
 * `now` as JSON: the report as it always was, today without hours, plus
 * the `changes` that the extra hours and day were fetched for.
 */
export function nowJson(
  report: WeatherReport,
  t: Messages
): { [key: string]: Json | undefined } {
  return {
    ...reportJson(
      { ...report, daily: report.daily.slice(0, 1), hourly: [] },
      t
    ),
    changes: changesJson(report, t),
  };
}

/** Pretty JSON with a trailing newline. `undefined` fields are left out. */
export function renderJson(value: Json): string {
  return `${JSON.stringify({ schemaVersion: JSON_SCHEMA_VERSION, ...(value as object) }, null, 2)}\n`;
}
