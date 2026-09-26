import { readFileSync } from 'node:fs';
import type { JsonBodyType } from 'msw';
import { toLocation } from '../../src/providers/open-meteo/mappers.ts';
import { geocodingResponse } from '../../src/providers/open-meteo/schemas.ts';
import type { Location } from '../../src/core/models.ts';

const root = new URL('../fixtures/open-meteo/', import.meta.url);

/** A real Open-Meteo response saved in tests/fixtures/open-meteo. */
export function fixture(name: string): JsonBodyType {
  return JSON.parse(
    readFileSync(new URL(`${name}.json`, root), 'utf8')
  ) as JsonBodyType;
}

/** Geocoding fixture mapped to domain locations. */
export function places(name: string): Location[] {
  return (geocodingResponse.parse(fixture(name)).results ?? []).map(toLocation);
}
