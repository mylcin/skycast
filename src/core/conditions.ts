/** WMO weather interpretation codes, as documented by Open-Meteo. */
export const WMO_CODES = [
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77,
  80, 81, 82, 85, 86, 95, 96, 99,
] as const;

export type WmoCode = (typeof WMO_CODES)[number];

export function isWmoCode(code: number): code is WmoCode {
  return (WMO_CODES as readonly number[]).includes(code);
}

/** Coarse groups that share an icon and a colour. */
export type ConditionGroup =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavy-rain'
  | 'freezing-rain'
  | 'snow'
  | 'heavy-snow'
  | 'thunderstorm'
  | 'unknown';

const groups: Record<WmoCode, ConditionGroup> = {
  0: 'clear',
  1: 'clear',
  2: 'partly-cloudy',
  3: 'cloudy',
  45: 'fog',
  48: 'fog',
  51: 'drizzle',
  53: 'drizzle',
  55: 'drizzle',
  56: 'freezing-rain',
  57: 'freezing-rain',
  61: 'rain',
  63: 'rain',
  65: 'heavy-rain',
  66: 'freezing-rain',
  67: 'freezing-rain',
  71: 'snow',
  73: 'snow',
  75: 'heavy-snow',
  77: 'snow',
  80: 'rain',
  81: 'rain',
  82: 'heavy-rain',
  85: 'snow',
  86: 'heavy-snow',
  95: 'thunderstorm',
  96: 'thunderstorm',
  99: 'thunderstorm',
};

export function conditionGroup(code: number | null): ConditionGroup {
  return code !== null && isWmoCode(code) ? groups[code] : 'unknown';
}

/** Rain, drizzle, snow or storms: the day is "wet". */
export function isPrecipitation(group: ConditionGroup): boolean {
  return !['clear', 'partly-cloudy', 'cloudy', 'fog', 'unknown'].includes(
    group
  );
}
