import type { DailyForecast, WeatherReport } from '../core/models.ts';
import { conditionText, footer, header, localToday } from './common.ts';
import type { RenderContext } from './context.ts';
import {
  formatDay,
  formatPercent,
  formatPrecipitation,
  formatTemperature,
  formatWind,
} from './format.ts';
import { renderTable, type Column } from './table.ts';

/**
 * A bar spanning the day's low to high on a scale shared by every day, so
 * warmer and cooler days stand out at a glance.
 */
function rangeBar(
  day: DailyForecast,
  scale: { min: number; max: number; width: number },
  ctx: RenderContext,
  units: WeatherReport['units']
): { text: string; style: (text: string) => string } {
  const { width, min, max } = scale;
  const span = max - min || 1;
  const from = Math.round(((day.temperatureMin - min) / span) * (width - 1));
  const to = Math.max(
    from,
    Math.round(((day.temperatureMax - min) / span) * (width - 1))
  );
  const { barFill, barTrack } = ctx.symbols;
  const chars = Array.from({ length: width }, (_, i) =>
    i >= from && i <= to ? barFill : barTrack
  );
  const style = (): string =>
    chars
      .map((char, i) => {
        if (char === barTrack) return ctx.paint.dim(char);
        // Colour each step by the temperature it stands for.
        const value = min + (i / Math.max(1, width - 1)) * span;
        const rgbText = ctx.paint.temperature(value, units, char);
        return ctx.paint.level === 0 ? char : rgbText;
      })
      .join('');
  return { text: chars.join(''), style };
}

export interface ForecastOptions {
  /** The table alone: no heading, no credits. */
  readonly compact?: boolean;
}

/** The `forecast` view: one row per day. */
export function renderForecast(
  report: WeatherReport,
  ctx: RenderContext,
  options: ForecastOptions = {}
): string {
  const { t, paint, symbols } = ctx;
  const units = report.units;
  const days = report.daily;
  const today = localToday(report);
  if (days.length === 0) {
    return (
      [
        ...header(report, ctx),
        '',
        paint.dim(t.weather.noData),
        '',
        ...footer(report.attribution, ctx),
      ].join('\n') + '\n'
    );
  }
  const temp = (
    value: number
  ): { text: string; style: (s: string) => string } => ({
    text: formatTemperature(value, units, symbols),
    style: s => paint.temperature(value, units, s),
  });
  const min = Math.min(...days.map(d => d.temperatureMin));
  const max = Math.max(...days.map(d => d.temperatureMax));
  const barWidth = Math.max(8, Math.min(20, Math.floor(ctx.width / 6)));

  const columns: Column<DailyForecast>[] = [
    {
      header: t.forecast.day,
      cell: d => ({ text: formatDay(d.date, today, t), style: paint.bold }),
    },
    {
      header: t.forecast.condition,
      flexible: true,
      cell: d => conditionText(d.weatherCode, t),
    },
    {
      header: t.forecast.low,
      align: 'right',
      cell: d => temp(d.temperatureMin),
    },
    {
      header: '',
      priority: 2,
      cell: d => rangeBar(d, { min, max, width: barWidth }, ctx, units),
    },
    {
      header: t.forecast.high,
      align: 'right',
      cell: d => temp(d.temperatureMax),
    },
    {
      header: t.forecast.rain,
      align: 'right',
      priority: 3,
      cell: d =>
        d.precipitationProbability === null
          ? ''
          : {
              text: formatPercent(d.precipitationProbability, t),
              style: s => paint.rain(d.precipitationProbability ?? 0, s),
            },
    },
    {
      header: t.forecast.precipitation,
      align: 'right',
      priority: 1,
      cell: d =>
        d.precipitationSum === null || d.precipitationSum === 0
          ? { text: symbols.dash, style: paint.dim }
          : formatPrecipitation(d.precipitationSum, units, t),
    },
    {
      header: t.forecast.wind,
      priority: 0,
      cell: d =>
        d.windSpeedMax === null
          ? ''
          : formatWind(d.windSpeedMax, d.windDirection, units, t, symbols),
    },
  ];

  const table = renderTable(days, columns, {
    width: ctx.width,
    ellipsis: symbols.ellipsis,
    header: paint.dim,
  });
  if (options.compact) return `${table.join('\n')}\n`;
  return (
    [
      ...header(report, ctx, t.forecast.title(days.length)),
      '',
      ...table,
      '',
      ...footer(report.attribution, ctx),
    ].join('\n') + '\n'
  );
}
