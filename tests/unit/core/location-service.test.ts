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

  it('resolves a country to its capital when the API knows it', async () => {
    const geocoder = fakeGeocoder(query =>
      query.countryCode === 'MX'
        ? places('geo-mexico-mx-en')
        : places('geo-mexico-en')
    );
    const result = await createLocationService(geocoder).resolve('Mexico', {
      language: 'en',
    });
    expect(result.location).toMatchObject({
      name: 'Mexico City',
      featureCode: 'PPLC',
    });
    expect(geocoder.queries[1]).toMatchObject({
      name: 'Mexico',
      countryCode: 'MX',
      limit: 20,
    });
  });

  it('keeps the country when no capital shares its name', async () => {
    const geocoder = fakeGeocoder(query =>
      query.countryCode === 'GE'
        ? places('geo-georgia-ge-en')
        : places('geo-georgia-en')
    );
    const result = await createLocationService(geocoder).resolve('Georgia', {
      language: 'en',
    });
    expect(result.location).toMatchObject({
      name: 'Georgia',
      featureCode: 'PCLI',
    });
  });

  it('applies a qualifier the API could not match ("Perth, UK")', async () => {
    const geocoder = fakeGeocoder(query =>
      query.name === 'Perth'
        ? places('geo-perth-en')
        : places('geo-perth-uk-en')
    );
    const result = await createLocationService(geocoder).resolve('Perth, UK', {
      language: 'en',
    });
    expect(result).toMatchObject({
      how: 'only',
      location: { region: 'Scotland' },
    });
  });

  it('does not guess silently when nothing fits the qualifier', async () => {
    const geocoder = fakeGeocoder(query =>
      query.name === 'Paris' ? places('geo-paris-en') : []
    );
    const result = await createLocationService(geocoder).resolve(
      'Paris, Tenessee',
      {
        language: 'en',
      }
    );
    expect(result.how).toBe('best');
  });

  it('throws LocationNotFoundError when nothing matches', async () => {
    const service = createLocationService(fakeGeocoder(() => []));
    await expect(
      service.resolve('Xyzzy', { language: 'en' })
    ).rejects.toBeInstanceOf(LocationNotFoundError);
  });
});
