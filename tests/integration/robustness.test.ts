import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import {
  FORECAST_URL,
  GEOCODING_URL,
} from '../../src/providers/open-meteo/index.ts';
import { mockApi } from '../helpers/api.ts';
import { runCli, tempHome } from '../helpers/cli.ts';
import { fixture } from '../helpers/fixtures.ts';
import { server } from '../helpers/msw.ts';

const posix = process.platform !== 'win32';
const root = process.getuid?.() === 0;

function user() {
  const home = tempHome();
  const configFile = join(home, 'config', 'config.json');
  const write = (body: unknown): void => {
    mkdirSync(join(home, 'config'), { recursive: true });
    writeFileSync(
      configFile,
      typeof body === 'string' ? body : JSON.stringify(body)
    );
  };
  return {
    home,
    configFile,
    write,
    run: (argv: string[], env: Record<string, string> = {}) =>
      runCli(argv, { home, env }),
  };
}

const paris = {
  name: 'Paris',
  latitude: 48.85,
  longitude: 2.35,
  countryCode: 'FR',
};
const tokyo = {
  name: 'Tokyo',
  latitude: 35.68,
  longitude: 139.69,
  countryCode: 'JP',
};

describe('a settings file with one bad value', () => {
  it('can be repaired with config set, and reset keeps the favourites', async () => {
    const me = user();
    me.write({ version: 1, units: 'Metric', favorites: [paris, tokyo] });
    expect(
      (await me.run(['now', '--lat', '1', '--lon', '2'])).stderr
    ).toContain('The setting “units”');
    expect((await me.run(['config', 'set', 'units', 'metric'])).code).toBe(0);
    expect(JSON.parse(readFileSync(me.configFile, 'utf8'))).toMatchObject({
      units: 'metric',
    });

    me.write({ version: 1, units: 'Metric', favorites: [paris, tokyo] });
    const reset = await me.run(['config', 'reset']);
    expect(reset.stdout).toContain('2 favourites were kept');
    expect(JSON.parse(readFileSync(me.configFile, 'utf8'))).toMatchObject({
      favorites: [paris, tokyo],
    });
  });

  it('backs up a file that is not JSON on reset', async () => {
    const me = user();
    me.write('{ broken');
    const reset = await me.run(['config', 'reset']);
    expect(reset.stdout).toContain(`${me.configFile}.bak`);
    expect(readFileSync(`${me.configFile}.bak`, 'utf8')).toBe('{ broken');
  });

  it.runIf(posix && !root)('never deletes a file it cannot read', async () => {
    const me = user();
    me.write({ version: 1, favorites: [paris] });
    chmodSync(me.configFile, 0o000);
    const list = await me.run(['fav', 'list']);
    const reset = await me.run(['config', 'reset']);
    chmodSync(me.configFile, 0o600);
    expect(list.stderr).toContain('cannot read');
    expect(list.stderr).not.toContain('config reset');
    expect(reset.code).toBe(1);
    expect(JSON.parse(readFileSync(me.configFile, 'utf8'))).toMatchObject({
      favorites: [paris],
    });
  });

  it('explains a folder where the file should be, and reset does not crash', async () => {
    const me = user();
    mkdirSync(me.configFile, { recursive: true });
    const reset = await me.run(['config', 'reset']);
    expect(reset.code).toBe(1);
    expect(reset.stderr).toContain('it is a folder');
    expect(reset.stderr).not.toContain('Something went wrong');
  });

  it.runIf(posix && !root)(
    'reports an unwritable settings folder without calling it a bug',
    async () => {
      const me = user();
      me.write({ version: 1, favorites: [] });
      chmodSync(join(me.home, 'config'), 0o500);
      const result = await me.run(['config', 'set', 'units', 'imperial']);
      chmodSync(join(me.home, 'config'), 0o700);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('could not write');
      expect(result.stderr).not.toContain('report it');
    }
  );
});

