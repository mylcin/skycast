import { describe, expect, it } from 'vitest';
import { createWeatherService } from '../../../src/core/weather-service.ts';
import { fakeWeather, sampleForecast } from '../../helpers/fakes.ts';

const istanbul = {
  name: 'Istanbul',
  latitude: 41.01,
  longitude: 28.95,
  countryCode: 'TR',
};
const point = { name: null, latitude: 1, longitude: 2 };

describe('WeatherService.reports', () => {
  it('fetches all locations in one provider call and keeps the order', async () => {
    const weather = fakeWeather(i => sampleForecast({ timezone: `Zone/${i}` }));
    const service = createWeatherService({ weather });
    const reports = await service.reports(
      [istanbul, point],
      { current: true, days: 1, hours: 0 },
      { units: 'metric' }
    );
    expect(weather.requests).toHaveLength(1);
    expect(reports.map(r => r.timezone)).toEqual(['Zone/0', 'Zone/1']);
  });

  it('fills the location timezone from the forecast', async () => {
    const service = createWeatherService({ weather: fakeWeather() });
    const [report] = await service.reports(
      [point],
      { current: true, days: 1, hours: 0 },
      { units: 'metric' }
    );
    expect(report?.location.timezone).toBe('Europe/Istanbul');
  });

  it('converts units', async () => {
    const service = createWeatherService({ weather: fakeWeather() });
    const [report] = await service.reports(
      [istanbul],
      { current: true, days: 1, hours: 0 },
      { units: 'imperial' }
    );
    expect(report?.units).toBe('imperial');
    expect(report?.current?.temperature).toBe(68);
  });

  it('clamps the request to what the provider supports', async () => {
    const weather = fakeWeather();
    const service = createWeatherService({ weather });
    await service.reports(
      [istanbul],
      { current: false, days: 99, hours: -5 },
      { units: 'metric' }
    );
    expect(weather.requests[0]?.request).toEqual({
      current: false,
      days: 16,
      hours: 0,
    });
  });

  it('credits geocoding only for named places', async () => {
    const service = createWeatherService({
      weather: fakeWeather(),
      geocodingAttribution: { text: 'Places', url: 'https://example.com' },
    });
    const [named, bare] = await service.reports(
      [istanbul, point],
      { current: true, days: 1, hours: 0 },
      { units: 'metric' }
    );
    expect(named?.attribution.map(a => a.text)).toEqual([
      'Fake weather',
      'Places',
    ]);
    expect(bare?.attribution.map(a => a.text)).toEqual(['Fake weather']);
  });

  it('returns nothing for no locations without calling the provider', async () => {
    const weather = fakeWeather();
    const reports = await createWeatherService({ weather }).reports(
      [],
      { current: true, days: 1, hours: 0 },
      { units: 'metric' }
    );
    expect(reports).toEqual([]);
    expect(weather.requests).toHaveLength(0);
  });
});
