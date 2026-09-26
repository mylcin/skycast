import type { WeatherReport } from '../core/models.ts';
import { conditionText, footer, localToday } from './common.ts';
import type { RenderContext } from './context.ts';
import { formatPercent, formatTemperature, formatWind } from './format.ts';
import { placeShort } from './place.ts';
import { renderTable, type Column } from './table.ts';

/** The `compare` view: one row per place. */
export function renderCompare(
  reports: readonly WeatherReport[],
  ctx: RenderContext
): string {
  const { t, paint, symbols } = ctx;
  const temp = (
    report: WeatherReport,
    value: number | undefined,
    unit = false
  ) =>
    value === undefined
      ? ''
      : {
          text: formatTemperature(value, report.units, symbols, unit),
          style: (s: string) => paint.temperature(value, report.units, s),
        };

  const columns: Column<WeatherReport>[] = [
    {
      header: t.compare.place,
      flexible: true,
      cell: r => ({
        text: placeShort(r.location, t, symbols),
        style: paint.bold,
      }),
    },
    {
      header: t.compare.now,
      align: 'right',
      cell: r => temp(r, r.current?.temperature, true),
    },
    {
      header: t.compare.feelsLike,
      align: 'right',
      priority: 1,
      cell: r => temp(r, r.current?.feelsLike),
    },
    {
      header: t.compare.condition,
      priority: 3,
      cell: r => (r.current ? conditionText(r.current.weatherCode, t) : ''),
    },
    {
      header: t.compare.wind,
      priority: 0,
      cell: r =>
        r.current
          ? formatWind(
              r.current.windSpeed,
              r.current.windDirection,
              r.units,
              t,
              symbols
            )
          : '',
    },
    {
      header: t.compare.humidity,
      align: 'right',
      priority: 2,
      cell: r => (r.current ? formatPercent(r.current.humidity, t) : ''),
    },
    {
      header: t.compare.today,
      align: 'right',
      priority: 4,
      cell: r => {
        const day = r.daily.find(d => d.date === localToday(r));
        if (!day) return '';
        const low = formatTemperature(day.temperatureMin, r.units, symbols);
        const high = formatTemperature(day.temperatureMax, r.units, symbols);
        return {
          text: `${low} ${symbols.dash} ${high}`,
          style: () =>
            `${paint.temperature(day.temperatureMin, r.units, low)} ${symbols.dash} ${paint.temperature(day.temperatureMax, r.units, high)}`,
        };
      },
    },
  ];

  const table = renderTable(reports, columns, {
    width: ctx.width,
    ellipsis: symbols.ellipsis,
    header: paint.dim,
  });
  const attribution = reports.flatMap(r => r.attribution);
  return [...table, '', ...footer(attribution, ctx)].join('\n') + '\n';
}
