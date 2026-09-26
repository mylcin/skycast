import { InvalidResponseError } from '../../core/errors.ts';
import type { Coordinates, Forecast, Freshness } from '../../core/models.ts';
import type { HttpClient } from '../../infra/http.ts';
import type { ForecastRequest, WeatherProvider } from '../types.ts';
import { toForecast } from './mappers.ts';
import {
  type ForecastPoint,
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
const MAX_DAYS = 16;
/** Points per request: about 2,200 characters of coordinates. */
const BATCH = 50;

/** One answer's freshness for several batches: as old and as stale as the worst. */
function mergeFreshness(all: readonly Freshness[]): Freshness {
  const [first, ...rest] = all;
  if (!first) return { fetchedAt: new Date(), cached: false, stale: false };
  return rest.reduce<Freshness>((merged, next) => {
    const stale = merged.stale || next.stale;
    const staleBecause = merged.staleBecause ?? next.staleBecause;
    return {
      fetchedAt:
        next.fetchedAt < merged.fetchedAt ? next.fetchedAt : merged.fetchedAt,
      cached: merged.cached && next.cached,
      stale,
      ...(stale && staleBecause && { staleBecause }),
    };
  }, first);
}

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
  async function fetchBatch(
    points: readonly Coordinates[],
    request: ForecastRequest,
    signal?: AbortSignal
  ): Promise<{ data: ForecastPoint[]; freshness: Freshness }> {
    const query = new URL(url);
    const params = query.searchParams;
    // Several points go in one request; the API answers with an array.
    params.set('latitude', points.map(p => coordinate(p.latitude)).join(','));
    params.set('longitude', points.map(p => coordinate(p.longitude)).join(','));
    if (request.current) params.set('current', CURRENT_VARIABLES.join(','));
    params.set('daily', DAILY_VARIABLES.join(','));
    // A spare day and hour: fromNow() trims what is already past, and a
    // cached answer read just after midnight still has a full window.
    params.set('forecast_days', String(Math.min(request.days + 1, MAX_DAYS)));
    if (request.hours > 0) {
      params.set('hourly', HOURLY_VARIABLES.join(','));
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
    return { data, freshness };
  }

  return {
    id: 'open-meteo',
    attribution: {
      text: 'Weather data by Open-Meteo.com',
      url: 'https://open-meteo.com/',
      license: 'CC BY 4.0',
    },
    maxDays: MAX_DAYS,
    maxHours: MAX_HOURS,
    async forecast(points, request, signal) {
      // Long lists are split so the URL stays well under server limits.
      const batches: (typeof points)[] = [];
      for (let i = 0; i < points.length; i += BATCH) {
        batches.push(points.slice(i, i + BATCH));
      }
      const answers = await Promise.all(
        batches.map(batch => fetchBatch(batch, request, signal))
      );
      const at = now();
      return {
        forecasts: answers.flatMap(answer =>
          answer.data.map(point => fromNow(toForecast(point), request, at))
        ),
        freshness: mergeFreshness(answers.map(answer => answer.freshness)),
      };
    },
  };
}
