import type { HttpClient } from '../../infra/http.ts';
import type { GeocodingProvider, WeatherProvider } from '../types.ts';
import { createOpenMeteoWeather, FORECAST_URL } from './forecast.ts';
import { createOpenMeteoGeocoder, GEOCODING_URL } from './geocoding.ts';

export interface OpenMeteoOptions {
  readonly http: HttpClient;
  /** Point at a self-hosted Open-Meteo instance, or a test server. */
  readonly forecastUrl?: string;
  readonly geocodingUrl?: string;
}

export function createOpenMeteo({
  http,
  forecastUrl = FORECAST_URL,
  geocodingUrl = GEOCODING_URL,
}: OpenMeteoOptions): {
  weather: WeatherProvider;
  geocoding: GeocodingProvider;
} {
  return {
    weather: createOpenMeteoWeather({ http, url: forecastUrl }),
    geocoding: createOpenMeteoGeocoder({ http, url: geocodingUrl }),
  };
}

export { FORECAST_URL, GEOCODING_URL };
