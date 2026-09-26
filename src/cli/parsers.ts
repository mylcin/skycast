import { InvalidArgumentError } from '@commander-js/extra-typings';
import { isValidCoordinates } from '../core/location.ts';
import type { Messages } from '../i18n/index.ts';

/** Commander argument parsers that explain themselves in the UI language. */

export function integer(t: Messages, min: number, max: number) {
  return (value: string): number => {
    const number = Number(value);
    if (!/^\d+$/.test(value.trim()) || number < min || number > max) {
      throw new InvalidArgumentError(t.cli.invalidInteger(value, min, max));
    }
    return number;
  };
}

/** Plain decimals only: Number() would also accept "0x10" and "0b11". */
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

export function latitude(t: Messages) {
  return (value: string): number => {
    const number = Number(value);
    if (!DECIMAL.test(value.trim()) || !isValidCoordinates(number, 0)) {
      throw new InvalidArgumentError(t.cli.invalidLatitude(value));
    }
    return number;
  };
}

export function longitude(t: Messages) {
  return (value: string): number => {
    const number = Number(value);
    if (!DECIMAL.test(value.trim()) || !isValidCoordinates(0, number)) {
      throw new InvalidArgumentError(t.cli.invalidLongitude(value));
    }
    return number;
  };
}

/** Common names for country codes that are not the ISO ones. */
const ALIASES: Record<string, string> = { UK: 'GB', EL: 'GR' };

/**
 * Codes Intl knows that are not countries in GeoNames: reserved (UK, EU,
 * UN, EZ), private use (AA, QM–QZ, XA–XZ except Kosovo's XK) and unknown (ZZ).
 */
function isAssigned(code: string): boolean {
  if (['EU', 'EZ', 'UN', 'AA', 'ZZ'].includes(code)) return false;
  if (/^Q[M-Z]$/.test(code)) return false;
  if (/^X[A-Z]$/.test(code) && code !== 'XK') return false;
  return true;
}

/** ISO 3166-1 alpha-2, checked against the regions Intl knows about. */
export function countryCode(t: Messages) {
  return (value: string): string => {
    const raw = value.trim().toUpperCase();
    const code = ALIASES[raw] ?? raw;
    let known = false;
    if (/^[A-Z]{2}$/.test(code) && isAssigned(code)) {
      try {
        known =
          new Intl.DisplayNames(['en'], {
            type: 'region',
            fallback: 'none',
          }).of(code) !== undefined;
      } catch {
        known = false;
      }
    }
    if (!known) throw new InvalidArgumentError(t.cli.invalidCountry(value));
    return code;
  };
}
