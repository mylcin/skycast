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
const ENV = { units: 'SKYCAST_UNITS', lang: 'SKYCAST_LANG' } as const;

export interface ConfigCommand {
  readonly session: Session;
  readonly store: ConfigStore;
  readonly config: Config;
  readonly env: Readonly<Record<string, string | undefined>>;
}

interface Setting {
  readonly key: ConfigKey;
  /** What JSON shows: the value in effect, or null. */
  readonly value: unknown;
  /** Where the value comes from. */
  readonly source: 'saved' | 'env' | 'automatic' | 'unset';
  /** What people read. */
  readonly label: string;
}

function settings({ session, config, env }: ConfigCommand): Setting[] {
  const { t, render } = session;
  const described = (
    key: 'units' | 'lang',
    saved: string | undefined,
    effective: string
  ): Setting => {
    const variable = ENV[key];
    const allowed: readonly string[] = ALLOWED[key];
    if (allowed.includes(env[variable] ?? '')) {
      return {
        key,
        value: effective,
        source: 'env',
        label: t.cli.config.fromEnv(effective, variable),
      };
    }
    if (saved) return { key, value: saved, source: 'saved', label: saved };
    return {
      key,
      value: effective,
      source: 'automatic',
      label: t.cli.config.automatic(effective),
    };
  };
  return [
    config.city
      ? {
          key: 'city',
          value: locationJson(config.city),
          source: 'saved',
          label: placeLabel(config.city, t, render.symbols),
        }
      : {
          key: 'city',
          value: null,
          source: 'unset',
          label: t.cli.config.notSet,
        },
    described(
      'units',
      config.units,
      resolveUnits({ env, saved: config.units })
    ),
    described('lang', config.lang, resolveLang({ env, saved: config.lang })),
  ];
}

export function list(command: ConfigCommand): void {
  const { session } = command;
  const all = settings(command);
  if (session.json) {
    const body = Object.fromEntries(
      all.map(s => [s.key, { value: s.value, source: s.source }])
    );
    session.out(renderJson(body as never));
    return;
  }
  const width = Math.max(...all.map(s => s.key.length)) + 2;
  const lines = all.map(
    s => `${session.render.paint.dim(padEnd(s.key, width))}${s.label}`
  );
  session.out(`${lines.join('\n')}\n`);
}

export function get(command: ConfigCommand, key: ConfigKey): void {
  const setting = settings(command).find(s => s.key === key);
  if (!setting) return;
  const { session } = command;
  session.out(
    session.json
      ? renderJson({
          [key]: { value: setting.value, source: setting.source },
        } as never)
      : `${setting.label}\n`
  );
}

export async function set(
  command: ConfigCommand,
  key: ConfigKey,
  words: readonly string[],
  country?: string
): Promise<void> {
  const { session, store } = command;
  const { t } = session;
  const value = queryOf(words);
  if (key === 'city') {
    // Resolve (and maybe ask) before taking the lock on the settings file.
    const city = await resolvePlace(session, value, {
      country,
      countryFlag: true,
    });
    await store.update(config => ({ ...config, city }));
    session.out(
      session.json
        ? renderJson({ key, value: locationJson(city) })
        : `${t.cli.config.saved(key, placeLabel(city, t, session.render.symbols))}\n`
    );
    return;
  }
  const allowed: readonly string[] = ALLOWED[key];
  if (!allowed.includes(value)) {
    throw new UsageError(
      t.cli.config.invalidValue(key, value, allowed.join(', '))
    );
  }
  await store.update(config => ({ ...config, [key]: value }));
  session.out(
    session.json
      ? renderJson({ key, value })
      : `${t.cli.config.saved(key, value)}\n`
  );
}

export async function unset(
  command: ConfigCommand,
  key: ConfigKey
): Promise<void> {
  const { session, store } = command;
  await store.update(config => ({
    favorites: config.favorites,
    ...(key !== 'city' && config.city && { city: config.city }),
    ...(key !== 'units' && config.units && { units: config.units }),
    ...(key !== 'lang' && config.lang && { lang: config.lang }),
  }));
  session.out(
    session.json
      ? renderJson({ key, value: null })
      : `${session.t.cli.config.cleared(key)}\n`
  );
}
