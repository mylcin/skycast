import type {
  Attribution,
  Coordinates,
  Forecast,
  Freshness,
  Location,
} from '../core/models.ts';

/**
 * The seams between the app and a data source. Open-Meteo implements both;
 * another API can be added by implementing these two interfaces and passing
 * it to the services (see src/cli/container.ts).
 */

export interface GeocodingQuery {
  readonly name: string;
  /** Lower-case language code for place names ("en", "tr"). */
  readonly language: string;
  /** ISO 3166-1 alpha-2 filter. */
  readonly countryCode?: string;
  readonly limit?: number;
}

export interface GeocodingProvider {
  readonly id: string;
  readonly attribution: Attribution;
  /** Ranked matches, best first; empty when nothing matches. */
  search(query: GeocodingQuery, signal?: AbortSignal): Promise<Location[]>;
}

export interface ForecastRequest {
  readonly current: boolean;
  /** Daily entries starting today, at least 1 (sunrise and highs for today). */
  readonly days: number;
  /** Hourly entries starting at the current hour; 0 for none. */
  readonly hours: number;
}

export interface ForecastResult {
  /** One forecast per requested point, in request order. */
  readonly forecasts: readonly Forecast[];
  readonly freshness: Freshness;
}

export interface WeatherProvider {
  readonly id: string;
  readonly attribution: Attribution;
  /** Largest `days` value the provider supports. */
  readonly maxDays: number;
  /** Largest `hours` value the provider supports. */
  readonly maxHours: number;
  forecast(
    points: readonly Coordinates[],
    request: ForecastRequest,
    signal?: AbortSignal
  ): Promise<ForecastResult>;
}
