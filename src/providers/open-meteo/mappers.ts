import type {
  CurrentConditions,
  DailyForecast,
  Forecast,
  HourlyForecast,
  Location,
} from '../../core/models.ts';
import type { ForecastPoint, GeocodingResult } from './schemas.ts';

/** The API sends "" and 0 for unknown admin names and populations. */
const present = (value: string | undefined): string | undefined =>
  value?.trim() ? value.trim() : undefined;

export function toLocation(result: GeocodingResult): Location {
  const region = present(result.admin1);
  const country = present(result.country);
  const countryCode = present(result.country_code)?.toUpperCase();
  const timezone = present(result.timezone);
  const featureCode = present(result.feature_code);
  return {
    id: result.id,
    name: result.name,
    latitude: result.latitude,
    longitude: result.longitude,
    ...(region && { region }),
    ...(country && { country }),
    ...(countryCode && { countryCode }),
    ...(timezone && { timezone }),
    ...(result.population && { population: result.population }),
    ...(featureCode && { featureCode }),
  };
}

const DAY_SECONDS = 86_400;

function toCurrent(
  current: NonNullable<ForecastPoint['current']>
): CurrentConditions {
  return {
    time: current.time,
    temperature: current.temperature_2m,
    feelsLike: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    windSpeed: current.wind_speed_10m,
    windGusts: current.wind_gusts_10m,
    windDirection: current.wind_direction_10m,
    weatherCode: current.weather_code,
    isDay: current.is_day === 1,
    uvIndex: current.uv_index,
    precipitation: current.precipitation,
    pressure: current.pressure_msl,
    cloudCover: current.cloud_cover,
  };
}

function toDaily(daily: NonNullable<ForecastPoint['daily']>): DailyForecast[] {
  return daily.time.flatMap((date, i): DailyForecast[] => {
    const max = daily.temperature_2m_max[i] ?? null;
    const min = daily.temperature_2m_min[i] ?? null;
    const code = daily.weather_code[i] ?? null;
    // A day without its headline numbers isn't worth showing.
    if (max === null || min === null || code === null) return [];
    const daylight = daily.daylight_duration[i] ?? null;
    // Polar night and midnight sun come back as sunrise == sunset == 00:00.
    const sunSets =
      daylight === null || (daylight > 0 && daylight < DAY_SECONDS);
    return [
      {
        date,
        weatherCode: code,
        temperatureMax: max,
        temperatureMin: min,
        precipitationSum: daily.precipitation_sum[i] ?? null,
        precipitationProbability:
          daily.precipitation_probability_max[i] ?? null,
        windSpeedMax: daily.wind_speed_10m_max[i] ?? null,
        windDirection: daily.wind_direction_10m_dominant[i] ?? null,
        uvIndexMax: daily.uv_index_max[i] ?? null,
        sunrise: sunSets ? (daily.sunrise[i] ?? null) : null,
        sunset: sunSets ? (daily.sunset[i] ?? null) : null,
        daylightSeconds: daylight,
      },
    ];
  });
}

function toHourly(
  hourly: NonNullable<ForecastPoint['hourly']>
): HourlyForecast[] {
  return hourly.time.map((time, i) => ({
    time,
    temperature: hourly.temperature_2m[i] ?? null,
    feelsLike: hourly.apparent_temperature[i] ?? null,
    precipitationProbability: hourly.precipitation_probability[i] ?? null,
    precipitation: hourly.precipitation[i] ?? null,
    weatherCode: hourly.weather_code[i] ?? null,
    isDay: hourly.is_day[i] === 1,
    windSpeed: hourly.wind_speed_10m[i] ?? null,
  }));
}

export function toForecast(point: ForecastPoint): Forecast {
  return {
    timezone: point.timezone,
    utcOffsetSeconds: point.utc_offset_seconds,
    current: point.current ? toCurrent(point.current) : null,
    daily: point.daily ? toDaily(point.daily) : [],
    hourly: point.hourly ? toHourly(point.hourly) : [],
  };
}
