import type { LocalDate, LocalDateTime, UnitSystem } from '../core/models.ts';
import type { Messages } from '../i18n/index.ts';
import type { UvLevel } from './paint.ts';
import type { Symbols } from './symbols.ts';

/**
 * A number in the language's notation. Trailing zeros are dropped unless
 * `fixed` is set, which keeps columns of amounts aligned ("8.0", "21.2").
 */
export function formatNumber(
  value: number,
  digits: number,
  t: Messages,
  fixed = false
): string {
  // `|| 0` turns the -0 from rounding -0.3 into 0.
  const rounded = Number(value.toFixed(digits)) || 0;
  const text = fixed ? rounded.toFixed(digits) : String(rounded);
  return t.decimalSeparator === '.'
    ? text
    : text.replace('.', t.decimalSeparator);
}

/** "19°", or "19°C" with the unit. Temperatures are shown as whole degrees. */
export function formatTemperature(
  value: number,
  units: UnitSystem,
  symbols: Symbols,
  withUnit = false
): string {
  const rounded = Math.round(value);
  const text = `${Object.is(rounded, -0) ? 0 : rounded}${symbols.degree}`;
  return withUnit ? `${text}${units === 'metric' ? 'C' : 'F'}` : text;
}

export function formatSpeed(
  value: number,
  units: UnitSystem,
  t: Messages
): string {
  return `${Math.round(value)} ${units === 'metric' ? t.units.kmh : t.units.mph}`;
}

export function formatPrecipitation(
  value: number,
  units: UnitSystem,
  t: Messages
): string {
  return units === 'metric'
    ? `${formatNumber(value, 1, t, true)} ${t.units.mm}`
    : `${formatNumber(value, 2, t, true)} ${t.units.in}`;
}

export function formatPressure(
  value: number,
  units: UnitSystem,
  t: Messages
): string {
  return units === 'metric'
    ? `${Math.round(value)} ${t.units.hPa}`
    : `${formatNumber(value, 2, t)} ${t.units.inHg}`;
}

export function formatPercent(value: number, t: Messages): string {
  return t.percent(String(Math.round(value)));
}

/** "2026-09-27T06:56" → "06:56". */
export function formatTime(value: LocalDateTime): string {
  return value.slice(11, 16);
}

function weekday(date: LocalDate): number {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** "Sat 27 Sep". Names come from the dictionary, not ICU, so output is stable. */
export function formatDate(date: LocalDate, t: Messages): string {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return `${t.weekdays[weekday(date)] ?? ''} ${day} ${t.months[month - 1] ?? ''}`;
}

/** "Today", "Tomorrow", then "Mon 29". */
export function formatDay(
  date: LocalDate,
  today: LocalDate,
  t: Messages
): string {
  if (date === today) return t.today;
  const next = new Date(`${today}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  if (date === next.toISOString().slice(0, 10)) return t.tomorrow;
  return `${t.weekdays[weekday(date)] ?? ''} ${Number(date.slice(8, 10))}`;
}

const sector = (degrees: number): number =>
  Math.round((((degrees % 360) + 360) % 360) / 45) % 8;

/** Where the wind comes from: "NE". */
export function compassPoint(degrees: number, t: Messages): string {
  return t.compass[sector(degrees)] ?? '';
}

/** An arrow pointing where the wind blows to; empty without Unicode. */
export function windArrow(degrees: number, symbols: Symbols): string {
  return symbols.arrows[sector(degrees + 180)] ?? '';
}

/** "↙ 18 km/h NE". */
export function formatWind(
  speed: number,
  direction: number | null,
  units: UnitSystem,
  t: Messages,
  symbols: Symbols
): string {
  const text = formatSpeed(speed, units, t);
  if (direction === null) return text;
  const arrow = windArrow(direction, symbols);
  return `${arrow ? `${arrow} ` : ''}${text} ${compassPoint(direction, t)}`;
}

/** WHO UV index categories. */
export function uvLevel(index: number): UvLevel {
  if (index < 3) return 'low';
  if (index < 6) return 'moderate';
  if (index < 8) return 'high';
  if (index < 11) return 'veryHigh';
  return 'extreme';
}

export function formatCoordinates(
  latitude: number,
  longitude: number,
  t: Messages,
  symbols: Symbols
): string {
  const lat = `${formatNumber(Math.abs(latitude), 2, t)}${symbols.degree}${latitude >= 0 ? t.north : t.south}`;
  const lon = `${formatNumber(Math.abs(longitude), 2, t)}${symbols.degree}${longitude >= 0 ? t.east : t.west}`;
  return t.coordinates(lat, lon);
}
