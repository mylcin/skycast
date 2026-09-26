import type { Location } from '../core/models.ts';
import type { Messages } from '../i18n/index.ts';
import { formatCoordinates } from './format.ts';
import type { Symbols } from './symbols.ts';

const regionNames = new Map<string, Intl.DisplayNames | null>();

/**
 * The country in the UI language. The API's own names can be formal
 * ("Türkiye Cumhuriyeti", "Republic of Türkiye"), Intl gives the common one.
 */
export function countryName(
  location: Location,
  t: Messages
): string | undefined {
  const code = location.countryCode;
  if (code) {
    if (!regionNames.has(t.locale)) {
      try {
        regionNames.set(
          t.locale,
          new Intl.DisplayNames([t.locale], {
            type: 'region',
            fallback: 'none',
          })
        );
      } catch {
        regionNames.set(t.locale, null);
      }
    }
    const name = regionNames.get(t.locale)?.of(code);
    if (name) return name;
  }
  return location.country;
}

/** "Paris, France", or coordinates for an unnamed point. */
export function placeTitle(
  location: Location,
  t: Messages,
  symbols: Symbols
): string {
  if (location.name === null)
    return formatCoordinates(location.latitude, location.longitude, t, symbols);
  const country = countryName(location, t);
  return country && country !== location.name
    ? `${location.name}, ${country}`
    : location.name;
}

/** "Paris, Texas, United States": enough to tell namesakes apart. */
export function placeLabel(
  location: Location,
  t: Messages,
  symbols: Symbols
): string {
  if (location.name === null) return placeTitle(location, t, symbols);
  const parts = [
    location.name,
    location.region,
    countryName(location, t),
  ].filter(
    (part, index, all): part is string =>
      Boolean(part) && all.indexOf(part) === index
  );
  return parts.join(', ');
}

/** "Paris, FR": for tables. */
export function placeShort(
  location: Location,
  t: Messages,
  symbols: Symbols
): string {
  if (location.name === null)
    return formatCoordinates(location.latitude, location.longitude, t, symbols);
  return location.countryCode
    ? `${location.name}, ${location.countryCode}`
    : location.name;
}
