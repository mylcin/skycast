import type { Forecast, Location } from '../../src/core/models.ts';
import type {
  ForecastRequest,
  GeocodingProvider,
  GeocodingQuery,
  WeatherProvider,
} from '../../src/providers/types.ts';

export function fakeGeocoder(
  answer: (query: GeocodingQuery) => Location[]
): GeocodingProvider & { queries: GeocodingQuery[] } {
  const queries: GeocodingQuery[] = [];
  return {
    id: 'fake-geocoder',
    attribution: { text: 'Fake places', url: 'https://example.com/places' },
    queries,
    search(query) {
      queries.push(query);
      return Promise.resolve(answer(query));
    },
  };
}

export const sampleForecast = (
  overrides: Partial<Forecast> = {}
): Forecast => ({
  timezone: 'Europe/Istanbul',
  utcOffsetSeconds: 10800,
  current: {
    time: '2026-09-27T14:00',
    temperature: 20,
    feelsLike: 19,
    humidity: 60,
    windSpeed: 10,
    windGusts: 20,
    windDirection: 45,
    weatherCode: 2,
    isDay: true,
    uvIndex: 4,
    precipitation: 0,
    pressure: 1015,
    cloudCover: 40,
  },
  daily: [],
  hourly: [],
  ...overrides,
});

export function fakeWeather(
  forecast: (index: number) => Forecast = () => sampleForecast()
): WeatherProvider & {
  requests: { points: number; request: ForecastRequest }[];
} {
  const requests: { points: number; request: ForecastRequest }[] = [];
  return {
    id: 'fake-weather',
    attribution: { text: 'Fake weather', url: 'https://example.com/weather' },
    maxDays: 16,
    maxHours: 384,
    requests,
    forecast(points, request) {
      requests.push({ points: points.length, request });
      return Promise.resolve({
        forecasts: points.map((_, i) => forecast(i)),
        freshness: {
          fetchedAt: new Date('2026-09-27T11:00:00Z'),
          cached: false,
          stale: false,
        },
      });
    },
  };
}
