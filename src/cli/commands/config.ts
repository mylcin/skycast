import { UsageError } from '../../core/errors.ts';
import type { Config, ConfigStore } from '../../infra/config-store.ts';
import { locationJson, renderJson } from '../../renderers/json.ts';
import { placeLabel } from '../../renderers/place.ts';
import { padEnd } from '../../renderers/text.ts';
import { queryOf, resolvePlace } from '../locate.ts';
import type { Session } from '../session.ts';
import { resolveLang, resolveUnits } from '../settings.ts';

export const CONFIG_KEYS = ['city', 'units', 'lang'] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

const ALLOWED = { units: ['metric', 'imperial'], lang: ['en', 'tr'] } as const;

export interface ConfigCommand {
  readonly session: Session;
  readonly store: ConfigStore;
  readonly config: Config;
  readonly env: Readonly<Record<string, string | undefined>>;
}

interface Setting {
  readonly key: ConfigKey;
  /** What JSON output shows: the saved value, or null. */
  readonly saved: unknown;
  /** What people read. */
  readonly label: string;
}

function settings({ session, config, env }: ConfigCommand): Setting[] {
  const { t, render } = session;
  const automatic = (value: string): string => t.cli.config.automatic(value);
  return [
    {
      key: 'city',
      saved: config.city ? locationJson(config.city) : null,
      label: config.city
        ? placeLabel(config.city, t, render.symbols)
        : t.cli.config.notSet,
    },
    {
      key: 'units',
      saved: config.units ?? null,
      label: config.units ?? automatic(resolveUnits({ env })),
    },
    {
      key: 'lang',
      saved: config.lang ?? null,
      label: config.lang ?? automatic(resolveLang({ env })),
    },
  ];
}

export function list(command: ConfigCommand): void {
  const { session } = command;
  const all = settings(command);
  if (session.json) {
    session.out(
      renderJson(Object.fromEntries(all.map(s => [s.key, s.saved])) as never)
    );
    return;
  }
  const width = Math.max(...all.map(s => s.key.length)) + 2;
  session.out(
    all
      .map(s => `${session.render.paint.dim(padEnd(s.key, width))}${s.label}`)
      .join('\n') + '\n'
  );
}

export function get(command: ConfigCommand, key: ConfigKey): void {
  const setting = settings(command).find(s => s.key === key);
  if (!setting) return;
  command.session.out(
    command.session.json
      ? renderJson({ [key]: setting.saved } as never)
      : `${setting.label}\n`
  );
}

export async function set(
  command: ConfigCommand,
  key: ConfigKey,
  words: readonly string[]
): Promise<void> {
  const { session, store, config } = command;
  const { t } = session;
  const value = queryOf(words);
  if (key === 'city') {
    const city = await resolvePlace(session, value);
    await store.save({ ...config, city });
    session.out(
      `${t.cli.config.saved(key, placeLabel(city, t, session.render.symbols))}\n`
    );
    return;
  }
  const allowed: readonly string[] = ALLOWED[key];
  if (!allowed.includes(value)) {
    throw new UsageError(
      t.cli.config.invalidValue(key, value, allowed.join(', '))
    );
  }
  await store.save({ ...config, [key]: value });
  session.out(`${t.cli.config.saved(key, value)}\n`);
}

export async function unset(
  command: ConfigCommand,
  key: ConfigKey
): Promise<void> {
  const { session, store, config } = command;
  await store.save({
    favorites: config.favorites,
    ...(key !== 'city' && config.city && { city: config.city }),
    ...(key !== 'units' && config.units && { units: config.units }),
    ...(key !== 'lang' && config.lang && { lang: config.lang }),
  });
  session.out(`${session.t.cli.config.cleared(key)}\n`);
}
