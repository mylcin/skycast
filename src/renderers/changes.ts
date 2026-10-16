import { nextChanges, type Change } from '../core/changes.ts';
import type { WeatherReport } from '../core/models.ts';
import { localToday } from './common.ts';
import type { Messages } from '../i18n/index.ts';
import type { RenderContext } from './context.ts';
import {
  formatPercent,
  formatSpeed,
  formatTemperature,
  formatTime,
} from './format.ts';
import type { Symbols } from './symbols.ts';
import { fitLine, wrap } from './text.ts';

/** A change as a sentence in the UI language. */
export function describeChange(
  change: Change,
  report: WeatherReport,
  t: Messages,
  symbols: Symbols
): string {
  const c = t.changes;
  const units = report.units;
  const today = localToday(report);
  const when = (time: string): string =>
    time.slice(0, 10) > today
      ? c.tomorrowAt(formatTime(time))
      : formatTime(time);
  switch (change.kind) {
    case 'precipitation-starts':
      return c.likely(
        c.precipitation[change.precipitation],
        when(change.time),
        formatPercent(change.probability, t)
      );
    case 'precipitation-eases':
      return c.easing(
        c.precipitation[change.precipitation],
        when(change.time),
        formatPercent(change.probability, t)
      );
    case 'gusts':
      return c.gusts(formatSpeed(change.speed, units, t), when(change.time));
    case 'temperature': {
      // The degrees people see: the highs are shown rounded.
      const difference = Math.round(change.high) - Math.round(change.previous);
      const high = formatTemperature(change.high, units, symbols);
      const signed = `${difference > 0 ? '+' : ''}${difference}${symbols.degree}`;
      return difference > 0 ? c.warmer(high, signed) : c.colder(high, signed);
    }
  }
}

/** One sentence per change, most useful first. */
export function changeTexts(
  report: WeatherReport,
  ctx: RenderContext
): string[] {
  return nextChanges(report, report.units).map(change =>
    describeChange(change, report, ctx.t, ctx.symbols)
  );
}

/**
 * What changes next, on one line of `width` columns: as many changes as
 * fit, the first always. A first change wider than the line wraps.
 */
export function renderChanges(
  report: WeatherReport,
  ctx: RenderContext,
  width: number
): string[] {
  const texts = changeTexts(report, ctx);
  if (texts.length === 0) return [];
  const separator = ` ${ctx.symbols.separator} `;
  return wrap(fitLine(texts, separator, width), width).map(line =>
    line.split(separator).join(ctx.paint.dim(separator))
  );
}
