import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { http as mock, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { FORECAST_URL } from '../../src/providers/open-meteo/index.ts';
import { mockApi } from '../helpers/api.ts';
import { runCli } from '../helpers/cli.ts';
import { server } from '../helpers/msw.ts';

const ESC = '\u001b[';

describe('weather commands', () => {
  it('now: shows the current weather with credits', async () => {
    mockApi();
    const { code, stdout, stderr } = await runCli(['now', 'Istanbul']);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('Istanbul, Türkiye');
    expect(stdout).toContain('19°C');
    expect(stdout).toContain('Weather data by Open-Meteo.com');
  });

  it('a bare place is short for now', async () => {
    mockApi();
    const bare = await runCli(['Istanbul']);
    const now = await runCli(['now', 'Istanbul']);
    expect(bare.stdout).toBe(now.stdout);
  });

  it('joins multi-word places', async () => {
    const log = mockApi();
    await runCli(['now', 'New', 'York']);
    expect(log.geocoding[0]?.get('name')).toBe('New York');
  });

  it('--json prints the documented contract and nothing else', async () => {
    mockApi();
    const { code, stdout, stderr } = await runCli(
      ['now', 'Istanbul', '--json'],
      { tty: true }
    );
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).not.toContain(ESC);
    const json = JSON.parse(stdout) as {
      schemaVersion: number;
      location: { name: string };
      current: object;
    };
    expect(json.schemaVersion).toBe(1);
    expect(json.location.name).toBe('Istanbul');
    expect(json.current).toMatchObject({
      temperature: 19.4,
      condition: 'cloudy',
    });
  });

  it('--compact prints one line', async () => {
    mockApi();
    const { stdout } = await runCli(['now', 'Istanbul', '--compact']);
    expect(stdout).toBe('Istanbul, TR  19°C  Overcast  ↙ 18 km/h NE  78%\n');
  });

  it('forecast: asks for the requested days', async () => {
    const log = mockApi();
    const { code, stdout } = await runCli([
      'forecast',
      'Istanbul',
      '--days',
      '3',
    ]);
    expect(code).toBe(0);
    expect(log.forecast[0]?.get('forecast_days')).toBe('3');
    expect(stdout).toContain('3-day forecast');
    expect(stdout).toContain('Tomorrow');
    expect(stdout).not.toContain('Wed 30');
  });

  it('hourly: asks for the requested hours plus one spare', async () => {
    const log = mockApi();
    const { stdout } = await runCli(['hourly', 'Istanbul', '--hours', '6']);
    expect(log.forecast[0]?.get('forecast_hours')).toBe('7');
    expect(stdout).toContain('Next 6 hours');
    expect(stdout.match(/^0\d:00/gm)).toHaveLength(6);
  });

  it('coordinates skip geocoding', async () => {
    const log = mockApi();
    const { code, stdout } = await runCli([
      'now',
      '--lat',
      '41.01',
      '--lon',
      '28.95',
    ]);
    expect(code).toBe(0);
    expect(log.geocoding).toHaveLength(0);
    expect(stdout.split('\n')[0]).toBe('41.01°N, 28.95°E');
    expect(stdout).not.toContain('GeoNames');
  });

  it('negative coordinates work', async () => {
    const log = mockApi();
    await runCli(['now', '--lat', '-33.87', '--lon', '-151.21']);
    expect(log.forecast[0]?.get('latitude')).toBe('-33.87');
  });

  it('--country narrows the search', async () => {
    const log = mockApi();
    await runCli(['now', 'Paris', '--country', 'fr']);
    expect(log.geocoding[0]?.get('countryCode')).toBe('FR');
  });
});

