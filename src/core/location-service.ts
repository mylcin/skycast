import type { GeocodingProvider } from '../providers/types.ts';
import { LocationNotFoundError } from './errors.ts';
import { rankCandidates, splitQuery } from './location.ts';
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

export function createLocationService(
  geocoder: GeocodingProvider
): LocationService {
  return {
    async resolve(query, options) {
      const text = query.trim();
      const results = await geocoder.search(
        {
          name: text,
          language: options.language,
          ...(options.countryCode && { countryCode: options.countryCode }),
        },
        options.signal
      );
      let { places, ambiguous } = rankCandidates(results, text);

      // "Paris, Frnce": a qualifier the API can't match returns nothing, so
      // try the bare name before giving up.
      const { name, qualifier } = splitQuery(text);
      if (places.length === 0 && qualifier) {
        const retry = await geocoder.search(
          {
            name,
            language: options.language,
            ...(options.countryCode && { countryCode: options.countryCode }),
          },
          options.signal
        );
        ({ places, ambiguous } = rankCandidates(retry, name));
      }

      const [best, ...others] = places;
      if (!best) throw new LocationNotFoundError(text);
      if (!ambiguous)
        return { location: best, how: 'only', alternatives: others };
      if (!options.choose)
        return { location: best, how: 'best', alternatives: others };
      const location = await options.choose(places, text);
      return {
        location,
        how: 'chosen',
        alternatives: places.filter(place => place !== location),
      };
    },
  };
}
