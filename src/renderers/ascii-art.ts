import { conditionGroup } from '../core/conditions.ts';
import type { ArtRole, Paint } from './paint.ts';

/**
 * Condition pictures, 13 × 5, in plain ASCII so they draw the same
 * everywhere: symbols such as ⚡ are wide or ambiguous in many terminals and
 * would shift the columns next to them. Each picture has a mask of the same
 * shape: one letter per character naming its colour role (s sun, m moon,
 * * star, c cloud, C distant cloud, r rain, n snow and ice, l bolt, f fog; a
 * space leaves the character unstyled).
 *
 * The pictures share a few rules, checked in ascii-art.test.ts:
 * - Rain, snow and storms come from the same cloud on rows 0–2 and fall on
 *   rows 3–4, centred under it.
 * - Each kind of precipitation has its own glyph, so a picture still reads
 *   without colour: ' drizzle (and storm rain), / rain, // heavy rain,
 *   * snow, * and / freezing rain, o hail, and a /, /_, / zigzag for
 *   lightning that nothing else uses.
 * - Clear and partly cloudy skies and showers look different at night.
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
  C: 'cloudDark',
  r: 'rain',
  n: 'snow',
  l: 'bolt',
  f: 'fog',
};

/** The cloud every rain, snow and storm picture falls from. */
const CLOUD: Picture = {
  lines: ['     .--.    ', '  .-(    ).  ', ' (___.__)__) '],
  mask: ['     cccc    ', '  ccc    cc  ', ' ccccccccccc '],
};

/** Showers by day: the sun behind the cloud's left shoulder. */
const SUN_CLOUD: Picture = {
  lines: [' \\|/ .--.    ', '-( )(    ).  ', ' (___.__)__) '],
  mask: [' sss cccc    ', 'ss sc    cc  ', ' ccccccccccc '],
};

/** Showers by night: clear sky, so stars, around the cloud. */
const STAR_CLOUD: Picture = {
  lines: [' *   .--.  . ', '  .-(    ). *', ' (___.__)__) '],
  mask: [' *   cccc  * ', '  ccc    cc *', ' ccccccccccc '],
};

/** A storm cloud: the bolt breaks through its base. */
const STORM_CLOUD: Picture = {
  lines: ['     .--.    ', '  .-(    ).  ', ' (___./_)__) '],
  mask: ['     cccc    ', '  ccc    cc  ', ' ccccclccccc '],
};

/** What falls from a cloud: rows 3 and 4. */
const FALL = {
  drizzle: {
    lines: ["   '  '  '   ", "  '  '  '    "],
    mask: ['   r  r  r   ', '  r  r  r    '],
  },
  rain: {
    lines: ['   / / / /   ', '  / / / /    '],
    mask: ['   r r r r   ', '  r r r r    '],
  },
  heavyRain: {
    lines: ['   // // //  ', '  // // //   '],
    mask: ['   rr rr rr  ', '  rr rr rr   '],
  },
  freezing: {
    lines: ['   * / * /   ', '  / * / *    '],
    mask: ['   n r n r   ', '  r n r n    '],
  },
  snow: {
    lines: ['   *  *  *   ', '  *  *  *    '],
    mask: ['   n  n  n   ', '  n  n  n    '],
  },
  heavySnow: {
    lines: ['  * * * * *  ', ' * * * * *   '],
    mask: ['  n n n n n  ', ' n n n n n   '],
  },
  storm: {
    lines: ["   ' /_  '   ", "  '   /   '  "],
    mask: ['   r ll  r   ', '  r   l   r  '],
  },
  hail: {
    lines: ['   o /_  o   ', '  o   /   o  '],
    mask: ['   n ll  n   ', '  n   l   n  '],
  },
} satisfies Record<string, { lines: string[]; mask: string[] }>;

function falling(top: Picture, fall: keyof typeof FALL): Picture {
  return {
    lines: [...top.lines, ...FALL[fall].lines],
    mask: [...top.mask, ...FALL[fall].mask],
  };
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
  // A crescent: the inner arc curves less than the outer one, so it thins
  // to two horns.
  moon: {
    lines: [
      '    _..._    ',
      "  .'  .-'  * ",
      ' (   (       ',
      "  '.  '-.  . ",
      "    `---'    ",
    ],
    mask: [
      '    mmmmm    ',
      '  mm  mmm  * ',
      ' m   m       ',
      '  mm  mmm  * ',
      '    mmmmm    ',
    ],
  },
  partlyDay: {
    lines: [
      '   \\ | /     ',
      ' -  .-.  -   ',
      '   ( .--.    ',
      '  .-(    ).  ',
      ' (___.__)__) ',
    ],
    mask: [
      '   s s s     ',
      ' s  sss  s   ',
      '   s cccc    ',
      '  ccc    cc  ',
      ' ccccccccccc ',
    ],
  },
  partlyNight: {
    lines: [
      '    _..._  * ',
      "  .'  .-'    ",
      ' (   .--.  . ',
      '  .-(    ).  ',
      ' (___.__)__) ',
    ],
    mask: [
      '    mmmmm  * ',
      '  mm  mmm    ',
      ' m   cccc  * ',
      '  ccc    cc  ',
      ' ccccccccccc ',
    ],
  },
  // Overcast: more cloud than a partly cloudy sky, one bank behind another.
  cloudy: {
    lines: [
      '      .--.   ',
      '   .-(    ). ',
      '  (_.--._)__)',
      ' .-(    ).   ',
      '(___.__)__)  ',
    ],
    mask: [
      '      CCCC   ',
      '   CCC    CC ',
      '  CCccccCCCCC',
      ' ccc    cc   ',
      'ccccccccccc  ',
    ],
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
  drizzle: falling(CLOUD, 'drizzle'),
  rain: falling(CLOUD, 'rain'),
  heavyRain: falling(CLOUD, 'heavyRain'),
  showersDay: falling(SUN_CLOUD, 'rain'),
  showersNight: falling(STAR_CLOUD, 'rain'),
  sleet: falling(CLOUD, 'freezing'),
  snow: falling(CLOUD, 'snow'),
  heavySnow: falling(CLOUD, 'heavySnow'),
  snowShowersDay: falling(SUN_CLOUD, 'snow'),
  snowShowersNight: falling(STAR_CLOUD, 'snow'),
  thunder: falling(STORM_CLOUD, 'storm'),
  thunderHail: falling(STORM_CLOUD, 'hail'),
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

/** Every picture, in drawing order. */
export const PICTURE_NAMES = Object.keys(PICTURES) as PictureName[];

/**
 * The picture for a WMO weather code. Most follow the condition group;
 * showers get the sun or stars of their clear spells, and hail its pellets.
 * Heavy showers (82, 86) keep the heavy pictures: nobody sees the sun then.
 */
export function pictureFor(code: number | null, isDay: boolean): PictureName {
  if (code === 80 || code === 81) return isDay ? 'showersDay' : 'showersNight';
  if (code === 85) return isDay ? 'snowShowersDay' : 'snowShowersNight';
  if (code === 96 || code === 99) return 'thunderHail';
  switch (conditionGroup(code)) {
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
