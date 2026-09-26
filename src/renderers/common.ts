import { conditionGroup, isWmoCode } from '../core/conditions.ts';
import type { Attribution, WeatherReport } from '../core/models.ts';
import type { Messages } from '../i18n/index.ts';
import type { RenderContext } from './context.ts';
import { formatCoordinates, formatDate, formatTime } from './format.ts';
import { placeTitle } from './place.ts';
import { joinFitting, wrap } from './text.ts';

export function conditionText(code: number | null, t: Messages): string {
  return code !== null && isWmoCode(code)
    ? t.conditions[code]
    : t.unknownCondition;
}

export { conditionGroup };

/** The location's "today", from the current time or the first forecast day. */
export function localToday(report: WeatherReport): string {
  return report.current?.time.slice(0, 10) ?? report.daily[0]?.date ?? '';
}

/** Bold place name, then a dim line with region, coordinates and local time. */
export function header(
  report: WeatherReport,
  ctx: RenderContext,
  subtitle?: string
): string[] {
  const { t, paint, symbols } = ctx;
  const { location } = report;
  const title = paint.bold(placeTitle(location, t, symbols));
  const details = [
    location.name !== null &&
    location.region &&
    location.region !== location.name
      ? location.region
      : null,
    location.name !== null
      ? formatCoordinates(location.latitude, location.longitude, t, symbols)
      : null,
    report.current
      ? `${formatDate(report.current.time.slice(0, 10), t)} ${formatTime(report.current.time)}`
      : null,
    subtitle ?? null,
  ].filter((part): part is string => part !== null);
  return [
    title,
    ...joinFitting(details, ` ${symbols.separator} `, ctx.width).map(line =>
      paint.dim(line)
    ),
  ];
}

function credit({ text, url }: Attribution): string {
  const host = new URL(url).host.replace(/^www\./, '');
  return text.toLowerCase().includes(host.toLowerCase())
    ? text
    : `${text} (${host})`;
}

/**
 * Data credits, required by the CC BY licence: who, where, and the licence
 * (said once when every source shares it). Dim and wrapped.
 */
export function footer(
  attribution: readonly Attribution[],
  ctx: RenderContext
): string[] {
  const unique = attribution.filter(
    (a, i) => attribution.findIndex(b => b.text === a.text) === i
  );
  const licenses = [...new Set(unique.map(a => a.license))];
  const [shared] = licenses;
  const parts =
    licenses.length === 1 && shared
      ? [...unique.map(credit), shared]
      : unique.map(a => (a.license ? `${credit(a)}, ${a.license}` : credit(a)));
  return wrap(
    parts.join(` ${ctx.symbols.separator} `),
    Math.max(20, ctx.width)
  ).map(line => ctx.paint.dim(line));
}
