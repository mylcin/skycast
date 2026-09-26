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
  const windows = platform === 'win32';
  const config =
    env.SKYCAST_CONFIG_DIR ??
    (env.XDG_CONFIG_HOME
      ? join(env.XDG_CONFIG_HOME, 'skycast')
      : windows
        ? join(env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'skycast')
        : join(home, '.config', 'skycast'));
  const cache =
    env.SKYCAST_CACHE_DIR ??
    (env.XDG_CACHE_HOME
      ? join(env.XDG_CACHE_HOME, 'skycast')
      : windows
        ? join(
            env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'),
            'skycast',
            'cache'
          )
        : join(home, '.cache', 'skycast'));
  return { config, cache };
}
