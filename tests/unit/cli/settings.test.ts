import { describe, expect, it } from 'vitest';
import {
  resolveLang,
  resolveUnits,
  scanLang,
  systemLocale,
  systemTimeZone,
} from '../../../src/cli/settings.ts';

describe('systemLocale', () => {
  it('reads POSIX locale variables in priority order', () => {
    expect(systemLocale({ LANG: 'tr_TR.UTF-8' })).toBe('tr-TR');
    expect(systemLocale({ LC_ALL: 'de_DE', LANG: 'tr_TR' })).toBe('de-DE');
    expect(systemLocale({ LC_MESSAGES: 'fr_FR.UTF-8', LANG: 'tr_TR' })).toBe(
      'fr-FR'
    );
  });

  it('treats empty variables as unset', () => {
    expect(
      systemLocale({ LC_ALL: '', LC_MESSAGES: '', LANG: 'tr_TR.UTF-8' })
    ).toBe('tr-TR');
  });

  it('falls back to Intl for C and POSIX', () => {
    expect(systemLocale({ LANG: 'C' })).toBe(
      Intl.DateTimeFormat().resolvedOptions().locale
    );
    expect(systemLocale({ LANG: 'POSIX.UTF-8' })).toBe(
      Intl.DateTimeFormat().resolvedOptions().locale
    );
  });
});

describe('systemTimeZone', () => {
  it('reads TZ, including the ":Area/City" form', () => {
    expect(systemTimeZone({ TZ: 'America/Chicago' })).toBe('America/Chicago');
    expect(systemTimeZone({ TZ: ':Europe/Istanbul' })).toBe('Europe/Istanbul');
    expect(systemTimeZone({})).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
  });
});

describe('scanLang', () => {
  it('finds --lang before commander runs', () => {
    expect(scanLang(['now', '--lang', 'tr'])).toBe('tr');
    expect(scanLang(['-l', 'en', 'now'])).toBe('en');
    expect(scanLang(['--lang=tr'])).toBe('tr');
    expect(scanLang(['now', 'Istanbul'])).toBeUndefined();
    expect(scanLang(['now', '--', '--lang', 'tr'])).toBeUndefined();
    expect(scanLang(['-ltr', 'now'])).toBe('tr');
    expect(scanLang(['-cl', 'tr', 'now'])).toBe('tr');
    expect(scanLang(['--lang', 'en', '--lang', 'tr'])).toBe('tr');
  });
});

describe('resolveLang', () => {
  it('prefers the flag, then SKYCAST_LANG, then the saved value, then the system', () => {
    expect(
      resolveLang({ flag: 'tr', env: { SKYCAST_LANG: 'en' }, saved: 'en' })
    ).toBe('tr');
    expect(resolveLang({ env: { SKYCAST_LANG: 'tr' }, saved: 'en' })).toBe(
      'tr'
    );
    expect(resolveLang({ env: { LANG: 'tr_TR' }, saved: 'en' })).toBe('en');
    expect(resolveLang({ env: { LANG: 'tr_TR.UTF-8' } })).toBe('tr');
    expect(resolveLang({ env: { LANG: 'de_DE' } })).toBe('en');
  });

  it('ignores values it does not know', () => {
    expect(
      resolveLang({ flag: 'fr', env: { SKYCAST_LANG: 'xx', LANG: 'tr_TR' } })
    ).toBe('tr');
  });
});

describe('resolveUnits', () => {
  it('prefers the flag, then SKYCAST_UNITS, then the saved value, then the locale', () => {
    const env = { LANG: 'en_US', TZ: 'America/New_York' };
    expect(resolveUnits({ flag: 'metric', env, saved: 'imperial' })).toBe(
      'metric'
    );
    expect(
      resolveUnits({
        env: { ...env, SKYCAST_UNITS: 'metric' },
        saved: 'imperial',
      })
    ).toBe('metric');
    expect(resolveUnits({ env, saved: 'metric' })).toBe('metric');
    expect(resolveUnits({ env })).toBe('imperial');
    expect(
      resolveUnits({ env: { LANG: 'tr_TR', TZ: 'Europe/Istanbul' } })
    ).toBe('metric');
  });
});
