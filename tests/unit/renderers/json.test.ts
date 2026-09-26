import { describe, expect, it } from 'vitest';
import { en } from '../../../src/i18n/en.ts';
import { tr } from '../../../src/i18n/tr.ts';
import {
  JSON_SCHEMA_VERSION,
  renderJson,
  reportJson,
} from '../../../src/renderers/json.ts';
import { istanbulReport } from '../../helpers/reports.ts';

describe('JSON output', () => {
  it('has a versioned, documented shape', async () => {
    const json = JSON.parse(
      renderJson(reportJson(await istanbulReport(), en))
    ) as Record<string, unknown>;
    expect(json.schemaVersion).toBe(JSON_SCHEMA_VERSION);
    expect(Object.keys(json)).toEqual([
      'schemaVersion',
      'location',
      'units',
      'current',
      'daily',
      'hourly',
      'meta',
      'attribution',
    ]);
    expect(json.units).toEqual({
      system: 'metric',
      temperature: '°C',
      speed: 'km/h',
      precipitation: 'mm',
      pressure: 'hPa',
    });
    expect(json.current).toMatchObject({
      temperature: 19.4,
      weatherCode: 3,
      condition: 'cloudy',
      description: 'Overcast',
    });
    expect(json.meta).toEqual({
      fetchedAt: '2026-09-26T21:30:00.000Z',
      cached: false,
      stale: false,
    });
    expect(json.attribution).toHaveLength(2);
  });

  it('uses the requested units and language', async () => {
    const json = reportJson(await istanbulReport('imperial', 'tr'), tr) as {
      units: { system: string };
      current: { temperature: number; description: string };
      location: { name: string };
    };
    expect(json.units.system).toBe('imperial');
    expect(json.current.temperature).toBe(66.9);
    expect(json.current.description).toBe('Kapalı');
    expect(json.location.name).toBe('İstanbul');
  });

  it('leaves out unknown fields and keeps nulls', async () => {
    const report = await istanbulReport();
    const text = renderJson(
      reportJson(
        { ...report, location: { name: null, latitude: 1, longitude: 2 } },
        en
      )
    );
    const json = JSON.parse(text) as { location: Record<string, unknown> };
    expect(json.location).toEqual({ name: null, latitude: 1, longitude: 2 });
    expect(text.endsWith('}\n')).toBe(true);
  });
});
