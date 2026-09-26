import type { GeocodingProvider } from '../providers/types.ts';
import { LocationNotFoundError } from './errors.ts';
import {
  isCountry,
  matchesQualifier,
  normalizeName,
  rankCandidates,
  splitQuery,
  type Candidates,
} from './location.ts';
import type { Location } from './models.ts';

/** Asks the user to pick one of several places. Provided by the CLI. */
export type ChooseLocation = (
  places: readonly Location[],
  query: string
) => Promise<Location>;

export interface ResolveOptions {
  readonly language: string;
  readonly countryCode?: string;
  /** Called when the name is ambiguous. Without it the best match wins. */
  readonly choose?: ChooseLocation;
  readonly signal?: AbortSignal;
}

export interface Resolution {
  readonly location: Location;
  /**
   * `only`: one plausible match. `chosen`: the user picked it. `best`: the
   * name was ambiguous and nobody could be asked, so the best match was used.
   */
  readonly how: 'only' | 'chosen' | 'best';
  /** The other plausible places, for a "did you mean" hint. */
  readonly alternatives: readonly Location[];
}

export interface LocationService {
  resolve(query: string, options: ResolveOptions): Promise<Resolution>;
}

/** Puts places that fit the qualifier first; ambiguous unless exactly one does. */
function preferQualified(
  { places }: Candidates,
  qualifier: string
): Candidates {
  const fitting = places.filter(place => matchesQualifier(place, qualifier));
  const others = places.filter(place => !fitting.includes(place));
  return {
    places: [...fitting, ...others],
    // Nothing fits ("Paris, Tenessee"): don't guess silently.
    ambiguous: fitting.length !== 1,
  };
}

export function createLocationService(
  geocoder: GeocodingProvider
): LocationService {
  const search = (
    name: string,
    options: ResolveOptions,
    countryCode = options.countryCode,
    limit?: number
  ): Promise<Location[]> =>
    geocoder.search(
      {
        name,
        language: options.language,
        ...(countryCode && { countryCode }),
        ...(limit && { limit }),
      },
      options.signal
    );

  /**
   * The weather "in Mexico" means its capital, not the country's centroid.
   * Many capitals share the country's name (Mexico, Panama, Kuwait); for the
   * rest the country's own coordinates are the best we have.
   */
  async function settle(
    place: Location,
    options: ResolveOptions
  ): Promise<Location> {
    if (!isCountry(place) || place.name === null || !place.countryCode) {
      return place;
    }
    // Villages named "México" outrank Mexico City, so look further down.
    const nearby = await search(place.name, options, place.countryCode, 20);
    const wanted = normalizeName(place.name);
    const capital = nearby.find(
      candidate =>
        candidate.featureCode === 'PPLC' &&
        candidate.name !== null &&
        normalizeName(candidate.name).startsWith(wanted)
    );
    return capital ?? place;
  }

  return {
    async resolve(query, options) {
      const text = query.trim();
      const { name, qualifier } = splitQuery(text);
      let candidates = rankCandidates(await search(text, options), text);

      // The API understands "City, Country" itself. When it can't match the
      // qualifier ("Perth, UK", "Paris, Frnce"), it returns nothing: search
      // the bare name and apply the qualifier ourselves.
      if (candidates.places.length === 0 && qualifier) {
        const retry = rankCandidates(await search(name, options), name);
        candidates = preferQualified(retry, qualifier);
      }

      const { places, ambiguous } = candidates;
      const [best, ...others] = places;
      if (!best) {
        throw new LocationNotFoundError(
          text,
          Boolean(qualifier) || Boolean(options.countryCode)
        );
      }
      if (!ambiguous) {
        return {
          location: await settle(best, options),
          how: 'only',
          alternatives: others,
        };
      }
      if (!options.choose) {
        return {
          location: await settle(best, options),
          how: 'best',
          alternatives: others,
        };
      }
      const chosen = await options.choose(places, text);
      return {
        location: await settle(chosen, options),
        how: 'chosen',
        alternatives: places.filter(place => place !== chosen),
      };
    },
  };
}
