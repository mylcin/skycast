import { describe, expect, it } from 'vitest';
import { WMO_CODES } from '../../../src/core/conditions.ts';
import {
  ART_WIDTH,
  drawPicture,
  PICTURE_NAMES,
  pictureFor,
  rawPicture,
  type PictureName,
} from '../../../src/renderers/ascii-art.ts';
import { createPaint } from '../../../src/renderers/paint.ts';
import { visibleWidth } from '../../../src/renderers/text.ts';

/** Every picture a weather code, by day or night, can show. */
const used = [
  ...new Set(
    [...WMO_CODES, null, 42].flatMap(code => [
      pictureFor(code, true),
      pictureFor(code, false),
    ])
  ),
];

/** Pictures with rain, snow or a storm under the shared cloud. */
const falling = PICTURE_NAMES.filter(name =>
  /[rnl]/.test(rawPicture(name).mask.slice(3).join(''))
);

/** The characters of a picture with a given colour role. */
function cells(name: PictureName, role: string, rows = [0, 1, 2, 3, 4]) {
  const { lines, mask } = rawPicture(name);
  return rows.flatMap(row =>
    (mask[row] ?? '')
      .split('')
      .flatMap((r, col) =>
        r === role ? [{ row, col, char: lines[row]?.[col] ?? '' }] : []
      )
  );
}

describe('pictures', () => {
  it.each(PICTURE_NAMES)(
    '%s is 13 × 5 plain ASCII with a matching mask',
    (name: PictureName) => {
      const { lines, mask } = rawPicture(name);
      expect(lines).toHaveLength(5);
      expect(mask).toHaveLength(5);
      lines.forEach((line, row) => {
        expect(line).toHaveLength(ART_WIDTH);
        expect(line).toMatch(/^[\x20-\x7e]*$/);
        const roles = mask[row]!;
        expect(roles).toHaveLength(ART_WIDTH);
        line.split('').forEach((char, col) => {
          // Every visible character has a colour role, and nothing else does.
          expect(char === ' ', `${name} row ${row} col ${col}`).toBe(
            roles[col] === ' '
          );
        });
      });
    }
  );

  it('draws every picture some weather code uses, and nothing else', () => {
    expect([...used].sort()).toEqual([...PICTURE_NAMES].sort());
  });

  it('draws the raw picture without colour, and keeps widths with colour', () => {
    expect(drawPicture('sun', createPaint(0))).toEqual(rawPicture('sun').lines);
    const coloured = drawPicture('cloudy', createPaint(3));
    expect(coloured.join('')).toContain('\u001b[');
    expect(coloured.map(visibleWidth)).toEqual([13, 13, 13, 13, 13]);
  });
});

describe('choosing a picture', () => {
  it('follows the condition group', () => {
    expect(pictureFor(0, true)).toBe('sun');
    expect(pictureFor(3, true)).toBe('cloudy');
    expect(pictureFor(45, false)).toBe('fog');
    expect(pictureFor(63, false)).toBe('rain');
    expect(pictureFor(67, true)).toBe('sleet');
    expect(pictureFor(75, true)).toBe('heavySnow');
    expect(pictureFor(95, true)).toBe('thunder');
    expect(pictureFor(null, true)).toBe('unknown');
    expect(pictureFor(42, true)).toBe('unknown');
  });

  it('changes by night where the sky shows', () => {
    for (const code of [0, 1, 2, 80, 81, 85]) {
      expect(pictureFor(code, true), `code ${code}`).not.toBe(
        pictureFor(code, false)
      );
    }
    // Overcast, steady rain and fog hide the sky, by night too.
    for (const code of [3, 45, 63, 65, 73, 95]) {
      expect(pictureFor(code, true), `code ${code}`).toBe(
        pictureFor(code, false)
      );
    }
  });

  it('gives showers their clear spells, and hail its pellets', () => {
    expect(pictureFor(80, true)).toBe('showersDay');
    expect(pictureFor(81, false)).toBe('showersNight');
    expect(pictureFor(85, true)).toBe('snowShowersDay');
    // Heavy showers hide the sun.
    expect(pictureFor(82, true)).toBe('heavyRain');
    expect(pictureFor(86, true)).toBe('heavySnow');
    expect(pictureFor(96, true)).toBe('thunderHail');
    expect(pictureFor(99, false)).toBe('thunderHail');
    expect(rawPicture('thunderHail').lines.slice(3).join('')).toContain('o');
  });
});

describe('visual rules', () => {
  it.each(falling)('%s falls centred under its cloud', name => {
    const ink = rawPicture(name)
      .lines.slice(3)
      .flatMap(line =>
        line.split('').flatMap((char, col) => (char === ' ' ? [] : [col]))
      );
    const centre = ink.reduce((sum, col) => sum + col, 0) / ink.length;
    // The cloud's centre is column 6; slanted rain leans half a column left.
    expect(Math.abs(centre - 6)).toBeLessThanOrEqual(0.5);
  });

  it.each(['thunder', 'thunderHail'] as const)(
    '%s has a connected zigzag bolt, drawn with glyphs its rain never uses',
    name => {
      const bolt = cells(name, 'l');
      expect(bolt.map(({ char }) => char).join('')).toBe('//_/');
      // Each "/" ends where the next stroke starts: one column left, one row down.
      const slashes = bolt.filter(({ char }) => char === '/');
      expect(slashes.map(({ row, col }) => [row, col])).toEqual([
        [2, 6],
        [3, 5],
        [4, 6],
      ]);
      const rain = [...cells(name, 'r'), ...cells(name, 'n')];
      expect(rain.length).toBeGreaterThan(0);
      expect(rain.some(({ char }) => char === '/' || char === '_')).toBe(false);
    }
  );

  it('tells rain apart from storms, and light from heavy, without colour', () => {
    const below = (name: PictureName) =>
      rawPicture(name).lines.slice(3).join('\n');
    const pictures = [
      'drizzle',
      'rain',
      'heavyRain',
      'sleet',
      'snow',
      'heavySnow',
      'thunder',
      'thunderHail',
    ] as const;
    expect(new Set(pictures.map(below)).size).toBe(pictures.length);
    const ink = (name: PictureName) => below(name).replace(/\s/g, '').length;
    expect(ink('heavyRain')).toBeGreaterThan(ink('rain'));
    expect(ink('rain')).toBeGreaterThan(ink('drizzle'));
    expect(ink('heavySnow')).toBeGreaterThan(ink('snow'));
  });

  it('puts every precipitating picture under the same cloud', () => {
    // The hump and the base sit in the same columns; only the storm's base
    // lets the bolt through.
    for (const name of falling) {
      const { lines } = rawPicture(name);
      expect(lines[0]?.slice(5, 9), name).toBe('.--.');
      expect(lines[2], name).toMatch(/^ \(___\.(__|\/_)\)__\) $/);
    }
  });
});
