import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  FORECAST_URL,
  GEOCODING_URL,
} from '../../src/providers/open-meteo/index.ts';
import { mockApi } from '../helpers/api.ts';
import { runCli, tempHome } from '../helpers/cli.ts';
import { server } from '../helpers/msw.ts';

/** Several runs sharing one home, like one person using the tool. */
function user() {
  const home = tempHome();
  return {
    home,
    run: (argv: string[], env: Record<string, string> = {}, now?: Date) =>
      runCli(argv, { home, env, ...(now && { hooks: { now: () => now } }) }),
    configFile: join(home, 'config', 'config.json'),
  };
}

describe('config', () => {
  it('lists defaults, then saved values', async () => {
    mockApi();
    const me = user();
    expect((await me.run(['config'])).stdout).toBe(
      'city   not set\nunits  metric (automatic)\nlang   en (automatic)\n'
    );
    await me.run(['config', 'set', 'city', 'Istanbul']);
    await me.run(['config', 'set', 'units', 'imperial']);
    expect((await me.run(['config', 'list'])).stdout).toBe(
      'city   Istanbul, Türkiye\nunits  imperial\nlang   en (automatic)\n'
    );
    expect(
      JSON.parse((await me.run(['config', '--json'])).stdout)
    ).toMatchObject({
      city: { name: 'Istanbul', countryCode: 'TR' },
      units: 'imperial',
      lang: null,
    });
  });

  it('uses the saved place and units when none are given', async () => {
    mockApi();
    const me = user();
    await me.run(['config', 'set', 'city', 'Istanbul']);
    await me.run(['config', 'set', 'units', 'imperial']);
    const { stdout } = await me.run(['now', '--compact']);
    expect(stdout).toBe('Istanbul, TR  67°F  Overcast  ↙ 11 mph NE  78%\n');
    expect(
      (await me.run(['now', '--compact', '--units', 'metric'])).stdout
    ).toContain('19°C');
  });

  it('uses the saved language, below --lang', async () => {
    mockApi();
    const me = user();
    await me.run(['config', 'set', 'lang', 'tr']);
    expect((await me.run(['now', 'Istanbul'])).stdout).toContain('Nem');
    expect((await me.run(['--help'])).stdout).toContain('Kullanım:');
    expect(
      (await me.run(['now', 'Istanbul', '--lang', 'en'])).stdout
    ).toContain('Humidity');
  });

  it('gets, unsets and validates settings', async () => {
    const me = user();
    await me.run(['config', 'set', 'lang', 'tr']);
    expect((await me.run(['config', 'get', 'lang'])).stdout).toBe('tr\n');
    await me.run(['config', 'unset', 'lang']);
    expect((await me.run(['config', 'get', 'lang'])).stdout).toBe(
      'en (automatic)\n'
    );

    const bad = await me.run(['config', 'set', 'units', 'kelvin']);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain(
      '“kelvin” is not a valid units. Use one of: metric, imperial.'
    );
    const unknown = await me.run(['config', 'set', 'theme', 'dark']);
    expect(unknown.code).toBe(2);
  });

  it('prints where settings live', async () => {
    const me = user();
    expect((await me.run(['config', 'path'])).stdout.trim()).toBe(
      me.configFile
    );
  });

  it('refuses to guess with a broken file, and reset repairs it', async () => {
    mockApi();
    const me = user();
    await me.run(['config', 'set', 'units', 'metric']);
    writeFileSync(me.configFile, '{ broken');
    const broken = await me.run(['now', 'Istanbul']);
    expect(broken.code).toBe(1);
    expect(broken.stderr).toContain(
      `The settings file ${me.configFile} is not valid (not valid JSON)`
    );
    expect(broken.stderr).not.toContain('--verbose');

    expect((await me.run(['config', 'path'])).code).toBe(0);
    expect((await me.run(['--help'])).code).toBe(0);
    const reset = await me.run(['config', 'reset']);
    expect(reset.code).toBe(0);
    expect((await me.run(['now', 'Istanbul'])).code).toBe(0);
  });

  it('keeps favourites through a reset', async () => {
    mockApi();
    const me = user();
    await me.run(['fav', 'add', 'Istanbul']);
    await me.run(['config', 'set', 'units', 'imperial']);
    await me.run(['config', 'reset']);
    const saved = JSON.parse(readFileSync(me.configFile, 'utf8')) as {
      units?: string;
      favorites: unknown[];
    };
    expect(saved.units).toBeUndefined();
    expect(saved.favorites).toHaveLength(1);
  });
});

