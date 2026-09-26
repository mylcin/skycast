import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  InvalidResponseError,
  UpstreamError,
} from '../../../src/core/errors.ts';
import { createHttpClient } from '../../../src/infra/http.ts';
import {
  createOpenMeteo,
  FORECAST_URL,
  GEOCODING_URL,
} from '../../../src/providers/open-meteo/index.ts';
import { toForecast } from '../../../src/providers/open-meteo/mappers.ts';
import { forecastResponse } from '../../../src/providers/open-meteo/schemas.ts';
import { fixture } from '../../helpers/fixtures.ts';
import { server } from '../../helpers/msw.ts';

const http = createHttpClient({ userAgent: 'test', retries: 0 });
const { weather, geocoding } = createOpenMeteo({ http });
const istanbul = { latitude: 41.01384, longitude: 28.94966 };

describe('geocoding', () => {
  it('sends a normalized query and maps results', async () => {
    let params: URLSearchParams | undefined;
    server.use(
      mock.get(GEOCODING_URL, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json(fixture('geo-istanbul-tr'));
      })
    );
    const results = await geocoding.search({
      name: 'İstanbul',
      language: 'tr-TR',
      countryCode: 'tr',
    });
    expect(Object.fromEntries(params!)).toEqual({
      name: 'İstanbul',
      count: '10',
      language: 'tr',
      format: 'json',
      countryCode: 'TR',
    });
    expect(results[0]).toEqual({
      id: 745044,
      name: 'İstanbul',
      latitude: 41.01384,
      longitude: 28.94966,
      region: 'İstanbul',
      country: 'Türkiye Cumhuriyeti',
      countryCode: 'TR',
      timezone: 'Europe/Istanbul',
      population: 15701602,
      featureCode: 'PPLA',
    });
  });

  it('returns an empty list when nothing matches (the API omits "results")', async () => {
    server.use(
      mock.get(GEOCODING_URL, () => HttpResponse.json(fixture('geo-not-found')))
    );
    expect(
      await geocoding.search({ name: 'Xyzzyqqq', language: 'en' })
    ).toEqual([]);
  });

  it('drops empty admin names and zero populations', async () => {
    server.use(
      mock.get(GEOCODING_URL, () =>
        HttpResponse.json({
          results: [
            {
              id: 1,
              name: 'X',
              latitude: 0,
              longitude: 0,
              admin1: '',
              population: 0,
              country_code: 'gb',
            },
          ],
        })
      )
    );
    const [place] = await geocoding.search({ name: 'X', language: 'en' });
    expect(place).toEqual({
      id: 1,
      name: 'X',
      latitude: 0,
      longitude: 0,
      countryCode: 'GB',
    });
  });
});

