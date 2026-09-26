import { UsageError } from '../core/errors.ts';
import { coordinateLocation, splitQuery } from '../core/location.ts';
import type { Location } from '../core/models.ts';
import { placeTitle } from '../renderers/place.ts';
import type { Session } from './session.ts';

/** How a command was told where: words, coordinates, or nothing. */
export interface PlaceInput {
  readonly words: readonly string[];
  readonly lat?: number | undefined;
  readonly lon?: number | undefined;
  readonly country?: string | undefined;
}

/** Joins "New York" typed as two words, and "Paris," "France". */
export function queryOf(words: readonly string[]): string {
  return words
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '');
}

export interface ResolveInput {
  readonly country?: string | undefined;
  /** Whether the command has --country, so the hint may suggest it. */
  readonly countryFlag: boolean;
}

/**
 * Resolves a place name through geocoding, asking when it is ambiguous and
 * someone can answer, or saying which place was picked when nobody can.
 */
export async function resolvePlace(
  session: Session,
  query: string,
  { country, countryFlag }: ResolveInput
): Promise<Location> {
  const { t, render } = session;
  const resolution = await session.services.locations.resolve(query, {
    language: session.lang,
    ...(country && { countryCode: country }),
    ...(session.choose && { choose: session.choose }),
    ...(session.signal && { signal: session.signal }),
  });
  const [other] = resolution.alternatives;
  if (resolution.how === 'best' && other) {
    // Suggest a real namesake: "Paris, Texas" rather than a made-up one.
    const { name } = splitQuery(query);
    const where = other.region ?? other.countryCode ?? other.country;
    const example = where ? `${name}, ${where}` : name;
    const hint = t.cli.bestGuess(
      placeTitle(resolution.location, t, render.symbols),
      name,
      example
    );
    session.notice(countryFlag ? `${hint} ${t.cli.orUseCountry}` : hint);
  }
  return resolution.location;
}

/**
 * The location for a single-place command. `fallback` supplies the saved
 * default place when nothing was given.
 */
export async function locate(
  session: Session,
  input: PlaceInput,
  fallback?: () => Location | undefined
): Promise<Location> {
  const { t } = session;
  const query = queryOf(input.words);
  const hasLat = input.lat !== undefined;
  const hasLon = input.lon !== undefined;
  if (hasLat !== hasLon) throw new UsageError(t.cli.latLonPair);
  if (input.lat !== undefined && input.lon !== undefined) {
    if (query) throw new UsageError(t.cli.cityOrCoordinates);
    return coordinateLocation(input.lat, input.lon);
  }
  if (query) {
    return resolvePlace(session, query, {
      country: input.country,
      countryFlag: true,
    });
  }
  const saved = fallback?.();
  if (saved) return saved;
  throw new UsageError(t.cli.noCity);
}
