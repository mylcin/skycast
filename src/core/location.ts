import type { Coordinates, Location } from './models.ts';

/** Letters that Unicode decomposition leaves alone. */
const FOLD: Record<string, string> = {
  ı: 'i',
  ł: 'l',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  þ: 'th',
};

/** Case- and accent-insensitive form used to compare place names. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[ıłøđðßæœþ]/g, char => FOLD[char] ?? char)
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

/** A country, dependency or territory ("Mexico", "Georgia"). */
export function isCountry(location: Location): boolean {
  const code = location.featureCode;
  return code !== undefined && (code.startsWith('PCL') || code === 'TERR');
}

/** A state or province ("Georgia", "Texas"). */
function isState(location: Location): boolean {
  return location.featureCode === 'ADM1';
}

const population = (place: Location): number => place.population ?? 0;

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
  const wanted = normalizeName(splitQuery(query).name);
  const named = (place: Location): boolean =>
    place.name !== null && normalizeName(place.name) === wanted;

  // Towns, plus countries and states asked for by their own name.
  const eligible = results.filter(
    place =>
      isPopulatedPlace(place) ||
      ((isCountry(place) || isState(place)) && named(place))
  );
  const pool = eligible.length > 0 ? eligible : results;

  // The provider also matches alternate names and answers in the UI
  // language: "Praha" finds Prague. Keep that top hit when it outweighs
  // every literal namesake, instead of a 74-person village called Praha.
  const exact = pool.filter(named);
  const [first] = pool;
  const largestExact = Math.max(0, ...exact.map(population));
  const matches =
    exact.length === 0
      ? pool
      : first && !exact.includes(first) && population(first) > largestExact
        ? [first, ...exact]
        : exact;

  const unique = matches.filter(
    (place, index) =>
      matches.findIndex(other => sameLabel(other, place)) === index
  );
  // Places with a known population outrank those without, in provider order.
  const places = [
    ...unique.filter(place => population(place) > 0),
    ...unique.filter(place => population(place) === 0),
  ];

  const [best, ...rest] = places;
  if (!best) return { places: [], ambiguous: false };

  const top = population(best);
  if (top === 0) {
    // Without population data every match is equally plausible.
    return { places, ambiguous: rest.length > 0 };
  }
  const known = rest.filter(place => population(place) > 0);
  const ambiguous = known.some(
    place => population(place) >= top * NAMESAKE_SHARE
  );
  return { places: [best, ...known], ambiguous };
}

const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'GB',
  'u.k.': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  usa: 'US',
  'u.s.': 'US',
  'u.s.a.': 'US',
  uae: 'AE',
};

/**
 * Whether a place fits the part after the comma: a country code or alias
 * ("UK", "USA"), or the start of its region or country name ("Mass.").
 */
export function matchesQualifier(place: Location, qualifier: string): boolean {
  const wanted = normalizeName(qualifier);
  if (!wanted) return true;
  const code =
    COUNTRY_ALIASES[wanted] ??
    (/^[a-z]{2}$/.test(wanted) ? wanted.toUpperCase() : undefined);
  if (code !== undefined && place.countryCode === code) return true;
  const stem = wanted.replace(/\.$/, '');
  return [place.region, place.country].some(
    part => part !== undefined && normalizeName(part).startsWith(stem)
  );
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
