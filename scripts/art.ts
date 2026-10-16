/**
 * Draws every condition picture with the real renderer, next to the weather
 * codes that show it by day and by night, for reviewing the art:
 *   node scripts/art.ts [color 0-3] [en|tr]
 */
import { WMO_CODES } from '../src/core/conditions.ts';
import { getMessages } from '../src/i18n/index.ts';
import {
  ART_WIDTH,
  drawPicture,
  PICTURE_NAMES,
  pictureFor,
} from '../src/renderers/ascii-art.ts';
import { conditionText } from '../src/renderers/common.ts';
import { createPaint, type ColorLevel } from '../src/renderers/paint.ts';
import { sideBySide, wrap } from '../src/renderers/text.ts';

const [level = '3', lang = 'en'] = process.argv.slice(2);
const t = getMessages(lang === 'tr' ? 'tr' : 'en');
const paint = createPaint(
  Math.min(3, Math.max(0, Number(level))) as ColorLevel
);
const codes = [...WMO_CODES, null];

const describe = (list: readonly (number | null)[]): string =>
  list.map(code => `${code ?? '?'} ${conditionText(code, t)}`).join(', ');

const blocks = PICTURE_NAMES.map(name => {
  const day = codes.filter(code => pictureFor(code, true) === name);
  const night = codes.filter(code => pictureFor(code, false) === name);
  const same = day.join() === night.join();
  const uses = same
    ? [`day and night: ${describe(day)}`]
    : [
        ...(day.length ? [`day: ${describe(day)}`] : []),
        ...(night.length ? [`night: ${describe(night)}`] : []),
      ];
  const text = [
    paint.bold(name),
    ...uses.flatMap(use => wrap(use, 60).map(line => paint.dim(line))),
  ];
  return sideBySide(drawPicture(name, paint), text, ART_WIDTH, 3).join('\n');
});

process.stdout.write(`${blocks.join('\n\n')}\n`);
