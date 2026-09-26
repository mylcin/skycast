import * as z from 'zod';

/**
 * Only the fields the app reads. Unknown fields are ignored so API additions
 * don't break old versions; missing or mistyped fields fail loudly.
 */

const series = z.array(z.number().nullable());

export const geocodingResponse = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        feature_code: z.string().optional(),
        country_code: z.string().optional(),
        country: z.string().optional(),
        admin1: z.string().optional(),
        timezone: z.string().optional(),
        population: z.number().optional(),
      })
    )
    // No matches is `{}`, not `{ results: [] }`.
    .optional(),
});

export type GeocodingResponse = z.infer<typeof geocodingResponse>;
export type GeocodingResult = NonNullable<GeocodingResponse['results']>[number];

const current = z.object({
  time: z.string(),
  temperature_2m: z.number(),
  apparent_temperature: z.number(),
  relative_humidity_2m: z.number(),
  weather_code: z.number(),
  wind_speed_10m: z.number(),
  wind_direction_10m: z.number().nullable(),
  wind_gusts_10m: z.number().nullable(),
  is_day: z.number(),
  uv_index: z.number().nullable(),
  precipitation: z.number().nullable(),
  pressure_msl: z.number().nullable(),
  cloud_cover: z.number().nullable(),
});

const daily = z.object({
  time: z.array(z.string()),
  weather_code: series,
  temperature_2m_max: series,
  temperature_2m_min: series,
  sunrise: z.array(z.string().nullable()),
  sunset: z.array(z.string().nullable()),
  daylight_duration: series,
  uv_index_max: series,
  precipitation_sum: series,
  precipitation_probability_max: series,
  wind_speed_10m_max: series,
  wind_direction_10m_dominant: series,
});

const hourly = z.object({
  time: z.array(z.string()),
  temperature_2m: series,
  apparent_temperature: series,
  precipitation_probability: series,
  precipitation: series,
  weather_code: series,
  is_day: series,
  wind_speed_10m: series,
});

const forecast = z.object({
  timezone: z.string(),
  utc_offset_seconds: z.number(),
  current: current.optional(),
  daily: daily.optional(),
  hourly: hourly.optional(),
});

/**
 * One location returns an object, several an array in request order. Both
 * are normalised to an array before validation, so errors name the field.
 */
export const forecastResponse = z.preprocess(
  (body: unknown): unknown[] =>
    Array.isArray(body) ? (body as unknown[]) : [body],
  z.array(forecast)
);

export type ForecastPoint = z.infer<typeof forecast>;

/** Variables requested from the API, kept next to the schema they must match. */
export const CURRENT_VARIABLES = Object.keys(current.shape).filter(
  key => key !== 'time'
);
export const DAILY_VARIABLES = Object.keys(daily.shape).filter(
  key => key !== 'time'
);
export const HOURLY_VARIABLES = Object.keys(hourly.shape).filter(
  key => key !== 'time'
);

/** Parses with a schema and throws a short, readable error. */
export function parser<T>(schema: z.ZodType<T>): (body: unknown) => T {
  return body => {
    const result = schema.safeParse(body);
    if (result.success) return result.data;
    const issue = result.error.issues[0];
    const path = issue?.path.join('.') ?? '';
    throw new Error(`${path ? `${path}: ` : ''}${issue?.message ?? 'invalid'}`);
  };
}
