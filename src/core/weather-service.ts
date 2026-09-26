import type {
  Attribution,
  Location,
  UnitSystem,
  WeatherReport,
} from './models.ts';
import type { ForecastRequest, WeatherProvider } from '../providers/types.ts';
import { convertForecast } from './units.ts';

export interface ReportOptions {
  readonly units: UnitSystem;
  readonly signal?: AbortSignal;
}

export interface WeatherService {
  readonly maxDays: number;
  readonly maxHours: number;
  /** One report per location, in order, fetched together. */
  reports(
    locations: readonly Location[],
    request: ForecastRequest,
    options: ReportOptions
  ): Promise<WeatherReport[]>;
}

export interface WeatherServiceDeps {
  readonly weather: WeatherProvider;
  /** Credited when a report's location came from geocoding. */
  readonly geocodingAttribution?: Attribution;
}

/** A whole number within bounds; anything else becomes the fallback. */
function whole(
  value: number,
  min: number,
  max: number,
  fallback: number
): number {
  return Number.isFinite(value)
    ? Math.min(Math.max(Math.trunc(value), min), max)
    : fallback;
}

export function createWeatherService({
  weather,
  geocodingAttribution,
}: WeatherServiceDeps): WeatherService {
  return {
    maxDays: weather.maxDays,
    maxHours: weather.maxHours,
    async reports(locations, request, { units, signal }) {
      if (locations.length === 0) return [];
      const { forecasts, freshness } = await weather.forecast(
        locations,
        {
          current: request.current,
          days: whole(request.days, 1, weather.maxDays, 1),
          hours: whole(request.hours, 0, weather.maxHours, 0),
        },
        signal
      );
      return locations.map((location, index) => {
        const forecast = forecasts[index];
        if (!forecast) {
          throw new Error(`Provider returned no forecast for point ${index}`);
        }
        const attribution = [weather.attribution];
        if (location.name !== null && geocodingAttribution) {
          attribution.push(geocodingAttribution);
        }
        return {
          ...convertForecast(forecast, units),
          location: {
            ...location,
            timezone: location.timezone ?? forecast.timezone,
          },
          units,
          freshness,
          attribution,
        };
      });
    },
  };
}