describe('forecast', () => {
  it('requests every variable the schema reads, in local time', async () => {
    let params: URLSearchParams | undefined;
    server.use(
      mock.get(FORECAST_URL, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json(fixture('forecast-istanbul'));
      })
    );
    await weather.forecast([istanbul], { current: true, days: 7, hours: 48 });
    expect(params!.get('latitude')).toBe('41.0138');
    expect(params!.get('longitude')).toBe('28.9497');
    expect(params!.get('timezone')).toBe('auto');
    expect(params!.get('forecast_days')).toBe('7');
    expect(params!.get('forecast_hours')).toBe('48');
    expect(params!.get('current')?.split(',')).toContain(
      'apparent_temperature'
    );
    expect(params!.get('daily')?.split(',')).toContain('sunrise');
    expect(params!.get('hourly')?.split(',')).toContain(
      'precipitation_probability'
    );
  });

  it('leaves out hourly and current data that was not asked for', async () => {
    let params: URLSearchParams | undefined;
    server.use(
      mock.get(FORECAST_URL, ({ request }) => {
        params = new URL(request.url).searchParams;
        const body = fixture('forecast-istanbul') as Record<string, unknown>;
        return HttpResponse.json({
          ...body,
          current: undefined,
          hourly: undefined,
        });
      })
    );
    const { forecasts } = await weather.forecast([istanbul], {
      current: false,
      days: 3,
      hours: 0,
    });
    expect(params!.has('hourly')).toBe(false);
    expect(params!.has('current')).toBe(false);
    expect(forecasts[0]).toMatchObject({ current: null, hourly: [] });
  });

  it('maps a real response', async () => {
    server.use(
      mock.get(FORECAST_URL, () =>
        HttpResponse.json(fixture('forecast-istanbul'))
      )
    );
    const { forecasts, freshness } = await weather.forecast([istanbul], {
      current: true,
      days: 7,
      hours: 48,
    });
    const [forecast] = forecasts;
    expect(freshness.cached).toBe(false);
    expect(forecast).toMatchObject({
      timezone: 'Europe/Istanbul',
      utcOffsetSeconds: 10800,
    });
    expect(forecast?.current).toEqual({
      time: '2026-09-27T00:30',
      temperature: 19.4,
      feelsLike: 18.6,
      humidity: 78,
      windSpeed: 17.7,
      windGusts: 31.3,
      windDirection: 39,
      weatherCode: 3,
      isDay: false,
      uvIndex: 0,
      precipitation: 0,
      pressure: 1018.4,
      cloudCover: 100,
    });
    expect(forecast?.daily).toHaveLength(7);
    expect(forecast?.daily[0]).toMatchObject({
      date: '2026-09-27',
      temperatureMax: 19.7,
      sunrise: '2026-09-27T06:56',
      sunset: '2026-09-27T18:53',
    });
    expect(forecast?.hourly).toHaveLength(48);
  });

  it('batches several points and keeps their order', async () => {
    let latitude: string | null = null;
    server.use(
      mock.get(FORECAST_URL, ({ request }) => {
        latitude = new URL(request.url).searchParams.get('latitude');
        return HttpResponse.json(fixture('forecast-compare'));
      })
    );
    const { forecasts } = await weather.forecast(
      [
        istanbul,
        { latitude: 48.85341, longitude: 2.3488 },
        { latitude: 40.71427, longitude: -74.00597 },
      ],
      { current: true, days: 1, hours: 0 }
    );
    expect(latitude).toBe('41.0138,48.8534,40.7143');
    expect(forecasts.map(f => f.timezone)).toEqual([
      'Europe/Istanbul',
      'Europe/Paris',
      'America/New_York',
    ]);
  });

  it('fails when the API returns the wrong number of forecasts', async () => {
    server.use(
      mock.get(FORECAST_URL, () =>
        HttpResponse.json(fixture('forecast-istanbul'))
      )
    );
    await expect(
      weather.forecast([istanbul, istanbul], {
        current: true,
        days: 1,
        hours: 0,
      })
    ).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('surfaces the API error reason', async () => {
    server.use(
      mock.get(FORECAST_URL, () =>
        HttpResponse.json(fixture('forecast-error-400'), { status: 400 })
      )
    );
    const error = await weather
      .forecast([{ latitude: 95, longitude: 0 }], {
        current: true,
        days: 1,
        hours: 0,
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error).toMatchObject({
      reason: 'Latitude must be in range of -90 to 90°. Given: 95.0.',
    });
  });

  it('rejects a response missing required fields', async () => {
    server.use(
      mock.get(FORECAST_URL, () => HttpResponse.json({ timezone: 'UTC' }))
    );
    await expect(
      weather.forecast([istanbul], { current: true, days: 1, hours: 0 })
    ).rejects.toThrow(/utc_offset_seconds/);
  });
});

describe('toForecast', () => {
  it('has no sunrise or sunset during polar night', () => {
    const [point] = forecastResponse.parse({
      timezone: 'Antarctica/Troll',
      utc_offset_seconds: 7200,
      daily: {
        time: ['2026-06-26'],
        weather_code: [3],
        temperature_2m_max: [-40],
        temperature_2m_min: [-50],
        sunrise: ['2026-06-26T00:00'],
        sunset: ['2026-06-26T00:00'],
        daylight_duration: [0],
        uv_index_max: [0],
        precipitation_sum: [0],
        precipitation_probability_max: [null],
        wind_speed_10m_max: [10],
        wind_direction_10m_dominant: [180],
      },
    });
    const forecast = toForecast(point!);
    expect(forecast.daily[0]).toMatchObject({
      sunrise: null,
      sunset: null,
      daylightSeconds: 0,
    });
  });

  it('skips days without temperatures', () => {
    const body = fixture('forecast-istanbul') as {
      daily: Record<string, unknown[]>;
    };
    body.daily.temperature_2m_max![1] = null;
    const [point] = forecastResponse.parse(body);
    const forecast = toForecast(point!);
    expect(forecast.daily).toHaveLength(6);
  });
});
