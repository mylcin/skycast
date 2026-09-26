import {
  createLocationService,
  type LocationService,
} from '../core/location-service.ts';
import {
  createWeatherService,
  type WeatherService,
} from '../core/weather-service.ts';
import type { Cache } from '../infra/cache.ts';
import { createHttpClient } from '../infra/http.ts';
import { createOpenMeteo } from '../providers/open-meteo/index.ts';
import { VERSION } from '../version.ts';
import type { Hooks, Io } from './io.ts';

export interface Services {
  readonly locations: LocationService;
  readonly weather: WeatherService;
}

export interface ServiceOptions {
  readonly io: Io;
  readonly hooks: Hooks;
  readonly cache: Cache | null;
  readonly log: (message: string) => void;
}

/**
 * Wires the app together. This is the one place that picks concrete
 * implementations: to use another weather API, construct its providers here.
 */
export function createServices({
  io,
  hooks,
  cache,
  log,
}: ServiceOptions): Services {
  const http = createHttpClient({
    userAgent: `skycast/${VERSION} (+https://github.com/mylcin/skycast)`,
    cache,
    log,
    ...(hooks.fetch && { fetch: hooks.fetch }),
    ...(hooks.now && { now: hooks.now }),
    ...(hooks.sleep && { sleep: hooks.sleep }),
  });
  const { weather, geocoding } = createOpenMeteo({
    http,
    // Validated in createSession; empty means "use the default".
    ...(io.env.SKYCAST_FORECAST_URL && {
      forecastUrl: io.env.SKYCAST_FORECAST_URL,
    }),
    ...(io.env.SKYCAST_GEOCODING_URL && {
      geocodingUrl: io.env.SKYCAST_GEOCODING_URL,
    }),
    ...(hooks.now && { now: hooks.now }),
  });
  return {
    locations: createLocationService(geocoding),
    weather: createWeatherService({
      weather,
      geocodingAttribution: geocoding.attribution,
    }),
  };
}
