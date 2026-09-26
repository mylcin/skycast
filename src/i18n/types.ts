import type { WmoCode } from '../core/conditions.ts';

export type Lang = 'en' | 'tr';
export const LANGS: readonly Lang[] = ['en', 'tr'];

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

/** Every user-facing string. `en.ts` and `tr.ts` must both satisfy it. */
export interface Messages {
  readonly lang: Lang;
  /** BCP 47 tag for Intl (country names, plural rules). */
  readonly locale: string;
  readonly decimalSeparator: string;
  /** "68%" in English, "%68" in Turkish. */
  percent(value: string): string;

  /** Sunday first, like Date#getUTCDay. */
  readonly weekdays: readonly string[];
  readonly months: readonly string[];
  readonly today: string;
  readonly tomorrow: string;

  readonly conditions: Readonly<Record<WmoCode, string>>;
  readonly unknownCondition: string;
  /** Eight points, clockwise from north. */
  readonly compass: readonly string[];
  readonly uv: {
    readonly low: string;
    readonly moderate: string;
    readonly high: string;
    readonly veryHigh: string;
    readonly extreme: string;
  };
  readonly units: {
    readonly kmh: string;
    readonly mph: string;
    readonly mm: string;
    readonly in: string;
    readonly hPa: string;
    readonly inHg: string;
  };

  readonly weather: {
    feelsLike(value: string): string;
    readonly humidity: string;
    readonly wind: string;
    gusts(value: string): string;
    readonly uv: string;
    readonly sunrise: string;
    readonly sunset: string;
    readonly polarNight: string;
    readonly midnightSun: string;
    readonly pressure: string;
    readonly clouds: string;
    todayRange(low: string, high: string): string;
    chanceOfRain(value: string): string;
  };

  readonly forecast: {
    title(days: number): string;
    readonly day: string;
    readonly condition: string;
    readonly low: string;
    readonly high: string;
    readonly range: string;
    readonly rain: string;
    readonly precipitation: string;
    readonly wind: string;
  };

  readonly hourly: {
    title(hours: number): string;
    readonly time: string;
    readonly temperature: string;
    readonly rain: string;
    readonly condition: string;
    readonly wind: string;
    rainPeak(value: string): string;
    readonly dry: string;
  };

  readonly compare: {
    title(count: number): string;
    readonly place: string;
    readonly now: string;
    readonly feelsLike: string;
    readonly condition: string;
    readonly wind: string;
    readonly humidity: string;
    readonly today: string;
  };

  /** Plain-text place for coordinates: "41.01°N, 28.95°E". */
  coordinates(latitude: string, longitude: string): string;
  readonly north: string;
  readonly south: string;
  readonly east: string;
  readonly west: string;
}
