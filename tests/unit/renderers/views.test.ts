import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it } from 'vitest';
import { renderCompare } from '../../../src/renderers/compare.ts';
import {
  renderCurrent,
  renderCurrentCompact,
} from '../../../src/renderers/current.ts';
import { renderForecast } from '../../../src/renderers/forecast.ts';
import { renderHourly } from '../../../src/renderers/hourly.ts';
import { visibleWidth } from '../../../src/renderers/text.ts';
import {
  compareReports,
  context,
  istanbulReport,
} from '../../helpers/reports.ts';

const widest = (output: string) =>
  Math.max(...output.split('\n').map(visibleWidth));

describe('snapshots', () => {
  for (const lang of ['en', 'tr'] as const) {
    for (const width of [40, 80, 120]) {
      it(`now · ${lang} · ${width} columns`, async () => {
        const report = await istanbulReport('metric', lang);
        expect(
          renderCurrent(report, context({ lang, width }))
        ).toMatchSnapshot();
      });

      it(`forecast · ${lang} · ${width} columns`, async () => {
        const report = await istanbulReport('metric', lang);
        expect(
          renderForecast(report, context({ lang, width }))
        ).toMatchSnapshot();
      });

      it(`hourly · ${lang} · ${width} columns`, async () => {
        const report = await istanbulReport('metric', lang);
        const day = { ...report, hourly: report.hourly.slice(0, 24) };
        expect(renderHourly(day, context({ lang, width }))).toMatchSnapshot();
      });

      it(`compare · ${lang} · ${width} columns`, async () => {
        const reports = await compareReports();
        expect(
          renderCompare(reports, context({ lang, width }))
        ).toMatchSnapshot();
      });
    }
  }

  it('now · imperial', async () => {
    expect(
      renderCurrent(await istanbulReport('imperial'), context())
    ).toMatchSnapshot();
  });

  it('now · ASCII only', async () => {
    expect(
      renderCurrent(await istanbulReport(), context({ unicode: false }))
    ).toMatchSnapshot();
  });

  it('forecast · ASCII only', async () => {
    expect(
      renderForecast(await istanbulReport(), context({ unicode: false }))
    ).toMatchSnapshot();
  });

  it('compact lines', async () => {
    const report = await istanbulReport();
    expect(renderCurrentCompact(report, context())).toBe(
      'Istanbul, TR  19°C  Overcast  ↙ 18 km/h NE  78%\n'
    );
    expect(renderCurrentCompact(report, context({ width: 30 }))).toBe(
      'Istanbul, TR  19°C  Overcast\n'
    );
  });

  it('hourly · charts only', async () => {
    const report = await istanbulReport();
    const output = renderHourly(report, context(), { compact: true });
    expect(output).not.toContain('Time');
    expect(output).toMatchSnapshot();
  });
});

describe('layout', () => {
  it.each([24, 30, 40, 56, 60, 80, 100, 160])(
    'never passes %i columns',
    async width => {
      for (const lang of ['en', 'tr'] as const) {
        for (const unicode of [true, false]) {
          const ctx = context({ lang, width, unicode, color: 3 });
          const report = await istanbulReport('metric', lang);
          for (const output of [
            renderCurrent(report, ctx),
            renderCurrentCompact(report, ctx),
            renderForecast(report, ctx),
            renderHourly(report, ctx),
            renderCompare(await compareReports(), ctx),
          ]) {
            expect(widest(output)).toBeLessThanOrEqual(width);
          }
        }
      }
    }
  );

  it('shows the picture only when there is room', async () => {
    const report = await istanbulReport();
    expect(renderCurrent(report, context({ width: 80 }))).toContain(
      '(___.__)__)'
    );
    expect(renderCurrent(report, context({ width: 50 }))).not.toContain(
      '(___.__)__)'
    );
  });

  it('colour changes nothing but escape codes', async () => {
    const report = await istanbulReport();
    const plain = renderForecast(report, context({ color: 0 }));
    const coloured = renderForecast(report, context({ color: 3 }));
    expect(coloured).not.toBe(plain);
    expect(stripVTControlCharacters(coloured)).toBe(plain);
  });
});

describe('content', () => {
  it('credits the data sources', async () => {
    const output = renderCurrent(
      await istanbulReport(),
      context({ width: 120 })
    );
    expect(output).toContain('Weather data by Open-Meteo.com');
    expect(output).toContain('GeoNames.org');
    expect(output).toContain('CC BY 4.0');
  });

  it('hides UV at night when it is zero', async () => {
    const output = renderCurrent(await istanbulReport(), context());
    expect(output).not.toMatch(/UV 0/);
  });

  it('says polar night instead of printing midnight sun times', async () => {
    const report = await istanbulReport();
    const today = {
      ...report.daily[0]!,
      sunrise: null,
      sunset: null,
      daylightSeconds: 0,
    };
    const output = renderCurrent({ ...report, daily: [today] }, context());
    expect(output).toContain('Polar night');
    expect(output).not.toContain('Sunrise');
  });

  it('renders nothing without data', async () => {
    const report = await istanbulReport();
    expect(renderCurrent({ ...report, current: null }, context())).toBe('');
    expect(renderCurrentCompact({ ...report, current: null }, context())).toBe(
      ''
    );
    expect(renderHourly({ ...report, hourly: [] }, context())).toBe('');
  });

  it('labels an unnamed point by its coordinates', async () => {
    const report = await istanbulReport();
    const output = renderCurrent(
      {
        ...report,
        location: {
          name: null,
          latitude: 41,
          longitude: 29,
          timezone: 'Europe/Istanbul',
        },
      },
      context()
    );
    expect(output.split('\n')[0]).toBe('41°N, 29°E');
  });
});
