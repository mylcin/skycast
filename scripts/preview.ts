/**
 * Renders every view from the saved API fixtures, for eyeballing layouts:
 *   node scripts/preview.ts [width] [color 0-3] [en|tr] [ascii]
 */
import { readFileSync } from 'node:fs';
import { createWeatherService } from '../src/core/weather-service.ts';
import { getMessages, type Lang } from '../src/i18n/index.ts';
import { toForecast, toLocation } from '../src/providers/open-meteo/mappers.ts';
import {
  forecastResponse,
  geocodingResponse,
} from '../src/providers/open-meteo/schemas.ts';
import type { WeatherProvider } from '../src/providers/types.ts';
import { renderCompare } from '../src/renderers/compare.ts';
import {
  renderCurrent,
  renderCurrentCompact,
} from '../src/renderers/current.ts';
import { renderForecast } from '../src/renderers/forecast.ts';
import { renderHourly } from '../src/renderers/hourly.ts';
import { createPaint, type ColorLevel } from '../src/renderers/paint.ts';
import { getSymbols } from '../src/renderers/symbols.ts';

const [width = '90', level = '0', lang = 'en', ascii] = process.argv.slice(2);
const load = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`../tests/fixtures/open-meteo/${name}.json`, import.meta.url),
      'utf8'
    )
  );

const place = (fixture: string) =>
  geocodingResponse.parse(load(fixture)).results!.map(toLocation)[0]!;
const single = forecastResponse
  .parse(load('forecast-istanbul'))
  .map(toForecast);
const multi = forecastResponse.parse(load('forecast-compare')).map(toForecast);

const fake = (forecasts: typeof single): WeatherProvider => ({
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
      freshness: { fetchedAt: new Date(), cached: false, stale: false },
    }),
});
const geo = {
  text: 'Location data based on GeoNames',
  url: 'https://www.geonames.org/',
  license: 'CC BY 4.0',
};
const t = getMessages(lang as Lang);
const ctx = {
  t,
  paint: createPaint(Number(level) as ColorLevel),
  symbols: getSymbols(ascii !== 'ascii'),
  width: Number(width),
};
const units =
  t.lang === 'en' && process.env.UNITS === 'imperial' ? 'imperial' : 'metric';

const istanbul = place(lang === 'tr' ? 'geo-istanbul-tr' : 'geo-istanbul-en');
const [report] = await createWeatherService({
  weather: fake(single),
  geocodingAttribution: geo,
}).reports([istanbul], { current: true, days: 7, hours: 24 }, { units });
const reports = await createWeatherService({
  weather: fake(multi),
  geocodingAttribution: geo,
}).reports(
  [istanbul, place('geo-paris-en'), place('geo-new-york-en')],
  { current: true, days: 1, hours: 0 },
  { units }
);
const rule = (name: string) => `\n${'─'.repeat(Number(width))}\n${name}\n`;
process.stdout.write(rule('now') + renderCurrent(report!, ctx));
process.stdout.write(
  rule('now --compact') + renderCurrentCompact(report!, ctx)
);
process.stdout.write(
  rule('forecast') + renderForecast({ ...report!, hourly: [] }, ctx)
);
process.stdout.write(
  rule('hourly') +
    renderHourly({ ...report!, hourly: report!.hourly.slice(0, 24) }, ctx)
);
process.stdout.write(rule('compare') + renderCompare(reports, ctx));
