/**
 * Domain models. Everything inside the app uses canonical metric units
 * (°C, km/h, mm, hPa); conversion to imperial happens once, in units.ts.
 *
 * Times are the location's local wall-clock time as ISO strings without an
 * offset ("2026-09-27T14:05", "2026-09-27"). They are never parsed with
 * `new Date()`, which would apply the machine's timezone.
 */

export type UnitSystem = 'metric' | 'imperial';

/** "YYYY-MM-DDTHH:mm" in the location's timezone. */
export type LocalDateTime = string;
/** "YYYY-MM-DD" in the location's timezone. */
export type LocalDate = string;

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface Location extends Coordinates {
  /** Null for a bare coordinate pair: there is no reverse geocoding. */
  readonly name: string | null;
  /** First-level administrative area: state, province, region. */
  readonly region?: string;
  readonly country?: string;
  /** ISO 3166-1 alpha-2, upper case. */
  readonly countryCode?: string;
  /** IANA timezone, e.g. "Europe/Istanbul". */
  readonly timezone?: string;
  readonly population?: number;
  /** GeoNames feature code, e.g. "PPLC" for a capital. */
  readonly featureCode?: string;
  /** Provider id for the place (a GeoNames id for Open-Meteo). */
  readonly id?: number;
}

export interface CurrentConditions {
  readonly time: LocalDateTime;
  readonly temperature: number;
  readonly feelsLike: number;
  /** Relative humidity, %. */
  readonly humidity: number;
  readonly windSpeed: number;
  readonly windGusts: number | null;
  /** Degrees the wind blows from (meteorological convention). */
  readonly windDirection: number | null;
  /** WMO weather interpretation code. */
  readonly weatherCode: number;
  readonly isDay: boolean;
  readonly uvIndex: number | null;
  readonly precipitation: number | null;
  /** Sea-level pressure. */
  readonly pressure: number | null;
  /** Cloud cover, %. */
  readonly cloudCover: number | null;
}

export interface DailyForecast {
  readonly date: LocalDate;
  readonly weatherCode: number;
  readonly temperatureMax: number;
  readonly temperatureMin: number;
  readonly precipitationSum: number | null;
  /** Highest hourly precipitation probability of the day, %. */
  readonly precipitationProbability: number | null;
  readonly windSpeedMax: number | null;
  readonly windDirection: number | null;
  readonly uvIndexMax: number | null;
  /** Null during polar night and midnight sun. */
  readonly sunrise: LocalDateTime | null;
  readonly sunset: LocalDateTime | null;
  readonly daylightSeconds: number | null;
}

export interface HourlyForecast {
  readonly time: LocalDateTime;
  readonly temperature: number | null;
  readonly feelsLike: number | null;
  /** %. */
  readonly precipitationProbability: number | null;
  readonly precipitation: number | null;
  readonly weatherCode: number | null;
  readonly isDay: boolean;
  readonly windSpeed: number | null;
}

/** What a weather provider returns for one point. */
export interface Forecast {
  readonly timezone: string;
  readonly utcOffsetSeconds: number;
  readonly current: CurrentConditions | null;
  readonly daily: readonly DailyForecast[];
  readonly hourly: readonly HourlyForecast[];
}

export interface Attribution {
  readonly text: string;
  readonly url: string;
  readonly license?: string;
}

export interface Freshness {
  readonly fetchedAt: Date;
  /** Served from the disk cache. */
  readonly cached: boolean;
  /** Served from an expired cache entry because a request failed. */
  readonly stale: boolean;
  /** Why stale data was used: no connection, or the service failing. */
  readonly staleBecause?: 'offline' | 'unavailable';
}

/** A forecast for a resolved location, in the requested units. */
export interface WeatherReport extends Forecast {
  readonly location: Location;
  readonly units: UnitSystem;
  readonly freshness: Freshness;
  readonly attribution: readonly Attribution[];
}
