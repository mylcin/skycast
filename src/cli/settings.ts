import type { UnitSystem } from '../core/models.ts';
import { unitsForLocale } from '../core/units.ts';
import { isLang, type Lang } from '../i18n/index.ts';
import type { Io } from './io.ts';

/** The user's locale as BCP 47 ("tr-TR"), from the environment or Intl. */
export function systemLocale(env: Io['env']): string | undefined {
  // Empty values count as unset, as in POSIX.
  const raw = env.LC_ALL || env.LC_MESSAGES || env.LANG;
  // POSIX locales look like "tr_TR.UTF-8"; "C" and "POSIX" say nothing.
  const posix = raw?.split('.')[0]?.replace('_', '-');
  if (posix && posix !== 'C' && posix !== 'POSIX') return posix;
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

/** The system time zone: TZ, or what Intl reports. */
export function systemTimeZone(env: Io['env']): string | undefined {
  if (env.TZ) return env.TZ.replace(/^:/, '');
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function langOf(locale: string | undefined): Lang {
  return locale?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

/**
 * The value of `--lang` before commander runs: help text is built in the
 * chosen language, so it has to be known first.
 */
export function scanLang(argv: readonly string[]): string | undefined {
  let found: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--') break;
    if (arg === '--lang') found = argv[i + 1];
    else if (arg.startsWith('--lang=')) found = arg.slice('--lang='.length);
    else if (/^-[a-zA-Z]*l/.test(arg) && !arg.startsWith('--')) {
      // -l tr, -ltr, -cl tr: short flags can be bundled, the value follows l.
      const rest = arg.slice(arg.indexOf('l') + 1);
      found = rest || argv[i + 1];
    }
  }
  return found;
}

/** Arguments before `--`, where options can appear. */
export function optionArgs(argv: readonly string[]): readonly string[] {
  const end = argv.indexOf('--');
  return end === -1 ? argv : argv.slice(0, end);
}

export interface SettingSources<T> {
  readonly flag?: string | undefined;
  readonly env: Io['env'];
  readonly saved?: T | undefined;
}

/** --lang, then SKYCAST_LANG, then the saved setting, then the system. */
export function resolveLang({ flag, env, saved }: SettingSources<Lang>): Lang {
  for (const value of [flag, env.SKYCAST_LANG]) {
    if (value && isLang(value)) return value;
  }
  return saved ?? langOf(systemLocale(env));
}

const isUnits = (value: string): value is UnitSystem =>
  value === 'metric' || value === 'imperial';

/** --units, then SKYCAST_UNITS, then the saved setting, then the locale. */
export function resolveUnits({
  flag,
  env,
  saved,
}: SettingSources<UnitSystem>): UnitSystem {
  for (const value of [flag, env.SKYCAST_UNITS]) {
    if (value && isUnits(value)) return value;
  }
  return saved ?? unitsForLocale(systemLocale(env), systemTimeZone(env));
}
