import { InvalidResponseError } from '../../core/errors.ts';
import type { HttpClient } from '../../infra/http.ts';
import type { WeatherProvider } from '../types.ts';
import { toForecast } from './mappers.ts';
import {
  CURRENT_VARIABLES,
  DAILY_VARIABLES,
  forecastResponse,
  HOURLY_VARIABLES,
  parser,
} from './schemas.ts';

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** Models update hourly at best; 10 minutes keeps repeated runs instant. */
const CACHE = { ttlMs: 10 * 60_000, staleMs: 24 * 3_600_000 };
const parse = parser(forecastResponse);

/** 4 decimals is ~11 m: plenty for a weather grid, and better cache hits. */
const coordinate = (value: number): string => String(Number(value.toFixed(4)));

export interface OpenMeteoWeatherOptions {
  readonly http: HttpClient;
  readonly url?: string;
}

export function createOpenMeteoWeather({
  http,
  url = FORECAST_URL,
}: OpenMeteoWeatherOptions): WeatherProvider {
  return {
    id: 'open-meteo',
    attribution: {
      text: 'Weather data by Open-Meteo.com',
      url: 'https://open-meteo.com/',
      license: 'CC BY 4.0',
    },
    maxDays: 16,
    maxHours: 384,
    async forecast(points, request, signal) {
      const query = new URL(url);
      const params = query.searchParams;
      // Several points go in one request; the API answers with an array.
      params.set('latitude', points.map(p => coordinate(p.latitude)).join(','));
      params.set(
        'longitude',
        points.map(p => coordinate(p.longitude)).join(',')
      );
      if (request.current) params.set('current', CURRENT_VARIABLES.join(','));
      params.set('daily', DAILY_VARIABLES.join(','));
      params.set('forecast_days', String(request.days));
      if (request.hours > 0) {
        params.set('hourly', HOURLY_VARIABLES.join(','));
        params.set('forecast_hours', String(request.hours));
      }
      // Without it, days and times are in GMT.
      params.set('timezone', 'auto');

      const { data, freshness } = await http.getJson(query, {
        parse,
        cache: CACHE,
        ...(signal && { signal }),
      });
      if (data.length !== points.length) {
        throw new InvalidResponseError(
          query.host,
          `expected ${points.length} forecasts, got ${data.length}`
        );
      }
      return { forecasts: data.map(toForecast), freshness };
    },
  };
}
