import type { Location, WeatherReport } from '../../src/core/models.ts';
import { createWeatherService } from '../../src/core/weather-service.ts';
import { getMessages, type Lang } from '../../src/i18n/index.ts';
import { toForecast } from '../../src/providers/open-meteo/mappers.ts';
import { forecastResponse } from '../../src/providers/open-meteo/schemas.ts';
import type { WeatherProvider } from '../../src/providers/types.ts';
import type { RenderContext } from '../../src/renderers/context.ts';
import { createPaint, type ColorLevel } from '../../src/renderers/paint.ts';
import { getSymbols } from '../../src/renderers/symbols.ts';
import { fixture, places } from './fixtures.ts';

const GEONAMES = {
  text: 'Location data based on GeoNames.org',
  url: 'https://www.geonames.org/',
  license: 'CC BY 4.0',
};

/** A provider that answers from saved forecast fixtures. */
export function fixtureWeather(name: string): WeatherProvider {
  const forecasts = forecastResponse.parse(fixture(name)).map(toForecast);
  return {
    id: 'fixture',
    attribution: {
      text: 'Weather data by Open-Meteo.com',
      url: 'https://open-meteo.com/',
      license: 'CC BY 4.0',
    },
    maxDays: 16,
    maxHours: 384,
    forecast: points =>
      Promise.resolve({
        forecasts: forecasts.slice(0, points.length),
        freshness: {
          fetchedAt: new Date('2026-09-26T21:30:00Z'),
          cached: false,
          stale: false,
        },
      }),
  };
}

export function place(fixtureName: string): Location {
  const [first] = places(fixtureName);
  if (!first) throw new Error(`no places in ${fixtureName}`);
  return first;
}

export async function istanbulReport(
  units: 'metric' | 'imperial' = 'metric',
  lang: Lang = 'en'
): Promise<WeatherReport> {
  const service = createWeatherService({
    weather: fixtureWeather('forecast-istanbul'),
    geocodingAttribution: GEONAMES,
  });
  const [report] = await service.reports(
    [place(lang === 'tr' ? 'geo-istanbul-tr' : 'geo-istanbul-en')],
    { current: true, days: 7, hours: 48 },
    { units }
  );
  return report!;
}

export async function compareReports(
  units: 'metric' | 'imperial' = 'metric'
): Promise<WeatherReport[]> {
  const service = createWeatherService({
    weather: fixtureWeather('forecast-compare'),
    geocodingAttribution: GEONAMES,
  });
  return service.reports(
    [place('geo-istanbul-en'), place('geo-paris-en'), place('geo-new-york-en')],
    { current: true, days: 1, hours: 0 },
    { units }
  );
}

export function context(
  options: {
    width?: number;
    color?: ColorLevel;
    lang?: Lang;
    unicode?: boolean;
  } = {}
): RenderContext {
  return {
    t: getMessages(options.lang ?? 'en'),
    paint: createPaint(options.color ?? 0),
    symbols: getSymbols(options.unicode ?? true),
    width: options.width ?? 80,
  };
}
