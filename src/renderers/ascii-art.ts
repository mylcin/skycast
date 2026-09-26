import type { ConditionGroup } from '../core/conditions.ts';
import type { ArtRole, Paint } from './paint.ts';

/**
 * Condition icons, 13 × 5, in plain ASCII so they draw the same everywhere.
 * Each picture has a mask of the same shape: one letter per character naming
 * its colour role (s sun, m moon, * star, c cloud, r rain, n snow, l bolt,
 * f fog; a space leaves the character unstyled).
 */
export const ART_WIDTH = 13;

interface Picture {
  readonly lines: readonly string[];
  readonly mask: readonly string[];
}

const ROLES: Record<string, ArtRole> = {
  s: 'sun',
  m: 'moon',
  '*': 'star',
  c: 'cloud',
  r: 'rain',
  n: 'snow',
  l: 'bolt',
  f: 'fog',
};

const cloud = ['     .--.    ', '  .-(    ).  ', ' (___.__)__) '];
const cloudMask = ['     cccc    ', '  ccc    cc  ', ' ccccccccccc '];

function withCloud(below: [string, string], mask: [string, string]): Picture {
  return { lines: [...cloud, ...below], mask: [...cloudMask, ...mask] };
}

const PICTURES = {
  sun: {
    lines: [
      '    \\   /    ',
      '     .-.     ',
      '  - (   ) -  ',
      "     `-'     ",
      '    /   \\    ',
    ],
    mask: [
      '    s   s    ',
      '     sss     ',
      '  s s   s s  ',
      '     sss     ',
      '    s   s    ',
    ],
  },
  moon: {
    lines: [
      '     _..   * ',
      "   .' .'     ",
      '   |  |      ',
      "   '. '.   . ",
      "     `''     ",
    ],
    mask: [
      '     mmm   * ',
      '   mm mm     ',
      '   m  m      ',
      '   mm mm   * ',
      '     mmm     ',
    ],
  },
  partlyDay: {
    lines: [
      '  \\ | /      ',
      ' -( ).--.    ',
      '  .-(    ).  ',
      ' (___.__)__) ',
      '             ',
    ],
    mask: [
      '  s s s      ',
      ' ss scccc    ',
      '  ccc    cc  ',
      ' ccccccccccc ',
      '             ',
    ],
  },
  partlyNight: {
    lines: [
      '   _.     *  ',
      '  ( (.--.    ',
      '  .-(    ).  ',
      ' (___.__)__) ',
      '             ',
    ],
    mask: [
      '   mm     *  ',
      '  m mcccc    ',
      '  ccc    cc  ',
      ' ccccccccccc ',
      '             ',
    ],
  },
  cloudy: {
    lines: ['             ', ...cloud, '             '],
    mask: ['             ', ...cloudMask, '             '],
  },
  fog: {
    lines: [
      '             ',
      ' _ - _ - _ - ',
      '  _ - _ - _  ',
      ' _ - _ - _ - ',
      '             ',
    ],
    mask: [
      '             ',
      ' f f f f f f ',
      '  f f f f f  ',
      ' f f f f f f ',
      '             ',
    ],
  },
  drizzle: withCloud(
    ["   '  '  '   ", "  '  '  '    "],
    ['   r  r  r   ', '  r  r  r    ']
  ),
  rain: withCloud(
    ['  / / / /    ', ' / / / /     '],
    ['  r r r r    ', ' r r r r     ']
  ),
  heavyRain: withCloud(
    ['  ////////   ', ' ////////    '],
    ['  rrrrrrrr   ', ' rrrrrrrr    ']
  ),
  sleet: withCloud(
    ['  * / * /    ', ' / * / *     '],
    ['  n r n r    ', ' r n r n     ']
  ),
  snow: withCloud(
    ['   *  *  *   ', '  *  *  *    '],
    ['   n  n  n   ', '  n  n  n    ']
  ),
  heavySnow: withCloud(
    ['  * * * * *  ', ' * * * * *   '],
    ['  n n n n n  ', ' n n n n n   ']
  ),
  thunder: withCloud(
    ['  /  _/ /    ', '   / /  /    '],
    ['  r  ll r    ', '   r l  r    ']
  ),
  unknown: {
    lines: [
      '             ',
      '     .--.    ',
      '  .-(  ? ).  ',
      ' (___.__)__) ',
      '             ',
    ],
    mask: [
      '             ',
      '     cccc    ',
      '  ccc  l cc  ',
      ' ccccccccccc ',
      '             ',
    ],
  },
} satisfies Record<string, Picture>;

export type PictureName = keyof typeof PICTURES;

export function pictureFor(group: ConditionGroup, isDay: boolean): PictureName {
  switch (group) {
    case 'clear':
      return isDay ? 'sun' : 'moon';
    case 'partly-cloudy':
      return isDay ? 'partlyDay' : 'partlyNight';
    case 'cloudy':
      return 'cloudy';
    case 'fog':
      return 'fog';
    case 'drizzle':
      return 'drizzle';
    case 'rain':
      return 'rain';
    case 'heavy-rain':
      return 'heavyRain';
    case 'freezing-rain':
      return 'sleet';
    case 'snow':
      return 'snow';
    case 'heavy-snow':
      return 'heavySnow';
    case 'thunderstorm':
      return 'thunder';
    case 'unknown':
      return 'unknown';
  }
}

/** The raw pictures, for tests. */
export function rawPicture(name: PictureName): Picture {
  return PICTURES[name];
}

/** Coloured lines, each exactly ART_WIDTH columns. */
export function drawPicture(name: PictureName, paint: Paint): string[] {
  const { lines, mask } = PICTURES[name];
  return lines.map((line, row) => {
    const roles = mask[row] ?? '';
    let out = '';
    let run = '';
    let runRole: ArtRole | undefined;
    const flush = (): void => {
      out += runRole ? paint.art(runRole, run) : run;
      run = '';
    };
    for (let col = 0; col < ART_WIDTH; col++) {
      const char = line[col] ?? ' ';
      const role = ROLES[roles[col] ?? ' '];
      if (role !== runRole) {
        flush();
        runRole = role;
      }
      run += char;
    }
    flush();
    return out;
  });
}
