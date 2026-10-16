import { describe, expect, it } from 'vitest';
import type { Change } from '../../../src/core/changes.ts';
import type { WeatherReport } from '../../../src/core/models.ts';
import {
  changeTexts,
  describeChange,
  renderChanges,
} from '../../../src/renderers/changes.ts';
import { getSymbols } from '../../../src/renderers/symbols.ts';
import { visibleWidth } from '../../../src/renderers/text.ts';
import { en } from '../../../src/i18n/en.ts';
import { tr } from '../../../src/i18n/tr.ts';
import { context, istanbulReport } from '../../helpers/reports.ts';

const symbols = getSymbols(true);

/** The fixture at 00:30 on 27 September: "tomorrow" is the 28th. */
const report = await istanbulReport();

const say = (change: Change, lang: 'en' | 'tr' = 'en'): string =>
  describeChange(change, report, lang === 'en' ? en : tr, symbols);

describe('describeChange', () => {
  it('names the hour, and the next day as tomorrow', () => {
    const rain = {
      kind: 'precipitation-starts',
      precipitation: 'rain',
      probability: 70,
    } as const;
    expect(say({ ...rain, time: '2026-09-27T15:00' })).toBe(
      'Rain likely from 15:00 (70%)'
    );
    expect(say({ ...rain, time: '2026-09-28T03:00' })).toBe(
      'Rain likely from 03:00 tomorrow (70%)'
    );
    expect(say({ ...rain, time: '2026-09-28T03:00' }, 'tr')).toBe(
      'Yarın 03:00 itibarıyla yağmur olası (%70)'
    );
  });

  it('says what is easing', () => {
    const change: Change = {
      kind: 'precipitation-eases',
      time: '2026-09-27T12:00',
      precipitation: 'snow',
      probability: 38,
    };
    expect(say(change)).toBe('Snow easing from 12:00 (38%)');
    expect(say(change, 'tr')).toBe('12:00 itibarıyla kar azalıyor (%38)');
  });

  it('gives gusts in the report’s units', () => {
    const change: Change = {
      kind: 'gusts',
      time: '2026-09-27T19:00',
      speed: 64.6,
    };
    expect(say(change)).toBe('Gusts up to 65 km/h from 19:00');
    expect(say(change, 'tr')).toBe(
      '19:00 itibarıyla kuvvetli hamleler, en çok 65 km/sa'
    );
  });

  it('signs the difference of the highs people see', () => {
    const temperature = (high: number, previous: number): Change => ({
      kind: 'temperature',
      date: '2026-09-28',
      high,
      previous,
    });
    expect(say(temperature(13.2, 21.4))).toBe('Colder tomorrow: 13° (-8°)');
    expect(say(temperature(25.5, 19.6))).toBe('Warmer tomorrow: 26° (+6°)');
    expect(say(temperature(25.5, 19.6), 'tr')).toBe(
      'Yarın daha sıcak: 26° (+6°)'
    );
  });
});

describe('renderChanges', () => {
  /** The fixture with rain from 03:00 and a cold tomorrow. */
  const busy: WeatherReport = {
    ...report,
    hourly: report.hourly.map((hour, i) =>
      i >= 3
        ? { ...hour, precipitationProbability: 80, precipitation: 2 }
        : hour
    ),
    daily: report.daily.map((day, i) =>
      i === 1 ? { ...day, temperatureMax: 9 } : day
    ),
  };

  it('is empty when nothing changes', () => {
    expect(renderChanges(report, context(), 80)).toEqual([]);
  });

  it('puts what fits on one line, most useful first', () => {
    expect(changeTexts(busy, context())).toEqual([
      'Rain likely from 03:00 (80%)',
      'Colder tomorrow: 9° (-11°)',
    ]);
    expect(renderChanges(busy, context(), 80)).toEqual([
      'Rain likely from 03:00 (80%) · Colder tomorrow: 9° (-11°)',
    ]);
    expect(renderChanges(busy, context(), 40)).toEqual([
      'Rain likely from 03:00 (80%)',
    ]);
  });

  it('wraps a first change wider than the line instead of overflowing', () => {
    const lines = renderChanges(busy, context(), 20);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines)
      expect(visibleWidth(line)).toBeLessThanOrEqual(20);
  });

  it('dims only the separator', () => {
    const [line = ''] = renderChanges(busy, context({ color: 3 }), 80);
    expect(line).toContain('Rain likely from 03:00 (80%)');
    expect(line).toContain('\u001b[2m · ');
  });
});
