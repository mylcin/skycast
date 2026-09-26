import { describe, expect, it } from 'vitest';
import {
  describeError,
  translateCommanderError,
} from '../../../src/cli/errors.ts';
import {
  CancelledError,
  ConfigError,
  InvalidResponseError,
  LocationNotFoundError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  UpstreamError,
  StorageError,
  UsageError,
} from '../../../src/core/errors.ts';
import { en } from '../../../src/i18n/en.ts';
import { tr } from '../../../src/i18n/tr.ts';

describe('describeError', () => {
  it.each([
    [
      new LocationNotFoundError('Xyzzy'),
      'LOCATION_NOT_FOUND',
      3,
      'No place called “Xyzzy”',
    ],
    [
      new TimeoutError('api.test', 8000),
      'TIMEOUT',
      4,
      'did not answer in time',
    ],
    [new NetworkError('api.test'), 'NETWORK', 4, 'Could not reach api.test'],
    [
      new RateLimitError('api.test', 429, null),
      'RATE_LIMITED',
      5,
      'Too many requests',
    ],
    [
      new InvalidResponseError('api.test', 'x'),
      'INVALID_RESPONSE',
      5,
      'does not understand',
    ],
    [
      new UpstreamError('api.test', 500, null),
      'UPSTREAM',
      5,
      '(500): api.test',
    ],
    [
      new ConfigError('/c.json', 'invalid-value', 'units'),
      'CONFIG',
      1,
      'The setting “units” in /c.json is not valid',
    ],
    [
      new ConfigError('/c.json', 'invalid-json'),
      'CONFIG',
      1,
      '/c.json is not valid JSON',
    ],
    [
      new ConfigError('/c.json', 'unreadable', 'EACCES'),
      'CONFIG',
      1,
      'cannot read /c.json (EACCES)',
    ],
    [new ConfigError('/c.json', 'not-a-file'), 'CONFIG', 1, 'it is a folder'],
    [
      new StorageError('/c.json', 'EACCES'),
      'STORAGE',
      1,
      'could not write /c.json (EACCES)',
    ],
    [
      new LocationNotFoundError('Paris, Frnce', true),
      'LOCATION_NOT_FOUND',
      3,
      'Check the spelling.',
    ],
    [new UsageError('Try again'), 'USAGE', 2, 'Try again'],
  ])('%s', (error, code, exitCode, message) => {
    const failure = describeError(error, en);
    expect(failure).toMatchObject({ code, exitCode, unexpected: false });
    expect(failure.message).toContain(message);
  });

  it('is quiet about cancelling', () => {
    expect(describeError(new CancelledError(), en)).toMatchObject({
      exitCode: 130,
      message: '',
    });
    const prompt = Object.assign(new Error('User force closed the prompt'), {
      name: 'ExitPromptError',
    });
    expect(describeError(prompt, en)).toMatchObject({
      code: 'CANCELLED',
      exitCode: 130,
      message: '',
    });
  });

  it('marks anything else as unexpected', () => {
    expect(describeError(new RangeError('boom'), tr)).toEqual({
      code: 'INTERNAL',
      message: 'Bir şeyler ters gitti: boom',
      exitCode: 1,
      unexpected: true,
    });
    expect(describeError('a string', en).message).toContain('a string');
  });
});

describe('translateCommanderError', () => {
  it.each([
    [
      "error: unknown option '--jsn'\n(Did you mean --json?)",
      'unknown option --jsn Did you mean --json?',
      'bilinmeyen seçenek: --jsn --json mı demek istediniz?',
    ],
    [
      "error: unknown command 'forcast'",
      'unknown command “forcast”',
      'bilinmeyen komut: “forcast”',
    ],
    [
      "error: missing required argument 'places'",
      'missing the places',
      'yer adları eksik',
    ],
    [
      "error: option '-d, --days <n>' argument missing",
      "option '-d, --days <n>' argument missing",
      '',
    ],
    [
      "error: too many arguments for 'get'. Expected 1 argument but got 2.",
      'too many arguments',
      'fazla argüman',
    ],
    [
      "error: option '-u, --units <system>' argument 'kelvin' is invalid. Allowed choices are metric, imperial.",
      '“kelvin” is not one of: metric, imperial',
      '“kelvin” geçerli değil, şunlardan biri olmalı: metric, imperial',
    ],
    [
      "error: option '-d, --days <n>' argument '30' is invalid. “30” is not a whole number from 1 to 16.",
      '“30” is not a whole number from 1 to 16.',
      '',
    ],
  ])('%j', (input, english, turkish) => {
    if (english.startsWith('option ')) {
      expect(translateCommanderError(input, en)).toBe(
        '-d, --days <n> needs a value'
      );
      expect(translateCommanderError(input, tr)).toBe(
        '-d, --days <n> için bir değer gerekli'
      );
      return;
    }
    expect(translateCommanderError(input, en)).toBe(english);
    if (turkish) expect(translateCommanderError(input, tr)).toBe(turkish);
  });

  it('passes unknown messages through', () => {
    expect(translateCommanderError('error: something new', en)).toBe(
      'something new'
    );
  });
});
