import { describe, expect, it } from 'vitest';
import { WMO_CODES } from '../../../src/core/conditions.ts';
import { en } from '../../../src/i18n/en.ts';
import { getMessages, isLang, LANGS } from '../../../src/i18n/index.ts';
import { tr } from '../../../src/i18n/tr.ts';

type Tree = Record<string, unknown>;

/** Every leaf: its path, and what it produces for sample arguments. */
function leaves(tree: Tree, prefix = ''): [string, unknown][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'function') {
      return [
        [path, (value as (...args: unknown[]) => unknown)('A', 'B', 'C')],
      ];
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return leaves(value as Tree, path);
    }
    return [[path, value]];
  });
}

describe('dictionaries', () => {
  const english = new Map(leaves(en as unknown as Tree));
  const turkish = new Map(leaves(tr as unknown as Tree));

  it('have exactly the same keys', () => {
    expect([...turkish.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('produce text for every message', () => {
    for (const [path, value] of [...english, ...turkish]) {
      if (Array.isArray(value)) {
        expect(value.length, path).toBeGreaterThan(0);
      } else {
        expect(typeof value, path).toBe('string');
        expect((value as string).length, path).toBeGreaterThan(0);
      }
    }
  });

  it('use their arguments', () => {
    for (const [path, value] of english) {
      const message = path
        .split('.')
        .reduce<unknown>((node, key) => (node as Tree)[key], en);
      if (
        typeof message === 'function' &&
        message.length > 0 &&
        typeof value === 'string'
      ) {
        expect(value, path).toMatch(/A|1/);
      }
    }
  });

  it('name every weather code, weekday and month', () => {
    for (const messages of [en, tr]) {
      expect(
        Object.keys(messages.conditions)
          .map(Number)
          .sort((a, b) => a - b)
      ).toEqual([...WMO_CODES]);
      expect(messages.weekdays).toHaveLength(7);
      expect(messages.months).toHaveLength(12);
      expect(messages.compass).toHaveLength(8);
    }
  });

  it('keep plurals right', () => {
    expect(en.cli.minutesAgo(1)).toBe('1 minute ago');
    expect(en.cli.minutesAgo(5)).toBe('5 minutes ago');
    expect(en.cli.hoursAgo(1)).toBe('1 hour ago');
    expect(en.cli.cacheCleared(1)).toBe('Removed 1 cached response.');
    expect(tr.cli.minutesAgo(1)).toBe('1 dakika önce');
    expect(en.forecast.title(1)).toBe('Today');
    expect(tr.forecast.title(7)).toBe('7 günlük tahmin');
  });

  it('are looked up by language', () => {
    expect(LANGS).toEqual(['en', 'tr']);
    expect(getMessages('tr')).toBe(tr);
    expect(isLang('tr')).toBe(true);
    expect(isLang('de')).toBe(false);
  });
});