describe('ambiguous places', () => {
  it('picks the best match without a terminal and says so', async () => {
    mockApi();
    const { code, stdout, stderr } = await runCli(['now', 'Paris']);
    expect(code).toBe(0);
    expect(stdout).toContain('Paris, France');
    expect(stderr).toContain('Other places are called “Paris” too');
  });

  it('asks when someone can answer', async () => {
    mockApi();
    const choose = vi.fn((places: readonly { region?: string }[]) =>
      Promise.resolve(places.find(p => p.region === 'Texas')!)
    );
    const { stdout, stderr } = await runCli(['now', 'Paris'], {
      hooks: { choose: choose as never },
    });
    expect(choose).toHaveBeenCalledOnce();
    expect(stdout).toContain('Paris, United States');
    expect(stderr).toBe('');
  });

  it('never prompts in JSON mode', async () => {
    mockApi();
    const choose = vi.fn();
    const { stdout } = await runCli(['now', 'Paris', '--json'], {
      hooks: { choose },
    });
    expect(choose).not.toHaveBeenCalled();
    expect(JSON.parse(stdout)).toMatchObject({
      location: { countryCode: 'FR' },
    });
  });

  it('a cancelled prompt exits 130 quietly', async () => {
    mockApi();
    const cancel = () =>
      Promise.reject(
        Object.assign(new Error('closed'), { name: 'ExitPromptError' })
      );
    const { code, stderr } = await runCli(['now', 'Paris'], {
      hooks: { choose: cancel },
    });
    expect(code).toBe(130);
    expect(stderr).toBe('');
  });
});

describe('errors and exit codes', () => {
  it('unknown place: exit 3 with a hint', async () => {
    mockApi();
    const { code, stdout, stderr } = await runCli(['now', 'Xyzzy']);
    expect(code).toBe(3);
    expect(stdout).toBe('');
    expect(stderr).toContain('No place called “Xyzzy”');
  });

  it('errors are JSON on stderr with --json', async () => {
    mockApi();
    const { code, stderr } = await runCli(['now', 'Xyzzy', '--json']);
    expect(code).toBe(3);
    const { error } = JSON.parse(stderr) as {
      error: { code: string; message: string; exitCode: number };
    };
    expect(error).toMatchObject({ code: 'LOCATION_NOT_FOUND', exitCode: 3 });
    expect(error.message).toContain('Xyzzy');
  });

  it('offline: exit 4', async () => {
    mockApi();
    server.use(mock.get(FORECAST_URL, () => HttpResponse.error()));
    const { code, stderr } = await runCli(['now', '--lat', '1', '--lon', '2']);
    expect(code).toBe(4);
    expect(stderr).toContain('Could not reach api.open-meteo.com');
  });

  it('API error: exit 5 with the reason', async () => {
    mockApi();
    server.use(
      mock.get(FORECAST_URL, () =>
        HttpResponse.json(
          { error: true, reason: 'Down for maintenance' },
          { status: 503 }
        )
      )
    );
    const { code, stderr } = await runCli(['now', '--lat', '1', '--lon', '2']);
    expect(code).toBe(5);
    expect(stderr).toContain('(503): Down for maintenance');
  });

  it.each([
    [['now', '--bogus'], 'unknown option --bogus'],
    [
      ['now', 'Istanbul', '--units', 'kelvin'],
      '“kelvin” is not one of: metric, imperial',
    ],
    [
      ['forecast', 'Istanbul', '--days', '30'],
      '“30” is not a whole number from 1 to 16.',
    ],
    [
      ['hourly', 'Istanbul', '--hours', '2.5'],
      '“2.5” is not a whole number from 1 to 168.',
    ],
    [['now', '--lat', '41'], '--lat and --lon go together.'],
    [
      ['now', 'Istanbul', '--lat', '41', '--lon', '29'],
      'either a place name or --lat/--lon',
    ],
    [['now', '--lat', 'north', '--lon', '29'], '“north” is not a latitude'],
    [
      ['now', 'Paris', '--country', 'France'],
      '“France” is not a two-letter country code',
    ],
    [['compare', 'Istanbul'], 'at least two places'],
    [['forcast'], 'Did you mean “skycast forecast”?'],
    [
      ['completion', 'powershell'],
      '“powershell” is not one of: bash, zsh, fish',
    ],
  ])('usage error %j: exit 2', async (argv, message) => {
    mockApi();
    const { code, stdout, stderr } = await runCli(argv);
    expect(code).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain(message);
  });

  it('suggests a close option name', async () => {
    const { stderr } = await runCli(['now', '--jsn']);
    expect(stderr).toContain('Did you mean --json?');
  });
});

