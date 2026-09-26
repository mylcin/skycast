import { http as mock, HttpResponse, type JsonBodyType } from 'msw';
import {
  FORECAST_URL,
  GEOCODING_URL,
} from '../../src/providers/open-meteo/index.ts';
import { fixture } from './fixtures.ts';
import { server } from './msw.ts';

export interface ApiLog {
  geocoding: URLSearchParams[];
  forecast: URLSearchParams[];
}

/** Geocoding fixtures by query and language; anything else finds nothing. */
const PLACES: Record<string, string> = {
  'istanbul:en': 'geo-istanbul-en',
  'istanbul:tr': 'geo-istanbul-tr',
  'i̇stanbul:tr': 'geo-istanbul-tr',
  'paris:en': 'geo-paris-en',
  'paris:tr': 'geo-paris-tr',
  'paris, france:en': 'geo-paris-france-en',
  'new york:en': 'geo-new-york-en',
  'ankara:en': 'geo-ankara-tr',
  'london:en': 'geo-london-en',
};

/**
 * Serves saved Open-Meteo answers: one forecast per requested point, taken
 * from the compare fixture for several points.
 */
export function mockApi(): ApiLog {
  const log: ApiLog = { geocoding: [], forecast: [] };
  server.use(
    mock.get(GEOCODING_URL, ({ request }) => {
      const params = new URL(request.url).searchParams;
      log.geocoding.push(params);
      const key = `${params.get('name')?.toLowerCase()}:${params.get('language')}`;
      const name = PLACES[key];
      return HttpResponse.json(name ? fixture(name) : fixture('geo-not-found'));
    }),
    mock.get(FORECAST_URL, ({ request }) => {
      const params = new URL(request.url).searchParams;
      log.forecast.push(params);
      const points = params.get('latitude')?.split(',').length ?? 1;
      if (points === 1) return HttpResponse.json(fixture('forecast-istanbul'));
      const many = fixture('forecast-compare') as JsonBodyType[];
      return HttpResponse.json(
        Array.from({ length: points }, (_, i) => many[i % many.length])
      );
    })
  );
  return log;
}
