import { describe, expect, it } from 'vitest';
import type { Forecast } from '../../../src/core/models.ts';
import {
  convert,
  convertForecast,
  unitsForLocale,
} from '../../../src/core/units.ts';

describe('convert', () => {
  it('leaves metric values alone', () => {
    expect(convert.temperature(21.34, 'metric')).toBe(21.34);
    expect(convert.speed(10, 'metric')).toBe(10);
  });

  it('converts to imperial with sensible precision', () => {
    expect(convert.temperature(0, 'imperial')).toBe(32);
    expect(convert.temperature(-40, 'imperial')).toBe(-40);
    expect(convert.temperature(21.5, 'imperial')).toBe(70.7);
    expect(convert.speed(100, 'imperial')).toBe(62.1);
    expect(convert.precipitation(25.4, 'imperial')).toBe(1);
    expect(convert.pressure(1013.25, 'imperial')).toBe(29.92);
  });
});

describe('convertForecast', () => {
  const forecast: Forecast = {
    timezone: 'UTC',
    utcOffsetSeconds: 0,
    current: {
      time: '2026-01-01T12:00',
      temperature: 10,
      feelsLike: 8,
      humidity: 50,
      windSpeed: 16.09344,
      windGusts: null,
      windDirection: 90,
      weatherCode: 0,
      isDay: true,
      uvIndex: 1,
      precipitation: 0,
      pressure: 1013.25,
      cloudCover: 0,
    },
    daily: [
      {
        date: '2026-01-01',
        weatherCode: 0,
        temperatureMax: 20,
        temperatureMin: 10,
        precipitationSum: 2.54,
        precipitationProbability: 10,
        windSpeedMax: null,
        windDirection: null,
        uvIndexMax: null,
        sunrise: null,
        sunset: null,
        daylightSeconds: null,
      },
    ],
    hourly: [
      {
        time: '2026-01-01T12:00',
        temperature: null,
        feelsLike: 0,
        precipitationProbability: 5,
        precipitation: null,
        weatherCode: 0,
        isDay: true,
        windSpeed: 1.609344,
      },
    ],
  };

  it('returns the same object for metric', () => {
    expect(convertForecast(forecast, 'metric')).toBe(forecast);
  });

  it('converts every measurement and keeps nulls', () => {
    const result = convertForecast(forecast, 'imperial');
    expect(result.current).toMatchObject({
      temperature: 50,
      feelsLike: 46.4,
      windSpeed: 10,
      windGusts: null,
      pressure: 29.92,
      humidity: 50,
    });
    expect(result.daily[0]).toMatchObject({
      temperatureMax: 68,
      temperatureMin: 50,
      precipitationSum: 0.1,
      precipitationProbability: 10,
    });
    expect(result.hourly[0]).toMatchObject({
      temperature: null,
      feelsLike: 32,
      windSpeed: 1,
    });
  });

  it('converts the fields that are often null or zero', () => {
    const current = forecast.current!;
    const result = convertForecast(
      {
        ...forecast,
        current: { ...current, windGusts: 32.18688, precipitation: 12.7 },
        daily: [{ ...forecast.daily[0]!, windSpeedMax: 16.09344 }],
        hourly: [
          { ...forecast.hourly[0]!, temperature: 100, precipitation: 25.4 },
        ],
      },
      'imperial'
    );
    expect(result.current).toMatchObject({ windGusts: 20, precipitation: 0.5 });
    expect(result.daily[0]?.windSpeedMax).toBe(10);
    expect(result.hourly[0]).toMatchObject({
      temperature: 212,
      precipitation: 1,
    });
  });
});

describe('unitsForLocale', () => {
  it.each([
    ['en-US', undefined, 'imperial'],
    ['en-US', 'America/Chicago', 'imperial'],
    ['en-US', 'Pacific/Honolulu', 'imperial'],
    ['en-US', 'Europe/Istanbul', 'metric'],
    ['en', 'Asia/Tokyo', 'metric'],
    ['en-GB', 'Europe/London', 'metric'],
    ['tr-TR', 'Europe/Istanbul', 'metric'],
    ['my-MM', 'Asia/Yangon', 'imperial'],
    [undefined, undefined, 'metric'],
    ['not a locale', undefined, 'metric'],
  ] as const)('%s in %s → %s', (locale, zone, units) => {
    expect(unitsForLocale(locale, zone)).toBe(units);
  });
});
