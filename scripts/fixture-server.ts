/**
 * A local stand-in for the Open-Meteo APIs, answering from the saved
 * fixtures. Used by the end-to-end tests and to record the demo GIF, so
 * neither depends on the network or on today's weather.
 *
 *   node scripts/fixture-server.ts            # prints the base URL, runs until stopped
 *   SKYCAST_FORECAST_URL=<base>/v1/forecast SKYCAST_GEOCODING_URL=<base>/v1/search skycast now Istanbul
 */
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';

const fixtures = new URL('../tests/fixtures/open-meteo/', import.meta.url);
const load = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`${name}.json`, fixtures), 'utf8'));

/** Query (lower case) and language → geocoding fixture. */
const PLACES: Record<string, string> = {
  'istanbul:en': 'geo-istanbul-en',
  'istanbul:tr': 'geo-istanbul-tr',
  'i̇stanbul:tr': 'geo-istanbul-tr',
  'paris:en': 'geo-paris-en',
  'paris:tr': 'geo-paris-tr',
  'paris, france:en': 'geo-paris-france-en',
  'paris, france:tr': 'geo-paris-france-en',
  'new york:en': 'geo-new-york-en',
  'new york:tr': 'geo-new-york-en',
  'london:en': 'geo-london-en',
  'tokyo:en': 'geo-tokyo-en',
  'tokyo:tr': 'geo-tokyo-en',
  'berlin:en': 'geo-berlin-en',
  'ankara:en': 'geo-ankara-tr',
  'ankara:tr': 'geo-ankara-tr',
};

type Json = Record<string, unknown>;

const HOUR = 3_600_000;

/** "2026-09-27T00:30" or "2026-09-27", moved by whole milliseconds. */
function shift(value: unknown, ms: number): unknown {
  if (typeof value !== 'string') return value;
  const date = value.length === 10 ? `${value}T00:00` : value;
  const moved = new Date(Date.parse(`${date}Z`) + ms).toISOString();
  return value.length === 10 ? moved.slice(0, 10) : moved.slice(0, 16);
}

/**
 * Moves a saved forecast so it looks fetched now: hours by whole hours,
 * days by whole days. Without this the CLI would drop the saved hours and
 * days as past once the fixture is older than a day.
 */
export function asIfFetchedAt(point: Json, now: Date): Json {
  const current = point.current as Json | undefined;
  const offset = Number(point.utc_offset_seconds ?? 0) * 1000;
  if (typeof current?.time !== 'string') return point;
  const reference = Date.parse(`${current.time}Z`) - offset;
  if (Number.isNaN(reference)) return point;
  const hours = Math.floor((now.getTime() - reference) / HOUR) * HOUR;
  const localDay = (ms: number): number =>
    Math.floor((ms + offset) / 86_400_000);
  const days = (localDay(reference + hours) - localDay(reference)) * 86_400_000;

  const series = (block: unknown, keys: string[], ms: number): unknown => {
    if (!block || typeof block !== 'object') return block;
    const copy: Json = { ...(block as Json) };
    for (const key of keys) {
      const list = copy[key];
      if (Array.isArray(list)) copy[key] = list.map(item => shift(item, ms));
    }
    return copy;
  };
  return {
    ...point,
    current: { ...current, time: shift(current.time, hours) },
    hourly: series(point.hourly, ['time'], hours),
    daily: series(point.daily, ['time', 'sunrise', 'sunset'], days),
  };
}

/** Places whose forecast never arrives, to test Ctrl+C and timeouts. */
export const HANGING_LATITUDE = '-89.9';

export interface FixtureServer {
  readonly url: string;
  readonly forecastUrl: string;
  readonly geocodingUrl: string;
  close(): Promise<void>;
}

export async function startFixtureServer(
  port = 0,
  now: () => Date = () => new Date()
): Promise<FixtureServer> {
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const send = (status: number, body: unknown): void => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (url.pathname === '/v1/search') {
      const key = `${url.searchParams.get('name')?.toLowerCase()}:${url.searchParams.get('language')}`;
      const name = PLACES[key];
      send(200, name ? load(name) : load('geo-not-found'));
      return;
    }
    if (url.pathname === '/v1/forecast') {
      const latitudes = url.searchParams.get('latitude')?.split(',') ?? [];
      if (latitudes.includes(HANGING_LATITUDE)) return; // never answer
      const at = now();
      if (latitudes.length <= 1) {
        send(200, asIfFetchedAt(load('forecast-istanbul') as Json, at));
        return;
      }
      const many = load('forecast-compare') as Json[];
      send(
        200,
        latitudes.map((_, i) => asIfFetchedAt(many[i % many.length] ?? {}, at))
      );
      return;
    }
    send(404, { error: true, reason: 'Not Found' });
  });
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  const { port: actual } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${actual}`;
  return {
    url,
    forecastUrl: `${url}/v1/forecast`,
    geocodingUrl: `${url}/v1/search`,
    close: () =>
      new Promise(resolve => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = await startFixtureServer(Number(process.env.PORT ?? 0));
  process.stdout.write(`${server.url}\n`);
}