describe('--json everywhere', () => {
  it('formats commander errors as JSON too', async () => {
    for (const argv of [
      ['now', '--bogus', '--json'],
      ['forecast', 'Paris', '--days', '30', '--json'],
      ['now', '--lat', '91', '--lon', '0', '--json'],
      ['cache', '--json'],
    ]) {
      const { code, stderr } = await runCli(argv);
      expect(code).toBe(2);
      expect(JSON.parse(stderr)).toMatchObject({
        error: { code: 'USAGE', exitCode: 2 },
      });
    }
  });

  it('answers changes with JSON', async () => {
    mockApi();
    const me = user();
    expect(
      JSON.parse((await me.run(['fav', 'add', 'Istanbul', '--json'])).stdout)
    ).toMatchObject({
      added: true,
      favorite: { name: 'Istanbul' },
    });
    expect(
      JSON.parse(
        (await me.run(['config', 'set', 'units', 'imperial', '--json'])).stdout
      )
    ).toEqual({
      schemaVersion: 1,
      key: 'units',
      value: 'imperial',
    });
    expect(
      JSON.parse((await me.run(['config', 'unset', 'units', '--json'])).stdout)
    ).toMatchObject({ value: null });
    expect(
      JSON.parse((await me.run(['fav', 'rm', '1', '--json'])).stdout)
    ).toMatchObject({
      removed: { name: 'Istanbul' },
    });
    expect(
      JSON.parse((await me.run(['cache', 'clear', '--json'])).stdout)
    ).toMatchObject({ cleared: 1 });
    expect(
      JSON.parse((await me.run(['config', 'reset', '--json'])).stdout)
    ).toMatchObject({ reset: true });
    expect(
      JSON.parse((await me.run(['config', 'path', '--json'])).stdout)
    ).toMatchObject({ path: me.configFile });
  });

  it('prints an empty home as JSON, not help', async () => {
    const { code, stdout } = await runCli(['--json']);
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      schemaVersion: 1,
      city: null,
      favorites: [],
    });
  });
});

describe('places and hints', () => {
  it('looks a place up before suspecting a typo', async () => {
    server.use(
      mock.get(GEOCODING_URL, () =>
        HttpResponse.json({
          results: [
            {
              id: 1,
              name: 'Forest',
              latitude: 50.81,
              longitude: 4.32,
              country_code: 'BE',
              feature_code: 'PPLA3',
              population: 55000,
            },
          ],
        })
      ),
      mock.get(FORECAST_URL, () =>
        HttpResponse.json(fixture('forecast-istanbul'))
      )
    );
    const { code, stdout } = await runCli(['Forest', '--compact']);
    expect(code).toBe(0);
    expect(stdout).toContain('Forest, BE');
  });

  it('suggests a real namesake, and --country only where it exists', async () => {
    mockApi();
    const single = await runCli(['now', 'Paris']);
    expect(single.stderr).toContain('like “Paris, Texas”');
    expect(single.stderr).toContain('--country');
    const compare = await runCli(['compare', 'Paris', 'Istanbul']);
    expect(compare.stderr).toContain('like “Paris, Texas”');
    expect(compare.stderr).not.toContain('--country');
  });

  it('does not suggest adding a country that was already given', async () => {
    mockApi();
    const { code, stderr } = await runCli(['now', 'Xyzzy, France']);
    expect(code).toBe(3);
    expect(stderr).toContain(
      'No place called “Xyzzy, France”. Check the spelling.'
    );
  });

  it('ignores stray commas around a place', async () => {
    const log = mockApi();
    await runCli(['now', 'Istanbul,']);
    expect(log.geocoding[0]?.get('name')).toBe('Istanbul');
  });

  it('maps UK to GB and rejects codes that are not countries', async () => {
    const log = mockApi();
    await runCli(['now', 'London', '--country', 'uk']);
    expect(log.geocoding[0]?.get('countryCode')).toBe('GB');
    for (const code of ['EU', 'ZZ', 'XA', 'UN']) {
      expect((await runCli(['now', 'London', '--country', code])).code).toBe(2);
    }
  });

  it('rejects hexadecimal and binary coordinates', async () => {
    expect((await runCli(['now', '--lat', '0x10', '--lon', '3'])).code).toBe(2);
    expect((await runCli(['now', '--lat', '1', '--lon', '0b11'])).code).toBe(2);
    mockApi();
    expect((await runCli(['now', '--lat', '1e1', '--lon', '-.5'])).code).toBe(
      0
    );
  });

  it('removes a favourite by the name it was added with', async () => {
    mockApi();
    const me = user();
    await me.run(['fav', 'add', 'Paris, France']);
    const removed = await me.run(['fav', 'rm', 'Paris, France']);
    expect(removed.code).toBe(0);
    expect(removed.stdout).toContain('Removed Paris');
  });

  it('config set city takes --country', async () => {
    const log = mockApi();
    const me = user();
    await me.run(['config', 'set', 'city', 'Paris', '--country', 'FR']);
    expect(log.geocoding[0]?.get('countryCode')).toBe('FR');
  });
});

