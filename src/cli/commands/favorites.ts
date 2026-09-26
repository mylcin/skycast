import { UsageError } from '../../core/errors.ts';
import { isSamePlace, normalizeName } from '../../core/location.ts';
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
  { session, store, config }: FavoritesCommand,
  words: readonly string[],
  country?: string
): Promise<void> {
  const { t, render } = session;
  const place = await resolvePlace(session, queryOf(words), country);
  const label = placeLabel(place, t, render.symbols);
  if (config.favorites.some(favorite => isSamePlace(favorite, place))) {
    session.out(`${t.cli.favorites.alreadyAdded(label)}\n`);
    return;
  }
  await store.save({ ...config, favorites: [...config.favorites, place] });
  session.out(`${t.cli.favorites.added(label)}\n`);
}

/** By number from `fav list`, or by name when only one favourite has it. */
export async function remove(
  { session, store, config }: FavoritesCommand,
  ref: string
): Promise<void> {
  const { t, render } = session;
  const trimmed = ref.trim();
  let index = -1;
  if (/^\d+$/.test(trimmed)) {
    index = Number(trimmed) - 1;
  } else {
    const wanted = normalizeName(trimmed);
    const matches = config.favorites
      .map((favorite, i) => ({ favorite, i }))
      .filter(
        ({ favorite }) =>
          (favorite.name !== null && normalizeName(favorite.name) === wanted) ||
          normalizeName(placeLabel(favorite, t, render.symbols)) === wanted
      );
    if (matches.length > 1)
      throw new UsageError(t.cli.favorites.ambiguous(trimmed));
    index = matches[0]?.i ?? -1;
  }
  const favorite = config.favorites[index];
  if (!favorite) throw new UsageError(t.cli.favorites.notFound(trimmed));
  await store.save({
    ...config,
    favorites: config.favorites.filter((_, i) => i !== index),
  });
  session.out(
    `${t.cli.favorites.removed(placeLabel(favorite, t, render.symbols))}\n`
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
  session.out(
    config.favorites
      .map(
        (favorite, i) =>
          `${render.paint.dim(padStart(String(i + 1), width))}  ${placeLabel(favorite, t, render.symbols)}`
      )
      .join('\n') + '\n'
  );
}
