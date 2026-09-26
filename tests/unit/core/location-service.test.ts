import { describe, expect, it, vi } from 'vitest';
import { LocationNotFoundError } from '../../../src/core/errors.ts';
import { createLocationService } from '../../../src/core/location-service.ts';
import { fakeGeocoder } from '../../helpers/fakes.ts';
import { places } from '../../helpers/fixtures.ts';

describe('LocationService.resolve', () => {
  it('returns the only plausible match without asking', async () => {
    const choose = vi.fn();
    const service = createLocationService(
      fakeGeocoder(() => places('geo-istanbul-tr'))
    );
    const result = await service.resolve('İstanbul', {
      language: 'tr',
      choose,
    });
    expect(result.how).toBe('only');
    expect(result.location).toMatchObject({
      name: 'İstanbul',
      countryCode: 'TR',
    });
    expect(choose).not.toHaveBeenCalled();
  });

  it('asks when the name is ambiguous', async () => {
    const candidates = places('geo-paris-en');
    const texas = candidates.find(place => place.region === 'Texas')!;
    const choose = vi.fn(() => Promise.resolve(texas));
    const service = createLocationService(fakeGeocoder(() => candidates));
    const result = await service.resolve('Paris', { language: 'en', choose });
    expect(choose).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      how: 'chosen',
      location: { region: 'Texas' },
    });
    expect(result.alternatives).not.toContain(texas);
  });

  it('uses the best match when nobody can be asked', async () => {
    const service = createLocationService(
      fakeGeocoder(() => places('geo-paris-en'))
    );
    const result = await service.resolve('Paris', { language: 'en' });
    expect(result).toMatchObject({
      how: 'best',
      location: { countryCode: 'FR' },
    });
    expect(result.alternatives.length).toBeGreaterThan(0);
  });

  it('passes language and country through', async () => {
    const geocoder = fakeGeocoder(() => places('geo-paris-tr'));
    await createLocationService(geocoder).resolve('  Paris ', {
      language: 'tr',
      countryCode: 'FR',
    });
    expect(geocoder.queries).toEqual([
      { name: 'Paris', language: 'tr', countryCode: 'FR' },
    ]);
  });

  it('retries without a qualifier the API could not match', async () => {
    const geocoder = fakeGeocoder(query =>
      query.name === 'Paris' ? places('geo-paris-en') : []
    );
    const result = await createLocationService(geocoder).resolve(
      'Paris, Frnce',
      {
        language: 'en',
      }
    );
    expect(geocoder.queries.map(q => q.name)).toEqual([
      'Paris, Frnce',
      'Paris',
    ]);
    expect(result.location.countryCode).toBe('FR');
  });

  it('throws LocationNotFoundError when nothing matches', async () => {
    const service = createLocationService(fakeGeocoder(() => []));
    await expect(
      service.resolve('Xyzzy', { language: 'en' })
    ).rejects.toBeInstanceOf(LocationNotFoundError);
  });
});
