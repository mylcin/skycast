import type { Coordinates, Location } from './models.ts';

/** Case- and accent-insensitive form used to compare place names. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replaceAll('ı', 'i')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Paris, France" → { name: "Paris", qualifier: "France" }. */
export function splitQuery(query: string): {
  name: string;
  qualifier?: string;
} {
  const [name = '', qualifier] = query.split(',').map(part => part.trim());
  return qualifier ? { name, qualifier } : { name };
}

/** GeoNames populated places, minus sections, historical and abandoned ones. */
function isPopulatedPlace(location: Location): boolean {
  const code = location.featureCode;
  return (
    code !== undefined &&
    code.startsWith('PPL') &&
    !['PPLX', 'PPLH', 'PPLQ', 'PPLW', 'PPLCH'].includes(code)
  );
}

function sameLabel(a: Location, b: Location): boolean {
  return (
    a.name === b.name &&
    a.region === b.region &&
    a.countryCode === b.countryCode
  );
}

/**
 * A namesake only makes a name ambiguous when it has at least this share of
 * the best match's population: "Paris" asks between France and Texas (1.2%),
 * "Eskişehir" does not ask about a village of 82 people.
 */
const NAMESAKE_SHARE = 0.01;

export interface Candidates {
  /** Places worth offering, best first. */
  readonly places: readonly Location[];
  /** More than one plausible place: worth asking the user. */
  readonly ambiguous: boolean;
}

/**
 * Narrows geocoding results (already ranked by the provider) to the places a
 * person most likely meant, and decides whether the name is ambiguous.
 */
export function rankCandidates(
  results: readonly Location[],
  query: string
): Candidates {
  const populated = results.filter(isPopulatedPlace);
  const pool = populated.length > 0 ? populated : results;

  const wanted = normalizeName(splitQuery(query).name);
  const exact = pool.filter(
    place => place.name !== null && normalizeName(place.name) === wanted
  );
  const matches = exact.length > 0 ? exact : pool;
  const places = matches.filter(
    (place, index) =>
      matches.findIndex(other => sameLabel(other, place)) === index
  );

  const [best, ...rest] = places;
  if (!best) return { places: [], ambiguous: false };

  const top = best.population ?? 0;
  if (top === 0) {
    // Without population data every match is equally plausible.
    return { places, ambiguous: rest.length > 0 };
  }
  const known = rest.filter(place => (place.population ?? 0) > 0);
  const ambiguous = known.some(
    place => (place.population ?? 0) >= top * NAMESAKE_SHARE
  );
  return { places: [best, ...known], ambiguous };
}

/** Two locations closer than ~1 km are the same place. */
export function isSamePlace(
  a: Coordinates & { id?: number },
  b: Coordinates & { id?: number }
): boolean {
  if (a.id !== undefined && b.id !== undefined) return a.id === b.id;
  return (
    Math.abs(a.latitude - b.latitude) < 0.01 &&
    Math.abs(a.longitude - b.longitude) < 0.01
  );
}

export function isValidCoordinates(
  latitude: number,
  longitude: number
): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

/** A location for a bare coordinate pair. */
export function coordinateLocation(
  latitude: number,
  longitude: number
): Location {
  return { name: null, latitude, longitude };
}
