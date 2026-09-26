import type { WeatherReport } from '../core/models.ts';
import { ART_WIDTH, drawPicture, pictureFor } from './ascii-art.ts';
import {
  conditionGroup,
  conditionText,
  footer,
  header,
  localToday,
} from './common.ts';
import type { RenderContext } from './context.ts';
import {
  formatPercent,
  formatPrecipitation,
  formatTemperature,
  formatTime,
  formatWind,
  uvLevel,
} from './format.ts';
import { placeShort } from './place.ts';
import { fitLine, joinFitting, sideBySide } from './text.ts';

/** Below this width the picture is left out. */
const PICTURE_MIN_WIDTH = 56;

export interface CurrentOptions {
  /** Leave out the data credits when another view follows with them. */
  readonly credits?: boolean;
}

/** The `now` view: picture, conditions, today's range and sun times. */
export function renderCurrent(
  report: WeatherReport,
  ctx: RenderContext,
  options: CurrentOptions = {}
): string {
  const { t, paint, symbols } = ctx;
  const current = report.current;
  if (!current) return '';
  const units = report.units;
  const temp = (value: number, unit = false): string =>
    paint.temperature(
      value,
      units,
      formatTemperature(value, units, symbols, unit)
    );
  const sep = paint.dim(` ${symbols.separator} `);

  const withPicture = ctx.width >= PICTURE_MIN_WIDTH;
  const room = withPicture ? ctx.width - ART_WIDTH - 2 : ctx.width;
  const fit = (parts: string[]): string[] => joinFitting(parts, sep, room);

  const details: string[] = [
    paint.bold(conditionText(current.weatherCode, t)),
    `${paint.bold(temp(current.temperature, true))}  ${paint.dim(
      t.weather.feelsLike(formatTemperature(current.feelsLike, units, symbols))
    )}`,
  ];

  const wind = formatWind(
    current.windSpeed,
    current.windDirection,
    units,
    t,
    symbols
  );
  const gusts =
    current.windGusts !== null && current.windGusts > current.windSpeed
      ? paint.dim(
          t.weather.gusts(
            formatWind(current.windGusts, null, units, t, symbols)
          )
        )
      : '';
  details.push(
    ...fit([`${paint.dim(t.weather.wind)} ${wind}`, ...(gusts ? [gusts] : [])])
  );

  const extras = [
    `${paint.dim(t.weather.humidity)} ${formatPercent(current.humidity, t)}`,
  ];
  // UV 0 at night is noise.
  if (current.uvIndex !== null && (current.isDay || current.uvIndex >= 0.5)) {
    const level = uvLevel(current.uvIndex);
    extras.push(
      `${paint.dim(t.weather.uv)} ${paint.uv(level, `${Math.round(current.uvIndex)} ${t.uv[level]}`)}`
    );
  }
  details.push(...fit(extras));

  const today = report.daily.find(day => day.date === localToday(report));
  if (today) {
    const range = [
      t.weather.todayRange(
        temp(today.temperatureMin),
        temp(today.temperatureMax)
      ),
    ];
    if (
      today.precipitationProbability !== null &&
      today.precipitationProbability > 0
    ) {
      const amount =
        today.precipitationSum !== null && today.precipitationSum > 0
          ? ` (${formatPrecipitation(today.precipitationSum, units, t)})`
          : '';
      range.push(
        paint.rain(
          today.precipitationProbability,
          t.weather.chanceOfRain(
            formatPercent(today.precipitationProbability, t)
          ) + amount
        )
      );
    }
    details.push(...fit(range));

    if (today.sunrise && today.sunset) {
      details.push(
        ...fit([
          `${paint.dim(t.weather.sunrise)} ${formatTime(today.sunrise)}`,
          `${paint.dim(t.weather.sunset)} ${formatTime(today.sunset)}`,
        ])
      );
    } else if (today.daylightSeconds !== null) {
      details.push(
        today.daylightSeconds > 0 ? t.weather.midnightSun : t.weather.polarNight
      );
    }
  }

  const body = withPicture
    ? sideBySide(
        drawPicture(
          pictureFor(conditionGroup(current.weatherCode), current.isDay),
          paint
        ),
        details,
        ART_WIDTH,
        2
      )
    : details;

  return (
    [
      ...header(report, ctx),
      '',
      ...body,
      ...(options.credits === false
        ? []
        : ['', ...footer(report.attribution, ctx)]),
    ].join('\n') + '\n'
  );
}

/** One line per place, for `--compact` and status bars. */
export function renderCurrentCompact(
  report: WeatherReport,
  ctx: RenderContext
): string {
  const { t, paint, symbols } = ctx;
  const current = report.current;
  if (!current) return '';
  const units = report.units;
  return (
    fitLine(
      [
        paint.bold(placeShort(report.location, t, symbols)),
        paint.temperature(
          current.temperature,
          units,
          formatTemperature(current.temperature, units, symbols, true)
        ),
        conditionText(current.weatherCode, t),
        formatWind(current.windSpeed, current.windDirection, units, t, symbols),
        formatPercent(current.humidity, t),
      ],
      '  ',
      ctx.width,
      2
    ) + '\n'
  );
}