describe('language and units', () => {
  it('--lang tr translates everything, including errors', async () => {
    mockApi();
    const ok = await runCli(['now', 'Istanbul', '--lang', 'tr']);
    expect(ok.stdout).toContain('İstanbul, Türkiye');
    expect(ok.stdout).toContain('hissedilen');
    const bad = await runCli(['now', '--bogus', '--lang', 'tr']);
    expect(bad.stderr).toContain('bilinmeyen seçenek: --bogus');
  });

  it('follows the system language, and SKYCAST_LANG over it', async () => {
    mockApi();
    const turkish = await runCli(['now', 'Istanbul'], {
      env: { LANG: 'tr_TR.UTF-8' },
    });
    expect(turkish.stdout).toContain('Nem');
    const english = await runCli(['now', 'Istanbul'], {
      env: { LANG: 'tr_TR.UTF-8', SKYCAST_LANG: 'en' },
    });
    expect(english.stdout).toContain('Humidity');
  });

  it('defaults to imperial only in the US', async () => {
    mockApi();
    const us = await runCli(['now', 'Istanbul', '--compact'], {
      env: { LANG: 'en_US.UTF-8', TZ: 'America/Chicago' },
    });
    expect(us.stdout).toContain('°F');
    const abroad = await runCli(['now', 'Istanbul', '--compact'], {
      env: { LANG: 'en_US.UTF-8', TZ: 'Europe/Istanbul' },
    });
    expect(abroad.stdout).toContain('°C');
    const flag = await runCli(
      ['now', 'Istanbul', '--compact', '--units', 'imperial'],
      { env: { TZ: 'Europe/Istanbul' } }
    );
    expect(flag.stdout).toContain('mph');
  });
});

describe('colour and symbols', () => {
  it('is plain when piped', async () => {
    mockApi();
    expect((await runCli(['now', 'Istanbul'])).stdout).not.toContain(ESC);
  });

  it('is coloured in a terminal', async () => {
    mockApi();
    expect((await runCli(['now', 'Istanbul'], { tty: true })).stdout).toContain(
      `${ESC}38;2;`
    );
  });

  it('respects NO_COLOR, --no-color and FORCE_COLOR', async () => {
    mockApi();
    expect(
      (await runCli(['now', 'Istanbul'], { tty: true, env: { NO_COLOR: '1' } }))
        .stdout
    ).not.toContain(ESC);
    expect(
      (await runCli(['now', 'Istanbul', '--no-color'], { tty: true })).stdout
    ).not.toContain(ESC);
    expect(
      (await runCli(['now', 'Istanbul'], { env: { FORCE_COLOR: '1' } })).stdout
    ).toContain(ESC);
  });

  it('--ascii avoids Unicode symbols', async () => {
    mockApi();
    const { stdout } = await runCli(['forecast', 'Istanbul', '--ascii']);
    expect(stdout).not.toMatch(/[↙━─·…]/);
    expect(stdout).toContain('=');
  });

  it('fits a narrow terminal', async () => {
    mockApi();
    const { stdout } = await runCli(['forecast', 'Istanbul'], {
      env: { COLUMNS: '40' },
    });
    for (const line of stdout.split('\n')) {
      expect(stripVTControlCharacters(line).length).toBeLessThanOrEqual(40);
    }
  });
});

describe('compare', () => {
  it('shows every place in one request', async () => {
    const log = mockApi();
    const { code, stdout } = await runCli([
      'compare',
      'Istanbul',
      'Paris, France',
      'New York',
    ]);
    expect(code).toBe(0);
    expect(log.forecast).toHaveLength(1);
    expect(stdout).toMatch(/Istanbul, TR[\s\S]*Paris, FR[\s\S]*New York, US/);
  });

  it('shows what it found and exits with the failure code', async () => {
    mockApi();
    const { code, stdout, stderr } = await runCli([
      'compare',
      'Istanbul',
      'Xyzzy',
      'Paris, France',
    ]);
    expect(code).toBe(3);
    expect(stdout).toContain('Istanbul, TR');
    expect(stderr).toContain('Xyzzy: No place called');
  });

  it('reports per-place results in JSON', async () => {
    mockApi();
    const { stdout } = await runCli(['compare', 'Istanbul', 'Xyzzy', '--json']);
    const json = JSON.parse(stdout) as {
      results: { query: string; ok: boolean }[];
    };
    expect(json.results.map(r => [r.query, r.ok])).toEqual([
      ['Istanbul', true],
      ['Xyzzy', false],
    ]);
  });

  it('fails like a single lookup when nothing is found', async () => {
    mockApi();
    const { code } = await runCli(['compare', 'Xyzzy', 'Qwxyz']);
    expect(code).toBe(3);
  });

  it('refuses more than ten places', async () => {
    const { code, stderr } = await runCli([
      'compare',
      ...Array.from({ length: 11 }, (_, i) => `P${i}`),
    ]);
    expect(code).toBe(2);
    expect(stderr).toContain('up to 10');
  });
});

