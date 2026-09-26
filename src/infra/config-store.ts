import { readFile, rm } from 'node:fs/promises';
import * as z from 'zod';
import { ConfigError } from '../core/errors.ts';
import type { Location, UnitSystem } from '../core/models.ts';
import { isMissing, writeFileAtomic } from './fs.ts';

const location = z.object({
  name: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  region: z.string().optional(),
  country: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  timezone: z.string().optional(),
  population: z.number().optional(),
  featureCode: z.string().optional(),
  id: z.number().optional(),
});

/** config.json. Unknown keys are ignored, so older versions can read newer files. */
const schema = z.object({
  version: z.literal(1).default(1),
  city: location.optional(),
  units: z.enum(['metric', 'imperial']).optional(),
  lang: z.enum(['en', 'tr']).optional(),
  favorites: z.array(location).default([]),
});

export interface Config {
  readonly city?: Location;
  readonly units?: UnitSystem;
  readonly lang?: 'en' | 'tr';
  readonly favorites: readonly Location[];
}

export const EMPTY_CONFIG: Config = { favorites: [] };

/** Drops keys whose value is undefined (zod's optional output keeps them). */
function clean<T extends object>(
  value: T
): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  ) as { [K in keyof T]: Exclude<T[K], undefined> };
}

export interface ConfigStore {
  readonly path: string;
  /** The saved config, or defaults when there is none yet. */
  load(): Promise<Config>;
  save(config: Config): Promise<void>;
  /** Deletes the file; resolves to whether there was one. */
  remove(): Promise<boolean>;
}

export function createConfigStore(path: string): ConfigStore {
  return {
    path,
    async load() {
      let text: string;
      try {
        text = await readFile(path, 'utf8');
      } catch (error) {
        if (isMissing(error)) return EMPTY_CONFIG;
        throw new ConfigError(
          path,
          error instanceof Error ? error.message : String(error)
        );
      }
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new ConfigError(path, 'not valid JSON');
      }
      const result = schema.safeParse(body);
      if (!result.success) {
        const issue = result.error.issues[0];
        const where = issue?.path.join('.') || 'file';
        throw new ConfigError(path, `${where}: ${issue?.message ?? 'invalid'}`);
      }
      const { city, units, lang, favorites } = result.data;
      return {
        favorites: favorites.map(place => clean(place)),
        ...(city && { city: clean(city) }),
        ...(units && { units }),
        ...(lang && { lang }),
      };
    },
    async save(config) {
      const body = { version: 1, ...config };
      await writeFileAtomic(path, `${JSON.stringify(body, null, 2)}\n`);
    },
    async remove() {
      try {
        await rm(path);
        return true;
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
    },
  };
}
