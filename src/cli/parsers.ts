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

export function latitude(t: Messages) {
  return (value: string): number => {
    const number = Number(value);
    if (value.trim() === '' || !isValidCoordinates(number, 0)) {
      throw new InvalidArgumentError(t.cli.invalidLatitude(value));
    }
    return number;
  };
}

export function longitude(t: Messages) {
  return (value: string): number => {
    const number = Number(value);
    if (value.trim() === '' || !isValidCoordinates(0, number)) {
      throw new InvalidArgumentError(t.cli.invalidLongitude(value));
    }
    return number;
  };
}

/** ISO 3166-1 alpha-2, checked against the regions Intl knows about. */
export function countryCode(t: Messages) {
  return (value: string): string => {
    const code = value.trim().toUpperCase();
    let known = false;
    if (/^[A-Z]{2}$/.test(code)) {
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
