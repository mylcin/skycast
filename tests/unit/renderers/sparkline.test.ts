import { describe, expect, it } from 'vitest';
import { downsample, sparkline } from '../../../src/renderers/sparkline.ts';

const levels = ['1', '2', '3', '4', '5', '6', '7', '8'];

describe('sparkline', () => {
  it('scales to the data range', () => {
    expect(sparkline([0, 5, 10], { levels }).join('')).toBe('158');
  });

  it('uses a fixed scale when given', () => {
    expect(sparkline([0, 50, 100], { levels, min: 0, max: 100 }).join('')).toBe(
      '158'
    );
    expect(sparkline([150, -10], { levels, min: 0, max: 100 }).join('')).toBe(
      '81'
    );
  });

  it('leaves gaps for missing values and draws a flat series mid-height', () => {
    expect(sparkline([3, null, 3], { levels }).join('')).toBe('4 4');
    expect(sparkline([null, null], { levels }).join('')).toBe('  ');
  });
});

describe('downsample', () => {
  it('averages equal groups', () => {
    expect(downsample([1, 3, 5, 7], 2)).toEqual([2, 6]);
    expect(downsample([1, 2, 3, 4, 5], 2)).toEqual([2, 4.5]);
    expect(downsample([1, null, null, null], 2)).toEqual([1, null]);
    expect(downsample([1, 2], 5)).toEqual([1, 2]);
  });
});