describe('help and diagnostics', () => {
  it('shows help with examples, in the chosen language', async () => {
    const en = await runCli(['--help']);
    expect(en.code).toBe(0);
    expect(en.stdout).toContain('Examples:');
    const tr = await runCli(['forecast', '--help', '--lang', 'tr']);
    expect(tr.stdout).toContain('Kullanım:');
    expect(tr.stdout).toContain('(varsayılan: 7)');
  });

  it('shows help when run without arguments', async () => {
    const { code, stdout } = await runCli([]);
    expect(code).toBe(0);
    expect(stdout).toContain('Usage: skycast');
  });

  it('--verbose explains requests on stderr', async () => {
    mockApi();
    const { stdout, stderr } = await runCli(['now', 'Istanbul', '--verbose']);
    expect(stderr).toMatch(
      /› GET https:\/\/geocoding-api\.open-meteo\.com\/v1\/search\?.* → 200/
    );
    expect(stdout).toContain('Istanbul');
  });

  it('shows the stack for unexpected errors only with --verbose', async () => {
    const fetch = () => Promise.reject(new RangeError('boom'));
    const quiet = await runCli(['now', '--lat', '1', '--lon', '2'], {
      hooks: { fetch },
    });
    expect(quiet.code).toBe(1);
    expect(quiet.stderr).toContain('Something went wrong: boom');
    expect(quiet.stderr).toContain('--verbose');
    expect(quiet.stderr).not.toContain('    at ');
    const loud = await runCli(
      ['now', '--lat', '1', '--lon', '2', '--verbose'],
      { hooks: { fetch } }
    );
    expect(loud.stderr).toContain('RangeError: boom\n    at ');
  });
});

describe('shell completion', () => {
  const shells = ['bash', 'zsh', 'fish'] as const;
  const has = (shell: string) => {
    try {
      execFileSync(shell, ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };
  const syntaxCheck = {
    bash: ['-n'],
    zsh: ['-n'],
    fish: ['--no-execute'],
  } as const;

  it.each(shells)(
    '%s: prints a script that knows the commands',
    async shell => {
      const { code, stdout } = await runCli(['completion', shell]);
      expect(code).toBe(0);
      for (const word of [
        'now',
        'forecast',
        'hourly',
        'compare',
        'units',
        'metric',
        'imperial',
      ]) {
        expect(stdout).toContain(word);
      }
      expect(stdout).toMatchSnapshot();
    }
  );

  it.each(shells)('%s: the script is valid shell syntax', async shell => {
    if (!has(shell)) return;
    const { stdout } = await runCli(['completion', shell]);
    const file = join(
      mkdtempSync(join(tmpdir(), 'skycast-completion-')),
      `script.${shell}`
    );
    writeFileSync(file, stdout);
    expect(() =>
      execFileSync(shell, [...syntaxCheck[shell], file], { stdio: 'pipe' })
    ).not.toThrow();
  });

  it('bash: completes commands, options and choices', async () => {
    if (!has('bash')) return;
    const { stdout } = await runCli(['completion', 'bash']);
    const dir = mkdtempSync(join(tmpdir(), 'skycast-completion-'));
    writeFileSync(join(dir, 'skycast.bash'), stdout);
    const complete = (line: string) =>
      execFileSync(
        'bash',
        [
          '-c',
          `source "${join(dir, 'skycast.bash')}"; COMP_WORDS=(${line}); COMP_CWORD=$((\${#COMP_WORDS[@]} - 1)); _skycast; echo "\${COMPREPLY[*]}"`,
        ],
        { encoding: 'utf8' }
      ).trim();
    expect(complete('skycast fo')).toBe('forecast');
    expect(complete('skycast forecast --d')).toBe('--days');
    expect(complete('skycast --units m')).toBe('metric');
    expect(complete('skycast --units metric hou')).toBe('hourly');
    expect(complete('skycast completion f')).toBe('fish');
  });
});
