import { describe, expect, it } from 'vitest';
import type { WeatherReport } from '../../../src/core/models.ts';
import { localToday } from '../../../src/renderers/common.ts';
import { renderCompare } from '../../../src/renderers/compare.ts';
import {
  renderCurrent,
  renderCurrentCompact,
} from '../../../src/renderers/current.ts';
import { renderForecast } from '../../../src/renderers/forecast.ts';
import { formatTime } from '../../../src/renderers/format.ts';
import { renderHourly } from '../../../src/renderers/hourly.ts';
import { reportJson } from '../../../src/renderers/json.ts';
import { visibleWidth } from '../../../src/renderers/text.ts';
import { en } from '../../../src/i18n/en.ts';
import { context, istanbulReport } from '../../helpers/reports.ts';

const widest = (output: string) =>
  Math.max(...output.split('\n').map(visibleWidth));

/** A report built to stress layouts: long name, long condition, polar cold. */
async function harsh(): Promise<WeatherReport> {
  const report = await istanbulReport();
  const current = report.current!;
  return {
    ...report,
    location: {
      name: 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch',
      region: 'Wales',
      countryCode: 'US',
      latitude: -89.99,
      longitude: -179.99,
    },
    current: {
      ...current,
      temperature: -56.4,
      feelsLike: -64.2,
      weatherCode: 99,
      uvIndex: 11.4,
      isDay: true,
    },
    daily: report.daily.map(day => ({
      ...day,
      weatherCode: 99,
      temperatureMin: -59,
      temperatureMax: -55,
    })),
    hourly: report.hourly.map(hour => ({
      ...hour,
      weatherCode: 99,
      precipitationProbability: 100,
    })),
  };
}

describe('layout with harsh data', () => {
  it.each([30, 31, 35, 40, 48, 56, 64, 80, 120, 160])(
    'fits %i columns',
    async width => {
      const report = await harsh();
      for (const lang of ['en', 'tr'] as const) {
        for (const unicode of [true, false]) {
          const ctx = context({ width, lang, unicode, color: 3 });
          for (const output of [
            renderCurrent(report, ctx),
            renderCurrentCompact(report, ctx),
            renderForecast(report, ctx),
            renderHourly(report, ctx),
            renderHourly(
              {
                ...report,
                hourly: [...report.hourly, ...report.hourly.slice(0, 1)],
              },
              ctx
            ),
            renderCompare([report, report], ctx),
          ]) {
            expect(widest(output)).toBeLessThanOrEqual(width);
          }
        }
      }
    }
  );
});

describe('today after midnight', () => {
  it('uses the first forecast day when the cached current time is from yesterday', async () => {
    const report = await istanbulReport();
    const stale = {
      ...report,
      current: { ...report.current!, time: '2026-09-26T23:55' },
    };
    expect(localToday(stale)).toBe('2026-09-27');
    const output = renderForecast(stale, context());
    expect(output).toMatch(/^Today /m);
    expect(output).toMatch(/^Tomorrow /m);
  });
});

describe('now view details', () => {
  it('classifies the UV index it shows', async () => {
    const report = await istanbulReport();
    const at = (uvIndex: number) =>
      renderCurrent(
        { ...report, current: { ...report.current!, uvIndex, isDay: true } },
        context()
      );
    expect(at(5.65)).toContain('UV 6 high');
    expect(at(2.75)).toContain('UV 3 moderate');
    expect(at(7.8)).toContain('UV 8 very high');
    expect(at(10.6)).toContain('UV 11 extreme');
  });

  it('marks a sunset after midnight as the next day', async () => {
    const report = await istanbulReport();
    const [today] = report.daily;
    const output = renderCurrent(
      {
        ...report,
        daily: [
          {
            ...today!,
            sunrise: `${today!.date}T01:31`,
            sunset: '2026-09-28T00:03',
          },
        ],
      },
      context()
    );
    expect(output).toContain('Sunset 00:03 +1');
    expect(formatTime('2026-09-26T23:50', '2026-09-27')).toBe('23:50 -1');
  });

  it('truncates a long place name to the width', async () => {
    const output = renderCurrent(await harsh(), context({ width: 40 }));
    expect(output.split('\n')[0]).toMatch(/…$/);
  });
});

describe('hourly', () => {
  it('names the day when the table spans more than one', async () => {
    const report = await istanbulReport();
    const output = renderHourly(report, context({ width: 100 }));
    expect(output).toMatch(/^Day\s+Time/m);
    expect(output.match(/^Tomorrow\s+00:00/gm)).toHaveLength(1);
  });

  it('says "Next hour" for one hour', async () => {
    const report = await istanbulReport();
    expect(
      renderHourly({ ...report, hourly: report.hourly.slice(0, 1) }, context())
    ).toContain('Next hour');
  });

  it('explains a forecast with no days left', async () => {
    const report = await istanbulReport();
    expect(renderForecast({ ...report, daily: [] }, context())).toContain(
      'No data for this period yet.'
    );
  });
});

describe('JSON', () => {
  it('includes daylight so polar night and midnight sun differ', async () => {
    const report = await istanbulReport();
    const polar = {
      ...report,
      daily: [
        {
          ...report.daily[0]!,
          sunrise: null,
          sunset: null,
          daylightSeconds: 0,
        },
      ],
    };
    const json = reportJson(polar, en) as {
      daily: { daylightSeconds: number | null }[];
    };
    expect(json.daily[0]?.daylightSeconds).toBe(0);
  });
});
