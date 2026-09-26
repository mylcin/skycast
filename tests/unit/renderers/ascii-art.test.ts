import { describe, expect, it } from 'vitest';
import type { ConditionGroup } from '../../../src/core/conditions.ts';
import {
  ART_WIDTH,
  drawPicture,
  pictureFor,
  rawPicture,
  type PictureName,
} from '../../../src/renderers/ascii-art.ts';
import { createPaint } from '../../../src/renderers/paint.ts';
import { visibleWidth } from '../../../src/renderers/text.ts';

const groups: ConditionGroup[] = [
  'clear',
  'partly-cloudy',
  'cloudy',
  'fog',
  'drizzle',
  'rain',
  'heavy-rain',
  'freezing-rain',
  'snow',
  'heavy-snow',
  'thunderstorm',
  'unknown',
];
const names = [
  ...new Set(groups.flatMap(g => [pictureFor(g, true), pictureFor(g, false)])),
];

describe('pictures', () => {
  it('has a day and night picture for clear and partly cloudy skies', () => {
    expect(pictureFor('clear', true)).toBe('sun');
    expect(pictureFor('clear', false)).toBe('moon');
    expect(pictureFor('partly-cloudy', false)).toBe('partlyNight');
    expect(pictureFor('rain', false)).toBe('rain');
  });

  it.each(names)(
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

  it('draws the raw picture without colour, and keeps widths with colour', () => {
    expect(drawPicture('sun', createPaint(0))).toEqual(rawPicture('sun').lines);
    const coloured = drawPicture('thunder', createPaint(3));
    expect(coloured.join('')).toContain('\u001b[');
    expect(coloured.map(visibleWidth)).toEqual([13, 13, 13, 13, 13]);
  });
});
