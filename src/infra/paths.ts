import { posix, win32 } from 'node:path';

export interface Paths {
  /** Directory holding config.json. */
  readonly config: string;
  /** Directory for cached API responses. */
  readonly cache: string;
}

/**
 * Where settings and cache live. XDG variables are honoured on every OS
 * (people who set them expect it); otherwise ~/.config and ~/.cache on
 * Linux and macOS, %APPDATA% and %LOCALAPPDATA% on Windows.
 * SKYCAST_CONFIG_DIR and SKYCAST_CACHE_DIR override everything.
 */
export function resolvePaths(
  env: Readonly<Record<string, string | undefined>>,
  platform: string,
  home: string
): Paths {
  const path = platform === 'win32' ? win32 : posix;
  const join = (...parts: string[]): string => path.join(...parts);
  // An empty or relative value would scatter settings into whatever folder
  // skycast happens to run in, so only absolute paths count.
  const dir = (value: string | undefined): string | undefined =>
    value && path.isAbsolute(value) ? value : undefined;
  const windows = platform === 'win32';
  const xdgConfig = dir(env.XDG_CONFIG_HOME);
  const xdgCache = dir(env.XDG_CACHE_HOME);
  const config =
    dir(env.SKYCAST_CONFIG_DIR) ??
    (xdgConfig
      ? join(xdgConfig, 'skycast')
      : windows
        ? join(dir(env.APPDATA) ?? join(home, 'AppData', 'Roaming'), 'skycast')
        : join(home, '.config', 'skycast'));
  const cache =
    dir(env.SKYCAST_CACHE_DIR) ??
    (xdgCache
      ? join(xdgCache, 'skycast')
      : windows
        ? join(
            dir(env.LOCALAPPDATA) ?? join(home, 'AppData', 'Local'),
            'skycast',
            'cache'
          )
        : join(home, '.cache', 'skycast'));
  return { config, cache };
}
