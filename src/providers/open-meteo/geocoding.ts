import type { HttpClient } from '../../infra/http.ts';
import type { GeocodingProvider } from '../types.ts';
import { toLocation } from './mappers.ts';
import { geocodingResponse, parser } from './schemas.ts';

export const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const DAY = 86_400_000;
/** Place names and coordinates rarely change. */
const CACHE = { ttlMs: 30 * DAY, staleMs: 365 * DAY };
const parse = parser(geocodingResponse);

export interface OpenMeteoGeocoderOptions {
  readonly http: HttpClient;
  readonly url?: string;
}

export function createOpenMeteoGeocoder({
  http,
  url = GEOCODING_URL,
}: OpenMeteoGeocoderOptions): GeocodingProvider {
  return {
    id: 'open-meteo-geocoding',
    attribution: {
      text: 'Location data based on GeoNames',
      url: 'https://www.geonames.org/',
      license: 'CC BY 4.0',
    },
    async search({ name, language, countryCode, limit = 10 }, signal) {
      const request = new URL(url);
      request.searchParams.set('name', name);
      request.searchParams.set(
        'count',
        String(Math.min(Math.max(limit, 1), 100))
      );
      // The API wants "tr", not "TR" or "tr-TR" (those fall back to English).
      request.searchParams.set(
        'language',
        language.toLowerCase().split('-')[0] ?? 'en'
      );
      request.searchParams.set('format', 'json');
      if (countryCode)
        request.searchParams.set('countryCode', countryCode.toUpperCase());
      const { data } = await http.getJson(request, {
        parse,
        cache: CACHE,
        ...(signal && { signal }),
      });
      return (data.results ?? []).map(toLocation);
    },
  };
}
