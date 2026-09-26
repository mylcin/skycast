import { readFile, rename } from 'node:fs/promises';
import * as z from 'zod';
import { ConfigError, StorageError } from '../core/errors.ts';
import type { Location, UnitSystem } from '../core/models.ts';
import { errorCode, isMissing, withFileLock, writeFileAtomic } from './fs.ts';

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

/** config.json fields. Unknown keys are ignored, so older versions can read newer files. */
const fields = {
  city: location,
  units: z.enum(['metric', 'imperial']),
  lang: z.enum(['en', 'tr']),
} as const;

export interface Config {
  readonly city?: Location;
  readonly units?: UnitSystem;
  readonly lang?: 'en' | 'tr';
  readonly favorites: readonly Location[];
}

export const EMPTY_CONFIG: Config = { favorites: [] };

/** Drops keys whose value is undefined (zod's optional output keeps them). */
function clean(place: z.infer<typeof location>): Location {
  return Object.fromEntries(
    Object.entries(place).filter(([, v]) => v !== undefined)
  ) as unknown as Location;
}

export interface Salvaged {
  readonly config: Config;
  /** Keys (or `favorites.N`) that did not validate and were left out. */
  readonly dropped: readonly string[];
}

export interface ResetResult {
  /** Favourites kept from the old file. */
  readonly favorites: number;
  /** Where an old file that wasn't JSON was moved, if it was. */
  readonly backup?: string;
}

export interface ConfigStore {
  readonly path: string;
  /** The saved config, or defaults when there is none. Any invalid value is an error. */
  load(): Promise<Config>;
  /** Everything that still validates, for commands that repair the file. */
  salvage(): Promise<Salvaged>;
  /** Changes the config under a lock, starting from what is on disk now. */
  update(change: (config: Config) => Config): Promise<Config>;
  /** Clears the settings but keeps favourites; a file that isn't JSON is backed up. */
  reset(): Promise<ResetResult>;
}

export function createConfigStore(path: string): ConfigStore {
  async function read(): Promise<unknown> {
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if (isMissing(error)) return undefined;
      const code = errorCode(error) ?? 'EIO';
      const problem = code === 'EISDIR' ? 'not-a-file' : 'unreadable';
      throw new ConfigError(path, problem, code, { cause: error });
    }
    try {
      // Windows editors like to add a byte order mark.
      return JSON.parse(text.replace(/^\uFEFF/, '')) as unknown;
    } catch (error) {
      throw new ConfigError(path, 'invalid-json', '', { cause: error });
    }
  }

  function parse(body: unknown, strict: boolean): Salvaged {
    if (body === undefined) return { config: EMPTY_CONFIG, dropped: [] };
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      if (strict) throw new ConfigError(path, 'invalid-value', 'file');
      return { config: EMPTY_CONFIG, dropped: ['file'] };
    }
    const raw = body as Record<string, unknown>;
    const dropped: string[] = [];
    let city: Location | undefined;
    let units: UnitSystem | undefined;
    let lang: 'en' | 'tr' | undefined;
    const invalid = (key: string): void => {
      if (strict) throw new ConfigError(path, 'invalid-value', key);
      dropped.push(key);
    };

    if (raw.city !== undefined) {
      const result = fields.city.safeParse(raw.city);
      if (result.success) city = clean(result.data);
      else invalid('city');
    }
    if (raw.units !== undefined) {
      const result = fields.units.safeParse(raw.units);
      if (result.success) units = result.data;
      else invalid('units');
    }
    if (raw.lang !== undefined) {
      const result = fields.lang.safeParse(raw.lang);
      if (result.success) lang = result.data;
      else invalid('lang');
    }

    let favorites: Location[] = [];
    const list = raw.favorites ?? [];
    if (Array.isArray(list)) {
      favorites = list.flatMap((entry: unknown, index): Location[] => {
        const result = location.safeParse(entry);
        if (result.success) return [clean(result.data)];
        invalid(`favorites.${index}`);
        return [];
      });
    } else {
      invalid('favorites');
    }

    return {
      config: {
        favorites,
        ...(city && { city }),
        ...(units && { units }),
        ...(lang && { lang }),
      },
      dropped,
    };
  }

  const save = (config: Config): Promise<void> =>
    writeFileAtomic(
      path,
      `${JSON.stringify({ version: 1, ...config }, null, 2)}\n`
    );

  return {
    path,
    async load() {
      return parse(await read(), true).config;
    },
    async salvage() {
      return parse(await read(), false);
    },
    update(change) {
      return withFileLock(path, async () => {
        const next = change(parse(await read(), false).config);
        await save(next);
        return next;
      });
    },
    reset() {
      return withFileLock(path, async () => {
        let favorites: readonly Location[];
        try {
          favorites = parse(await read(), false).config.favorites;
        } catch (error) {
          if (
            !(error instanceof ConfigError) ||
            error.problem !== 'invalid-json'
          ) {
            throw error;
          }
          // Not JSON at all: keep it next to the new file rather than delete it.
          const backup = `${path}.bak`;
          try {
            await rename(path, backup);
          } catch (cause) {
            throw new StorageError(path, errorCode(cause) ?? 'EIO', { cause });
          }
          await save(EMPTY_CONFIG);
          return { favorites: 0, backup };
        }
        await save({ favorites });
        return { favorites: favorites.length };
      });
    },
  };
}
