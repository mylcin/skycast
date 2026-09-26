import { InvalidResponseError } from '../../core/errors.ts';
import type { Forecast } from '../../core/models.ts';
import type { HttpClient } from '../../infra/http.ts';
import type { ForecastRequest, WeatherProvider } from '../types.ts';
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

const MAX_HOURS = 384;

export interface OpenMeteoWeatherOptions {
  readonly http: HttpClient;
  readonly url?: string;
  /** Decides which hours and days are past. Injected in tests. */
  readonly now?: () => Date;
}

/** "YYYY-MM-DDTHH" at the location, from its current UTC offset. */
function localHour(now: Date, offsetSeconds: number): string {
  return new Date(now.getTime() + offsetSeconds * 1000)
    .toISOString()
    .slice(0, 13);
}

/**
 * Keeps the requested window starting at the location's current hour and
 * day. The API starts `forecast_hours` an hour early in zones with a
 * half-hour offset (India, Nepal, Adelaide), and a cached answer may be
 * minutes or hours old.
 */
function fromNow(
  forecast: Forecast,
  request: ForecastRequest,
  now: Date
): Forecast {
  const hour = localHour(now, forecast.utcOffsetSeconds);
  const today = hour.slice(0, 10);
  return {
    ...forecast,
    daily: forecast.daily
      .filter(day => day.date >= today)
      .slice(0, request.days),
    hourly: forecast.hourly
      .filter(entry => entry.time.slice(0, 13) >= hour)
      .slice(0, request.hours),
  };
}

export function createOpenMeteoWeather({
  http,
  url = FORECAST_URL,
  now = () => new Date(),
}: OpenMeteoWeatherOptions): WeatherProvider {
  return {
    id: 'open-meteo',
    attribution: {
      text: 'Weather data by Open-Meteo.com',
      url: 'https://open-meteo.com/',
      license: 'CC BY 4.0',
    },
    maxDays: 16,
    maxHours: MAX_HOURS,
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
        // One spare hour covers the early start trimmed by fromNow().
        params.set(
          'forecast_hours',
          String(Math.min(request.hours + 1, MAX_HOURS))
        );
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
      const at = now();
      return {
        forecasts: data.map(point => fromNow(toForecast(point), request, at)),
        freshness,
      };
    },
  };
}
