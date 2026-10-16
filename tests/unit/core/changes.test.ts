import { describe, expect, it } from 'vitest';
import { nextChanges } from '../../../src/core/changes.ts';
import type {
  DailyForecast,
  Forecast,
  HourlyForecast,
} from '../../../src/core/models.ts';
import { sampleForecast } from '../../helpers/fakes.ts';

/** Thirteen hours from 14:00: the current one and the twelve after it. */
function hours(
  change: (hour: number) => Partial<HourlyForecast> = () => ({})
): HourlyForecast[] {
  return Array.from({ length: 13 }, (_, i) => ({
    time: new Date(Date.UTC(2026, 8, 27, 14 + i)).toISOString().slice(0, 16),
    temperature: 20,
    feelsLike: 20,
    precipitationProbability: 0,
    precipitation: 0,
    weatherCode: 3,
    isDay: true,
    windSpeed: 10,
    windGusts: 20,
    ...change(i),
  }));
}

const day = (date: string, high: number): DailyForecast => ({
  date,
  weatherCode: 3,
  temperatureMax: high,
  temperatureMin: high - 8,
  precipitationSum: 0,
  precipitationProbability: 0,
  windSpeedMax: 10,
  windDirection: 0,
  uvIndexMax: 3,
  sunrise: `${date}T06:56`,
  sunset: `${date}T18:53`,
  daylightSeconds: 43_000,
});

const forecast = (overrides: Partial<Forecast>): Forecast =>
  sampleForecast({ daily: [day('2026-09-27', 20)], ...overrides });

