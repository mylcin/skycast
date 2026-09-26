import { UsageError } from '../../core/errors.ts';
import {
  isSamePlace,
  matchesQualifier,
  normalizeName,
  splitQuery,
} from '../../core/location.ts';
import type { Location } from '../../core/models.ts';
import type { Config, ConfigStore } from '../../infra/config-store.ts';
import { locationJson, renderJson } from '../../renderers/json.ts';
import { placeLabel } from '../../renderers/place.ts';
import { padStart } from '../../renderers/text.ts';
import { queryOf, resolvePlace } from '../locate.ts';
import type { Session } from '../session.ts';

export interface FavoritesCommand {
  readonly session: Session;
  readonly store: ConfigStore;
  readonly config: Config;
}

export async function add(
  { session, store }: FavoritesCommand,
  words: readonly string[],
  country?: string
): Promise<void> {
  const { t, render } = session;
  // Resolve (and maybe ask) first; the settings file is locked only to write.
  const place = await resolvePlace(session, queryOf(words), {
    country,
    countryFlag: true,
  });
  // Decided inside the locked update, against the file as it is now.
  const outcome = { added: false };
  await store.update(config => {
    if (config.favorites.some(favorite => isSamePlace(favorite, place)))
      return config;
    outcome.added = true;
    return { ...config, favorites: [...config.favorites, place] };
  });
  const label = placeLabel(place, t, render.symbols);
  if (session.json) {
    session.out(
      renderJson({ added: outcome.added, favorite: locationJson(place) })
    );
    return;
  }
  session.out(
    `${outcome.added ? t.cli.favorites.added(label) : t.cli.favorites.alreadyAdded(label)}\n`
  );
}

/**
 * Finds a favourite by its number in `fav list`, by name ("Paris", "paris,
 * france") or by its full label.
 */
function find(
  favorites: readonly Location[],
  ref: string,
  session: Session
): number {
  const { t, render } = session;
  if (/^\d+$/.test(ref)) {
    const index = Number(ref) - 1;
    return index < favorites.length ? index : -1;
  }
  const { name, qualifier } = splitQuery(ref);
  const wanted = normalizeName(name);
  const full = normalizeName(ref);
  const matches = favorites
    .map((favorite, index) => ({ favorite, index }))
    .filter(
      ({ favorite }) =>
        normalizeName(placeLabel(favorite, t, render.symbols)) === full ||
        (favorite.name !== null &&
          normalizeName(favorite.name) === wanted &&
          (!qualifier || matchesQualifier(favorite, qualifier)))
    );
  if (matches.length > 1) throw new UsageError(t.cli.favorites.ambiguous(ref));
  return matches[0]?.index ?? -1;
}

export async function remove(
  { session, store }: FavoritesCommand,
  ref: string
): Promise<void> {
  const { t, render } = session;
  const trimmed = ref.trim();
  let removed: Location | undefined;
  await store.update(config => {
    const index = find(config.favorites, trimmed, session);
    removed = config.favorites[index];
    if (!removed) throw new UsageError(t.cli.favorites.notFound(trimmed));
    return {
      ...config,
      favorites: config.favorites.filter((_, i) => i !== index),
    };
  });
  if (!removed) return;
  session.out(
    session.json
      ? renderJson({ removed: locationJson(removed) })
      : `${t.cli.favorites.removed(placeLabel(removed, t, render.symbols))}\n`
  );
}

export function list({ session, config }: FavoritesCommand): void {
  const { t, render } = session;
  if (session.json) {
    session.out(renderJson({ favorites: config.favorites.map(locationJson) }));
    return;
  }
  if (config.favorites.length === 0) {
    session.out(`${t.cli.favorites.empty}\n`);
    return;
  }
  const width = String(config.favorites.length).length;
  const lines = config.favorites.map(
    (favorite, i) =>
      `${render.paint.dim(padStart(String(i + 1), width))}  ${placeLabel(favorite, t, render.symbols)}`
  );
  session.out(`${lines.join('\n')}\n`);
}
