import type { HourlyForecast, WeatherReport } from '../core/models.ts';
import { conditionText, footer, header, localToday } from './common.ts';
import type { RenderContext } from './context.ts';
import {
  formatDay,
  formatPercent,
  formatPrecipitation,
  formatTemperature,
  formatTime,
  formatWind,
} from './format.ts';
import { downsample, sparkline } from './sparkline.ts';
import { renderTable, type Column } from './table.ts';
import { joinFitting, padEnd, visibleWidth } from './text.ts';

/** Sparklines for temperature and rain chance, with an hour axis. */
function charts(report: WeatherReport, ctx: RenderContext): string[] {
  const { t, paint, symbols } = ctx;
  const units = report.units;
  const hours = report.hourly;
  const labels = [t.hourly.temperature, t.hourly.rain];
  const labelWidth = Math.max(...labels.map(l => l.length)) + 2;

  const known = hours
    .map(h => h.temperature)
    .filter((v): v is number => v !== null);
  const low = formatTemperature(Math.min(...known), units, symbols);
  const high = formatTemperature(Math.max(...known), units, symbols);
  const peak = Math.max(0, ...hours.map(h => h.precipitationProbability ?? 0));
  const suffixes = [
    `${low} ${symbols.dash} ${high}`,
    peak > 0 ? t.hourly.rainPeak(formatPercent(peak, t)) : t.hourly.dry,
  ];
  // The summaries sit right of the charts, or below them when that leaves
  // too little room for the chart.
  const suffixWidth = Math.max(...suffixes.map(visibleWidth)) + 2;
  const inline = ctx.width - labelWidth - suffixWidth >= 12;
  const room = Math.max(4, ctx.width - labelWidth - (inline ? suffixWidth : 0));

  // Two columns per hour when there is room, one otherwise. Past that, each
  // column averages a whole number of hours so the axis stays regular.
  const cell = hours.length * 2 <= room ? 2 : 1;
  const perCell = Math.ceil(hours.length / Math.floor(room / cell));
  const count = Math.ceil(hours.length / perCell);
  const temps = downsample(
    hours.map(h => h.temperature),
    count
  );
  const rain = downsample(
    hours.map(h => h.precipitationProbability),
    count
  );

  const draw = (
    values: readonly (number | null)[],
    chars: readonly string[],
    style: (value: number, text: string) => string
  ): string =>
    chars
      .map((char, i) => {
        const value = values[i];
        const text = char.repeat(cell);
        return value === null || value === undefined
          ? text
          : style(value, text);
      })
      .join('');

  const tempLine = draw(
    temps,
    sparkline(temps, { levels: symbols.spark }),
    (v, text) => paint.temperature(v, units, text)
  );
  const rainLine = draw(
    rain,
    sparkline(rain, { levels: symbols.spark, min: 0, max: 100 }),
    (v, text) => paint.rain(v, text)
  );

  // A label every few columns, never touching the next one.
  const step = Math.ceil(4 / cell);
  let axis = '';
  for (let i = 0; i < count; i += step) {
    const hour = hours[i * perCell];
    // A label needs two columns; the last one must not hang off the chart.
    if (hour && i * cell + 2 <= count * cell) {
      axis = padEnd(axis, i * cell) + formatTime(hour.time).slice(0, 2);
    }
  }

  const label = (text: string): string => paint.dim(padEnd(text, labelWidth));
  const [tempSummary = '', rainSummary = ''] = suffixes;
  const after = (summary: string): string => (inline ? `  ${summary}` : '');
  const lines = [
    `${label(labels[0] ?? '')}${tempLine}${after(tempSummary)}`,
    `${label(labels[1] ?? '')}${rainLine}${after(paint.dim(rainSummary))}`,
    paint.dim(' '.repeat(labelWidth) + axis),
  ];
  if (!inline) {
    lines.push(
      ...joinFitting([tempSummary, paint.dim(rainSummary)], '  ', ctx.width)
    );
  }
  return lines;
}

export interface HourlyOptions {
  /** Charts only, without the table. */
  readonly compact?: boolean;
}

/** The `hourly` view: charts, then one row per hour. */
export function renderHourly(
  report: WeatherReport,
  ctx: RenderContext,
  options: HourlyOptions = {}
): string {
  const { t, paint, symbols } = ctx;
  const units = report.units;
  const hours = report.hourly;
  if (hours.length === 0) {
    // Old offline data can end before now: say so rather than print nothing.
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

  // Past 24 hours the same clock time repeats: name the day where it changes.
  const today = localToday(report);
  const columns: Column<HourlyForecast>[] = [
    ...(hours.length > 24 ||
    hours[0]?.time.slice(0, 10) !== hours.at(-1)?.time.slice(0, 10)
      ? [
          {
            header: t.hourly.day,
            cell: (h: HourlyForecast) => {
              const date = h.time.slice(0, 10);
              const index = hours.indexOf(h);
              const first =
                index === 0 || hours[index - 1]?.time.slice(0, 10) !== date;
              return first
                ? { text: formatDay(date, today, t), style: paint.dim }
                : '';
            },
          },
        ]
      : []),
    {
      header: t.hourly.time,
      cell: h => ({ text: formatTime(h.time), style: paint.bold }),
    },
    {
      header: t.hourly.temperature,
      align: 'right',
      cell: h =>
        h.temperature === null
          ? ''
          : {
              text: formatTemperature(h.temperature, units, symbols),
              style: s => paint.temperature(h.temperature ?? 0, units, s),
            },
    },
    {
      header: t.hourly.condition,
      flexible: true,
      cell: h => conditionText(h.weatherCode, t),
    },
    {
      header: t.hourly.rain,
      align: 'right',
      priority: 3,
      cell: h =>
        h.precipitationProbability === null
          ? ''
          : {
              text: formatPercent(h.precipitationProbability, t),
              style: s => paint.rain(h.precipitationProbability ?? 0, s),
            },
    },
    {
      header: '',
      align: 'right',
      priority: 1,
      cell: h =>
        h.precipitation === null || h.precipitation === 0
          ? ''
          : formatPrecipitation(h.precipitation, units, t),
    },
    {
      header: t.hourly.wind,
      priority: 0,
      cell: h =>
        h.windSpeed === null
          ? ''
          : formatWind(h.windSpeed, null, units, t, symbols),
    },
  ];

  const table = options.compact
    ? []
    : [
        '',
        ...renderTable(hours, columns, {
          width: ctx.width,
          ellipsis: symbols.ellipsis,
          header: paint.dim,
        }),
      ];
  return (
    [
      ...header(report, ctx, t.hourly.title(hours.length)),
      '',
      ...charts(report, ctx),
      ...table,
      '',
      ...footer(report.attribution, ctx),
    ].join('\n') + '\n'
  );
}
