import { describe, expect, it } from 'vitest';
import { en } from '../../../src/i18n/en.ts';
import { tr } from '../../../src/i18n/tr.ts';
import {
  countryName,
  placeLabel,
  placeShort,
  placeTitle,
} from '../../../src/renderers/place.ts';
import { getSymbols } from '../../../src/renderers/symbols.ts';
import { place } from '../../helpers/reports.ts';

const symbols = getSymbols(true);

describe('places', () => {
  it('prefers the common country name over the API one', () => {
    const istanbul = place('geo-istanbul-tr');
    expect(istanbul.country).toBe('Türkiye Cumhuriyeti');
    expect(countryName(istanbul, tr)).toBe('Türkiye');
    expect(
      countryName(
        { name: 'X', latitude: 0, longitude: 0, country: 'Nowhere' },
        en
      )
    ).toBe('Nowhere');
  });

  it('builds titles, labels and short names', () => {
    const paris = place('geo-paris-en');
    expect(placeTitle(paris, en, symbols)).toBe('Paris, France');
    expect(placeTitle(paris, tr, symbols)).toBe('Paris, Fransa');
    expect(placeLabel(paris, en, symbols)).toBe(
      'Paris, Île-de-France Region, France'
    );
    expect(placeShort(paris, en, symbols)).toBe('Paris, FR');
  });

  it('does not repeat a region that shares the city name', () => {
    expect(placeLabel(place('geo-istanbul-en'), en, symbols)).toBe(
      'Istanbul, Türkiye'
    );
  });

  it('falls back to coordinates for unnamed points', () => {
    const point = { name: null, latitude: 1.5, longitude: -2.25 };
    expect(placeTitle(point, en, symbols)).toBe('1.5°N, 2.25°W');
    expect(placeLabel(point, en, symbols)).toBe('1.5°N, 2.25°W');
    expect(placeShort(point, en, symbols)).toBe('1.5°N, 2.25°W');
  });
});
