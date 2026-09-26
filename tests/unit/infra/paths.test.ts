import { describe, expect, it } from 'vitest';
import { resolvePaths } from '../../../src/infra/paths.ts';

describe('resolvePaths', () => {
  it('uses ~/.config and ~/.cache on Linux and macOS', () => {
    for (const platform of ['linux', 'darwin']) {
      expect(resolvePaths({}, platform, '/home/ada')).toEqual({
        config: '/home/ada/.config/skycast',
        cache: '/home/ada/.cache/skycast',
      });
    }
  });

  it('honours XDG variables everywhere', () => {
    const env = { XDG_CONFIG_HOME: '/x/config', XDG_CACHE_HOME: '/x/cache' };
    expect(resolvePaths(env, 'darwin', '/Users/ada')).toEqual({
      config: '/x/config/skycast',
      cache: '/x/cache/skycast',
    });
  });

  it('uses APPDATA and LOCALAPPDATA on Windows', () => {
    const env = {
      APPDATA: 'C:\\Users\\Ada\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\Ada\\AppData\\Local',
    };
    expect(resolvePaths(env, 'win32', 'C:\\Users\\Ada')).toEqual({
      config: 'C:\\Users\\Ada\\AppData\\Roaming\\skycast',
      cache: 'C:\\Users\\Ada\\AppData\\Local\\skycast\\cache',
    });
    expect(resolvePaths({}, 'win32', 'C:\\Users\\Ada').config).toBe(
      'C:\\Users\\Ada\\AppData\\Roaming\\skycast'
    );
  });

  it('lets SKYCAST_* variables override everything', () => {
    const env = {
      SKYCAST_CONFIG_DIR: '/a',
      SKYCAST_CACHE_DIR: '/b',
      XDG_CONFIG_HOME: '/x',
    };
    expect(resolvePaths(env, 'linux', '/home/ada')).toEqual({
      config: '/a',
      cache: '/b',
    });
  });

  it('ignores empty and relative values', () => {
    expect(
      resolvePaths(
        { SKYCAST_CONFIG_DIR: '', XDG_CONFIG_HOME: 'relative/dir' },
        'linux',
        '/home/ada'
      ).config
    ).toBe('/home/ada/.config/skycast');
    expect(
      resolvePaths({ APPDATA: '', LOCALAPPDATA: '' }, 'win32', 'C:\\Users\\Ada')
    ).toEqual({
      config: 'C:\\Users\\Ada\\AppData\\Roaming\\skycast',
      cache: 'C:\\Users\\Ada\\AppData\\Local\\skycast\\cache',
    });
  });
});