describe('favourites', () => {
  it('adds, lists and removes by number or name', async () => {
    mockApi();
    const me = user();
    expect((await me.run(['fav'])).stdout).toContain('No favourites yet');
    expect((await me.run(['fav', 'add', 'Istanbul'])).stdout).toBe(
      'Added Istanbul, Türkiye to favourites.\n'
    );
    await me.run(['fav', 'add', 'Paris, France']);
    await me.run(['fav', 'add', 'New York']);
    expect((await me.run(['fav', 'list'])).stdout).toBe(
      '1  Istanbul, Türkiye\n2  Paris, Île-de-France Region, France\n3  New York, United States\n'
    );
    expect((await me.run(['fav', 'rm', '2'])).stdout).toBe(
      'Removed Paris, Île-de-France Region, France from favourites.\n'
    );
    expect((await me.run(['fav', 'remove', 'new york'])).stdout).toContain(
      'Removed New York'
    );
    expect((await me.run(['fav', 'ls'])).stdout).toBe('1  Istanbul, Türkiye\n');
  });

  it('does not add the same place twice', async () => {
    mockApi();
    const me = user();
    await me.run(['fav', 'add', 'Istanbul']);
    expect((await me.run(['fav', 'add', 'istanbul'])).stdout).toBe(
      'Istanbul, Türkiye is already a favourite.\n'
    );
  });

  it('explains a reference that matches nothing', async () => {
    const me = user();
    const missing = await me.run(['fav', 'rm', '4']);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain('No favourite matches “4”');
  });

  it('asks for the number when a name matches several', async () => {
    const me = user();
    const springfield = (region: string, latitude: number) => ({
      name: 'Springfield',
      region,
      latitude,
      longitude: -90,
      countryCode: 'US',
    });
    mkdirSync(join(me.home, 'config'), { recursive: true });
    writeFileSync(
      me.configFile,
      JSON.stringify({
        favorites: [
          springfield('Illinois', 39.8),
          springfield('Missouri', 37.2),
        ],
      })
    );
    const result = await me.run(['fav', 'rm', 'Springfield']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('More than one favourite matches');
  });

  it('lists favourites as JSON', async () => {
    mockApi();
    const me = user();
    await me.run(['fav', 'add', 'Istanbul']);
    expect(JSON.parse((await me.run(['fav', '--json'])).stdout)).toMatchObject({
      schemaVersion: 1,
      favorites: [{ name: 'Istanbul' }],
    });
  });
});

describe('plain skycast', () => {
  it('explains how to set it up when there is nothing saved', async () => {
    const { code, stdout } = await runCli([]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/^Set a default place/);
    expect(stdout).toContain('Usage: skycast');
  });

  it('shows the default place, then favourites, in one request', async () => {
    const log = mockApi();
    const me = user();
    await me.run(['config', 'set', 'city', 'Istanbul']);
    await me.run(['fav', 'add', 'Paris, France']);
    await me.run(['fav', 'add', 'Istanbul']);
    log.forecast.length = 0;
    const { code, stdout } = await me.run([]);
    expect(code).toBe(0);
    expect(log.forecast).toHaveLength(1);
    expect(log.forecast[0]?.get('latitude')?.split(',')).toHaveLength(2);
    expect(stdout).toContain('Istanbul, Türkiye');
    expect(stdout).toContain('Paris, FR');
    expect(stdout.match(/Weather data by Open-Meteo/g)).toHaveLength(1);
  });

  it('shows a single favourite in full', async () => {
    mockApi();
    const me = user();
    await me.run(['fav', 'add', 'Istanbul']);
    expect((await me.run([])).stdout).toContain('feels like');
  });

  it('has compact and JSON forms', async () => {
    mockApi();
    const me = user();
    await me.run(['config', 'set', 'city', 'Istanbul']);
    await me.run(['fav', 'add', 'Paris, France']);
    expect(
      (await me.run(['--compact'])).stdout.trim().split('\n')
    ).toHaveLength(2);
    const json = JSON.parse((await me.run(['--json'])).stdout) as {
      city: { location: { name: string } };
      favorites: unknown[];
    };
    expect(json.city.location.name).toBe('Istanbul');
    expect(json.favorites).toHaveLength(1);
  });
});

describe('cache', () => {
  it('answers repeat requests from disk', async () => {
    const log = mockApi();
    const me = user();
    await me.run(['now', 'Istanbul']);
    await me.run(['now', 'Istanbul']);
    expect(log.geocoding).toHaveLength(1);
    expect(log.forecast).toHaveLength(1);
  });

  it('--no-cache always asks the API', async () => {
    const log = mockApi();
    const me = user();
    await me.run(['now', 'Istanbul']);
    await me.run(['now', 'Istanbul', '--no-cache']);
    expect(log.forecast).toHaveLength(2);
  });

  it('shows recent data with a notice when offline', async () => {
    mockApi();
    const me = user();
    await me.run(['now', 'Istanbul'], {}, new Date('2026-09-26T21:30:00Z'));
    server.use(
      mock.get(FORECAST_URL, () => HttpResponse.error()),
      mock.get(GEOCODING_URL, () => HttpResponse.error())
    );
    const offline = await me.run(
      ['now', 'Istanbul'],
      {},
      new Date('2026-09-26T22:05:00Z')
    );
    expect(offline.code).toBe(0);
    expect(offline.stdout).toContain('Istanbul, Türkiye');
    expect(offline.stderr).toMatch(
      /Offline: showing data from \d\d:\d\d \(35 minutes ago\)\./
    );
  });

  it('gives up on data older than a day', async () => {
    mockApi();
    const me = user();
    await me.run(
      ['now', '--lat', '41', '--lon', '29'],
      {},
      new Date('2026-09-26T21:30:00Z')
    );
    server.use(mock.get(FORECAST_URL, () => HttpResponse.error()));
    const later = await me.run(
      ['now', '--lat', '41', '--lon', '29'],
      {},
      new Date('2026-09-28T21:30:00Z')
    );
    expect(later.code).toBe(4);
  });

  it('clears and locates the cache', async () => {
    mockApi();
    const me = user();
    await me.run(['now', 'Istanbul']);
    expect((await me.run(['cache', 'path'])).stdout.trim()).toBe(
      join(me.home, 'cache', 'http')
    );
    expect((await me.run(['cache', 'clear'])).stdout).toBe(
      'Removed 2 cached responses.\n'
    );
    expect((await me.run(['cache', 'clear'])).stdout).toBe(
      'Removed 0 cached responses.\n'
    );
  });

  it('still works when the cache folder cannot be written', async () => {
    mockApi();
    const me = user();
    const blocked = join(me.home, 'blocked');
    writeFileSync(blocked, 'a file, not a folder');
    const result = await runCli(['now', 'Istanbul'], {
      env: { SKYCAST_CACHE_DIR: blocked },
      hooks: { now: () => new Date('2026-09-26T21:30:00Z') },
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Istanbul, Türkiye');
  });
});
