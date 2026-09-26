import { Ansis } from 'ansis';
import type { UnitSystem } from '../core/models.ts';

/** 0 none, 1 basic 16 colours, 2 256 colours, 3 truecolor. */
export type ColorLevel = 0 | 1 | 2 | 3;

export type ArtRole =
  'sun' | 'moon' | 'star' | 'cloud' | 'rain' | 'snow' | 'bolt' | 'fog';

export type UvLevel = 'low' | 'moderate' | 'high' | 'veryHigh' | 'extreme';

type Rgb = readonly [number, number, number];

/** Temperature colour stops in °C, cold to hot. Readable on dark and light themes. */
const TEMPERATURE_STOPS: readonly (readonly [number, Rgb])[] = [
  [-20, [150, 130, 255]],
  [-5, [90, 150, 255]],
  [5, [60, 190, 220]],
  [15, [90, 200, 110]],
  [22, [215, 190, 60]],
  [28, [240, 145, 60]],
  [35, [245, 85, 85]],
];

const ART: Record<ArtRole, Rgb> = {
  sun: [245, 200, 70],
  moon: [215, 215, 230],
  star: [140, 140, 160],
  cloud: [160, 168, 178],
  rain: [80, 160, 255],
  snow: [210, 235, 255],
  bolt: [255, 215, 80],
  fog: [140, 148, 156],
};

const UV: Record<UvLevel, Rgb> = {
  low: [90, 200, 110],
  moderate: [215, 190, 60],
  high: [240, 145, 60],
  veryHigh: [235, 80, 80],
  extreme: [190, 110, 230],
};

const mix = (a: number, b: number, k: number): number =>
  Math.round(a + (b - a) * k);

/** The colour for a temperature, interpolated between the stops. */
export function temperatureRgb(celsius: number): Rgb {
  let previous: readonly [number, Rgb] | undefined;
  for (const stop of TEMPERATURE_STOPS) {
    const [at, color] = stop;
    if (celsius <= at) {
      if (!previous) return color;
      const [from, low] = previous;
      const k = (celsius - from) / (at - from);
      return [
        mix(low[0], color[0], k),
        mix(low[1], color[1], k),
        mix(low[2], color[2], k),
      ];
    }
    previous = stop;
  }
  return previous ? previous[1] : [255, 255, 255];
}

export function toCelsius(value: number, units: UnitSystem): number {
  return units === 'metric' ? value : ((value - 32) * 5) / 9;
}

/** Styling for renderers. With level 0 every method returns its input. */
export interface Paint {
  readonly level: ColorLevel;
  readonly bold: (text: string) => string;
  readonly dim: (text: string) => string;
  readonly accent: (text: string) => string;
  readonly error: (text: string) => string;
  readonly warn: (text: string) => string;
  readonly temperature: (
    value: number,
    units: UnitSystem,
    text: string
  ) => string;
  readonly art: (role: ArtRole, text: string) => string;
  readonly uv: (level: UvLevel, text: string) => string;
  /** Rain probability: stronger blue as it gets likelier. */
  readonly rain: (probability: number, text: string) => string;
}

export function createPaint(level: ColorLevel): Paint {
  const a = new Ansis(level);
  const rgb = ([r, g, b]: Rgb, text: string): string => a.rgb(r, g, b)(text);
  return {
    level,
    bold: text => a.bold(text),
    dim: text => a.dim(text),
    accent: text => a.cyan(text),
    error: text => a.red(text),
    warn: text => a.yellow(text),
    temperature: (value, units, text) =>
      rgb(temperatureRgb(toCelsius(value, units)), text),
    art: (role, text) => rgb(ART[role], text),
    uv: (uvLevel, text) => rgb(UV[uvLevel], text),
    rain: (probability, text) =>
      probability >= 60
        ? rgb(ART.rain, text)
        : probability >= 30
          ? rgb([120, 170, 220], text)
          : a.dim(text),
  };
}
