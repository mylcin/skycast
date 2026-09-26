import { describe, expect, it } from 'vitest';
import {
  conditionGroup,
  isPrecipitation,
  WMO_CODES,
} from '../../../src/core/conditions.ts';

describe('conditionGroup', () => {
  it('maps every documented WMO code to a known group', () => {
    for (const code of WMO_CODES) {
      expect(conditionGroup(code)).not.toBe('unknown');
    }
  });

  it.each([
    [0, 'clear'],
    [2, 'partly-cloudy'],
    [3, 'cloudy'],
    [48, 'fog'],
    [55, 'drizzle'],
    [66, 'freezing-rain'],
    [82, 'heavy-rain'],
    [86, 'heavy-snow'],
    [99, 'thunderstorm'],
  ] as const)('code %i is %s', (code, group) => {
    expect(conditionGroup(code)).toBe(group);
  });

  it('treats unknown and missing codes as unknown', () => {
    expect(conditionGroup(4)).toBe('unknown');
    expect(conditionGroup(null)).toBe('unknown');
  });

  it('knows which groups are wet', () => {
    expect(isPrecipitation('rain')).toBe(true);
    expect(isPrecipitation('thunderstorm')).toBe(true);
    expect(isPrecipitation('fog')).toBe(false);
  });
});