describe('prompts', () => {
  it('cancelling one picker cancels the ones still waiting', async () => {
    mockApi();
    const choose = vi.fn(() =>
      Promise.reject(
        Object.assign(new Error('closed'), { name: 'ExitPromptError' })
      )
    );
    const { code } = await runCli(['compare', 'Paris', 'London', 'Istanbul'], {
      hooks: { choose },
    });
    expect(code).toBe(130);
    expect(choose).toHaveBeenCalledOnce();
  });
});

describe('command line details', () => {
  it('reports a mistyped subcommand by name', async () => {
    const { code, stderr } = await runCli([
      'config',
      'sett',
      'units',
      'metric',
    ]);
    expect(code).toBe(2);
    expect(stderr).toContain('unknown command “sett”');
  });

  it('names missing arguments in the UI language', async () => {
    expect((await runCli(['compare', '--lang', 'tr'])).stderr).toContain(
      'yer adları eksik'
    );
  });

  it('understands bundled -l flags and empty LC_ALL', async () => {
    expect((await runCli(['-ltr', '--help'])).stdout).toContain('Kullanım:');
    expect(
      (await runCli(['--help'], { env: { LC_ALL: '', LANG: 'tr_TR.UTF-8' } }))
        .stdout
    ).toContain('Kullanım:');
  });

  it('treats --json after -- as an argument', async () => {
    mockApi();
    const { stderr } = await runCli(['now', 'Xyzzy', '--', '--json']);
    expect(stderr.startsWith('skycast:')).toBe(true);
  });

  it('names a bad endpoint variable instead of calling it a bug', async () => {
    const { code, stderr } = await runCli(['now', '--lat', '1', '--lon', '2'], {
      env: { SKYCAST_FORECAST_URL: 'api.example' },
    });
    expect(code).toBe(2);
    expect(stderr).toContain('SKYCAST_FORECAST_URL must be a full http(s) URL');
  });

  it('shows where settings come from when the environment overrides them', async () => {
    const me = user();
    await me.run(['config', 'set', 'units', 'metric']);
    const list = await me.run(['config'], { SKYCAST_UNITS: 'imperial' });
    expect(list.stdout).toContain('imperial (from SKYCAST_UNITS)');
  });

  it('ignores empty or relative folder variables', async () => {
    const { stdout } = await runCli(['config', 'path'], {
      env: { SKYCAST_CONFIG_DIR: '', XDG_CONFIG_HOME: 'relative' },
    });
    expect(stdout.trim()).not.toBe('config.json');
    expect(stdout.trim().length).toBeGreaterThan('config.json'.length);
  });
});

describe('offline notices', () => {
  it('says the service is failing, not that you are offline, for server errors', async () => {
    mockApi();
    const me = user();
    await runCli(['now', '--lat', '1', '--lon', '2'], {
      home: me.home,
      hooks: { now: () => new Date('2026-09-26T21:30:00Z') },
    });
    server.use(
      mock.get(FORECAST_URL, () => new HttpResponse(null, { status: 503 }))
    );
    const later = await runCli(['now', '--lat', '1', '--lon', '2'], {
      home: me.home,
      hooks: { now: () => new Date('2026-09-26T22:00:00Z') },
    });
    expect(later.code).toBe(0);
    expect(later.stderr).toContain('The weather service is not answering');
  });

  it('does not delete other files in the cache folder', async () => {
    mockApi();
    const me = user();
    await me.run(['now', '--lat', '1', '--lon', '2']);
    const mine = join(me.home, 'cache', 'http', 'notes.json');
    writeFileSync(mine, '{}');
    await me.run(['cache', 'clear']);
    expect(existsSync(mine)).toBe(true);
  });
});

describe('many favourites', () => {
  it('splits them over several requests and keeps their order', async () => {
    const log = mockApi();
    const me = user();
    const favorites = Array.from({ length: 120 }, (_, i) => ({
      name: `P${i}`,
      latitude: i / 10,
      longitude: i / 10,
    }));
    me.write({ version: 1, favorites });
    const { code, stdout } = await me.run(['--compact']);
    expect(code).toBe(0);
    expect(log.forecast).toHaveLength(3);
    const lines = stdout.trim().split('\n');
    expect(lines).toHaveLength(120);
    expect(lines[0]?.startsWith('P0')).toBe(true);
    expect(lines[119]?.startsWith('P119')).toBe(true);
  });
});
