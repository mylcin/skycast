import { describe, expect, it } from 'vitest';
import { en } from '../../../src/i18n/en.ts';
import { tr } from '../../../src/i18n/tr.ts';
import {
  compassPoint,
  formatCoordinates,
  formatDate,
  formatDay,
  formatNumber,
  formatPercent,
  formatPrecipitation,
  formatPressure,
  formatSpeed,
  formatTemperature,
  formatTime,
  formatWind,
  uvLevel,
  windArrow,
} from '../../../src/renderers/format.ts';
import { getSymbols } from '../../../src/renderers/symbols.ts';

const uni = getSymbols(true);
const ascii = getSymbols(false);

describe('numbers', () => {
  it('uses the language decimal separator', () => {
    expect(formatNumber(4.44, 1, en)).toBe('4.4');
    expect(formatNumber(4.44, 1, tr)).toBe('4,4');
    expect(formatNumber(8, 1, en)).toBe('8');
    expect(formatNumber(8, 1, en, true)).toBe('8.0');
    expect(formatNumber(-0.04, 1, en)).toBe('0');
  });

  it('writes percentages the local way', () => {
    expect(formatPercent(67.6, en)).toBe('68%');
    expect(formatPercent(67.6, tr)).toBe('%68');
  });
});

describe('measurements', () => {
  it('rounds temperatures to whole degrees and never prints -0', () => {
    expect(formatTemperature(19.4, 'metric', uni)).toBe('19°');
    expect(formatTemperature(19.5, 'metric', uni, true)).toBe('20°C');
    expect(formatTemperature(-0.4, 'metric', uni)).toBe('0°');
    expect(formatTemperature(70.7, 'imperial', uni, true)).toBe('71°F');
  });

  it('labels speed, precipitation and pressure per unit system and language', () => {
    expect(formatSpeed(17.7, 'metric', en)).toBe('18 km/h');
    expect(formatSpeed(17.7, 'metric', tr)).toBe('18 km/sa');
    expect(formatSpeed(11, 'imperial', tr)).toBe('11 mil/sa');
    expect(formatPrecipitation(8, 'metric', en)).toBe('8.0 mm');
    expect(formatPrecipitation(0.173, 'imperial', en)).toBe('0.17 in');
    expect(formatPrecipitation(0.173, 'imperial', tr)).toBe('0,17 inç');
    expect(formatPressure(1018.4, 'metric', en)).toBe('1018 hPa');
    expect(formatPressure(30.07, 'imperial', en)).toBe('30.07 inHg');
  });
});

describe('time', () => {
  it('reads local wall-clock strings without timezone conversion', () => {
    expect(formatTime('2026-09-27T06:56')).toBe('06:56');
    expect(formatDate('2026-09-27', en)).toBe('Sun 27 Sep');
    expect(formatDate('2026-09-27', tr)).toBe('Paz 27 Eyl');
  });

  it('names today and tomorrow, including across months and years', () => {
    expect(formatDay('2026-09-27', '2026-09-27', en)).toBe('Today');
    expect(formatDay('2026-09-28', '2026-09-27', tr)).toBe('Yarın');
    expect(formatDay('2026-10-01', '2026-09-30', en)).toBe('Tomorrow');
    expect(formatDay('2027-01-01', '2026-12-31', en)).toBe('Tomorrow');
    expect(formatDay('2026-09-29', '2026-09-27', en)).toBe('Tue 29');
  });
});

describe('wind', () => {
  it('names where the wind comes from and points where it goes', () => {
    expect(compassPoint(39, en)).toBe('NE');
    expect(compassPoint(39, tr)).toBe('KD');
    expect(compassPoint(359, en)).toBe('N');
    expect(compassPoint(-90, en)).toBe('W');
    expect(windArrow(0, uni)).toBe('↓');
    expect(windArrow(39, uni)).toBe('↙');
    expect(windArrow(270, uni)).toBe('→');
  });

  it('formats with and without Unicode', () => {
    expect(formatWind(17.7, 39, 'metric', en, uni)).toBe('↙ 18 km/h NE');
    expect(formatWind(17.7, 39, 'metric', en, ascii)).toBe('18 km/h NE');
    expect(formatWind(17.7, null, 'metric', en, uni)).toBe('18 km/h');
  });
});

describe('uvLevel', () => {
  it.each([
    [0, 'low'],
    [2.9, 'low'],
    [3, 'moderate'],
    [6, 'high'],
    [8, 'veryHigh'],
    [11, 'extreme'],
  ] as const)('%d is %s', (uv, level) => {
    expect(uvLevel(uv)).toBe(level);
  });
});

describe('coordinates', () => {
  it('uses hemisphere letters in each language', () => {
    expect(formatCoordinates(41.0138, 28.9497, en, uni)).toBe(
      '41.01°N, 28.95°E'
    );
    expect(formatCoordinates(-33.87, -151.21, tr, uni)).toBe(
      '33,87°G, 151,21°B'
    );
  });
});
