import { describe, expect, it } from 'vitest';
import {
  coordinateLocation,
  isSamePlace,
  isValidCoordinates,
  normalizeName,
  rankCandidates,
  splitQuery,
} from '../../../src/core/location.ts';
import { places } from '../../helpers/fixtures.ts';

describe('normalizeName', () => {
  it('ignores case, accents and Turkish dotted/dotless i', () => {
    expect(normalizeName('İstanbul')).toBe('istanbul');
    expect(normalizeName('ISTANBUL')).toBe('istanbul');
    expect(normalizeName('Eskişehir')).toBe('eskisehir');
    expect(normalizeName('Iğdır')).toBe('igdir');
    expect(normalizeName('  São   Paulo ')).toBe('sao paulo');
  });
});

describe('splitQuery', () => {
  it('splits a country or region qualifier', () => {
    expect(splitQuery('Paris, France')).toEqual({
      name: 'Paris',
      qualifier: 'France',
    });
    expect(splitQuery('Paris')).toEqual({ name: 'Paris' });
    expect(splitQuery('Paris,')).toEqual({ name: 'Paris' });
  });
});

describe('rankCandidates (real geocoding results)', () => {
  const rank = (fixture: string, query: string) =>
    rankCandidates(places(fixture), query);

  it.each([
    ['geo-paris-en', 'Paris'],
    ['geo-london-en', 'London'],
    ['geo-springfield-en', 'Springfield'],
  ])('%s is ambiguous', (fixture, query) => {
    const { ambiguous, places } = rank(fixture, query);
    expect(ambiguous).toBe(true);
    expect(places.length).toBeGreaterThan(1);
    expect(places.every(place => place.name === query)).toBe(true);
  });

  it.each([
    ['geo-istanbul-tr', 'istanbul', 'İstanbul'],
    ['geo-ankara-tr', 'Ankara', 'Ankara'],
    ['geo-tokyo-en', 'Tokyo', 'Tokyo'],
    ['geo-berlin-en', 'Berlin', 'Berlin'],
    ['geo-eskisehir-tr', 'Eskisehir', 'Eskişehir'],
    ['geo-new-york-en', 'New York', 'New York'],
    ['geo-paris-france-en', 'Paris, France', 'Paris'],
  ])('%s is not ambiguous', (fixture, query, name) => {
    const { ambiguous, places } = rank(fixture, query);
    expect(ambiguous).toBe(false);
    expect(places[0]?.name).toBe(name);
  });

  it('puts the most relevant place first and drops unknown namesakes', () => {
    const { places } = rank('geo-london-en', 'London');
    expect(places[0]).toMatchObject({ countryCode: 'GB' });
    expect(places.some(place => place.population === undefined)).toBe(false);
  });

  it('ignores airports and districts when a town matches', () => {
    const { places } = rank('geo-istanbul-en', 'Istanbul');
    expect(places.map(p => p.featureCode)).toEqual(['PPLA']);
  });

  it('keeps every exact match when there is no population data', () => {
    const result = rankCandidates(
      [
        { name: 'Springfield', latitude: 1, longitude: 1, featureCode: 'PPL' },
        {
          name: 'Springfield',
          latitude: 2,
          longitude: 2,
          featureCode: 'PPL',
          region: 'B',
        },
      ],
      'Springfield'
    );
    expect(result).toMatchObject({ ambiguous: true });
    expect(result.places).toHaveLength(2);
  });

  it('falls back to non-towns, like an airport by name', () => {
    const result = rankCandidates(
      [
        {
          name: 'Heathrow Airport',
          latitude: 51.47,
          longitude: -0.45,
          featureCode: 'AIRP',
        },
      ],
      'Heathrow'
    );
    expect(result.places[0]?.name).toBe('Heathrow Airport');
  });

  it('handles no results', () => {
    expect(rankCandidates([], 'x')).toEqual({ places: [], ambiguous: false });
  });
});

describe('coordinates', () => {
  it('validates ranges', () => {
    expect(isValidCoordinates(41, 29)).toBe(true);
    expect(isValidCoordinates(-90, 180)).toBe(true);
    expect(isValidCoordinates(91, 0)).toBe(false);
    expect(isValidCoordinates(0, -181)).toBe(false);
    expect(isValidCoordinates(Number.NaN, 0)).toBe(false);
  });

  it('builds a nameless location', () => {
    expect(coordinateLocation(1, 2)).toEqual({
      name: null,
      latitude: 1,
      longitude: 2,
    });
  });

  it('compares places by id, or by distance', () => {
    expect(
      isSamePlace(
        { id: 1, latitude: 0, longitude: 0 },
        { id: 1, latitude: 5, longitude: 5 }
      )
    ).toBe(true);
    expect(
      isSamePlace(
        { id: 1, latitude: 0, longitude: 0 },
        { id: 2, latitude: 0, longitude: 0 }
      )
    ).toBe(false);
    expect(
      isSamePlace(
        { latitude: 41.0138, longitude: 28.9497 },
        { latitude: 41.01, longitude: 28.95 }
      )
    ).toBe(true);
  });
});