describe('nextChanges', () => {
  it('finds nothing in a quiet forecast, or without hourly data', () => {
    expect(nextChanges(forecast({ hourly: hours() }), 'metric')).toEqual([]);
    expect(nextChanges(forecast({ hourly: [] }), 'metric')).toEqual([]);
  });

  it('says when rain becomes likely, with its probability', () => {
    const hourly = hours(i =>
      i >= 3 ? { precipitationProbability: 70, precipitation: 0.6 } : {}
    );
    expect(nextChanges(forecast({ hourly }), 'metric')).toEqual([
      {
        kind: 'precipitation-starts',
        time: '2026-09-27T17:00',
        precipitation: 'rain',
        probability: 70,
      },
    ]);
  });

  it('needs both a likely chance and a measurable amount', () => {
    const trace = hours(() => ({
      precipitationProbability: 90,
      precipitation: 0.1,
    }));
    const unlikely = hours(() => ({
      precipitationProbability: 40,
      precipitation: 3,
    }));
    expect(nextChanges(forecast({ hourly: trace }), 'metric')).toEqual([]);
    expect(nextChanges(forecast({ hourly: unlikely }), 'metric')).toEqual([]);
  });

  it('looks twelve hours ahead and no further', () => {
    const late = hours(i =>
      i === 12 ? { precipitationProbability: 80, precipitation: 1 } : {}
    );
    expect(nextChanges(forecast({ hourly: late }), 'metric')).toHaveLength(1);
    const later = [
      ...hours(),
      { ...hours()[0]!, precipitationProbability: 80, precipitation: 1 },
    ];
    expect(nextChanges(forecast({ hourly: later }), 'metric')).toEqual([]);
  });

  it.each([
    [73, 'snow'],
    [95, 'storm'],
    [66, 'freezing'],
    [81, 'rain'],
    [3, 'rain'],
  ] as const)('calls code %i %s', (weatherCode, precipitation) => {
    const hourly = hours(i =>
      i === 2
        ? { precipitationProbability: 60, precipitation: 1, weatherCode }
        : {}
    );
    expect(nextChanges(forecast({ hourly }), 'metric')[0]).toMatchObject({
      precipitation,
    });
  });

  it('says when rain that is falling eases, after a lull of two hours', () => {
    const raining = forecast({
      current: { ...sampleForecast().current!, weatherCode: 63 },
      hourly: hours(i =>
        // A one-hour lull at 16:00, then dry from 19:00.
        i === 2 || i >= 5
          ? { precipitationProbability: 20, precipitation: 0 }
          : { precipitationProbability: 90, precipitation: 2, weatherCode: 63 }
      ),
    });
    expect(nextChanges(raining, 'metric')).toEqual([
      {
        kind: 'precipitation-eases',
        time: '2026-09-27T19:00',
        precipitation: 'rain',
        probability: 20,
      },
    ]);
  });

  it('does not call an hour dry while rain is still likely there', () => {
    const raining = forecast({
      current: { ...sampleForecast().current!, weatherCode: 61 },
      hourly: hours(i =>
        i < 8
          ? { precipitationProbability: 50, precipitation: 0, weatherCode: 61 }
          : { precipitationProbability: 38, precipitation: 0 }
      ),
    });
    expect(nextChanges(raining, 'metric')[0]).toMatchObject({
      time: '2026-09-27T22:00',
      probability: 38,
    });
  });

  it('names what is falling now when it eases', () => {
    const snowing = forecast({
      current: { ...sampleForecast().current!, weatherCode: 75 },
      hourly: hours(),
    });
    expect(nextChanges(snowing, 'metric')[0]).toMatchObject({
      kind: 'precipitation-eases',
      precipitation: 'snow',
    });
  });

  it('warns about gusts that start later, with the strongest one', () => {
    const hourly = hours(i => ({
      windGusts: [20, 30, 40, 55, 65, 50][i] ?? 30,
    }));
    expect(nextChanges(forecast({ hourly }), 'metric')).toEqual([
      { kind: 'gusts', time: '2026-09-27T17:00', speed: 65 },
    ]);
  });

  it('does not repeat gusts that are already blowing', () => {
    const gusty = hours(() => ({ windGusts: 70 }));
    expect(nextChanges(forecast({ hourly: gusty }), 'metric')).toEqual([]);
    const now = forecast({
      current: { ...sampleForecast().current!, windGusts: 60 },
      hourly: hours(i => ({ windGusts: i > 3 ? 70 : 30 })),
    });
    expect(nextChanges(now, 'metric')).toEqual([]);
  });

  it('compares tomorrow’s high with today’s, as whole degrees', () => {
    const warmer = forecast({
      daily: [day('2026-09-27', 19.6), day('2026-09-28', 25.4)],
    });
    expect(nextChanges(warmer, 'metric')).toEqual([
      { kind: 'temperature', date: '2026-09-28', high: 25.4, previous: 19.6 },
    ]);
    // 19.6 → 24.4 shows as 20° → 24°: not enough.
    const similar = forecast({
      daily: [day('2026-09-27', 19.6), day('2026-09-28', 24.4)],
    });
    expect(nextChanges(similar, 'metric')).toEqual([]);
  });

  it('uses today from the first day when the current time is yesterday’s', () => {
    const afterMidnight = forecast({
      current: { ...sampleForecast().current!, time: '2026-09-26T23:55' },
      daily: [day('2026-09-27', 20), day('2026-09-28', 10)],
    });
    expect(nextChanges(afterMidnight, 'metric')[0]).toMatchObject({
      date: '2026-09-28',
    });
  });

  it('uses thresholds in the report’s units', () => {
    const inches = hours(i =>
      i === 1 ? { precipitationProbability: 60, precipitation: 0.01 } : {}
    );
    expect(nextChanges(forecast({ hourly: inches }), 'imperial')).toHaveLength(
      1
    );
    const fahrenheit = forecast({
      daily: [day('2026-09-27', 68), day('2026-09-28', 60)],
    });
    // 8 °F is under the 9 °F (5 °C) step.
    expect(nextChanges(fahrenheit, 'imperial')).toEqual([]);
    const mph = hours(i => ({ windGusts: i > 2 ? 35 : 10 }));
    expect(nextChanges(forecast({ hourly: mph }), 'imperial')).toHaveLength(1);
  });

  it('puts precipitation first, then gusts, then temperature', () => {
    const busy = forecast({
      hourly: hours(i => ({
        precipitationProbability: i > 4 ? 80 : 0,
        precipitation: i > 4 ? 2 : 0,
        windGusts: i > 2 ? 60 : 20,
      })),
      daily: [day('2026-09-27', 20), day('2026-09-28', 12)],
    });
    expect(nextChanges(busy, 'metric').map(change => change.kind)).toEqual([
      'precipitation-starts',
      'gusts',
      'temperature',
    ]);
  });
});
