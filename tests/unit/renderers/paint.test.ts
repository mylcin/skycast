import { describe, expect, it } from 'vitest';
import {
  createPaint,
  temperatureRgb,
  toCelsius,
} from '../../../src/renderers/paint.ts';

describe('temperatureRgb', () => {
  it('clamps to the ends of the scale', () => {
    expect(temperatureRgb(-60)).toEqual(temperatureRgb(-20));
    expect(temperatureRgb(60)).toEqual(temperatureRgb(35));
  });

  it('interpolates between stops', () => {
    expect(temperatureRgb(15)).toEqual([90, 200, 110]);
    expect(temperatureRgb(18.5)).toEqual([153, 195, 85]);
  });

  it('warms up monotonically in the red channel from mild to hot', () => {
    const reds = [15, 20, 25, 30, 35].map(c => temperatureRgb(c)[0]);
    expect(reds).toEqual([...reds].sort((a, b) => a - b));
  });
});

describe('createPaint', () => {
  it('adds nothing at level 0', () => {
    const paint = createPaint(0);
    expect(
      paint.bold('x') +
        paint.temperature(30, 'metric', 'y') +
        paint.rain(90, 'z')
    ).toBe('xyz');
  });

  it('downgrades truecolor to the terminal level', () => {
    const ESC = '\u001b[';
    expect(createPaint(3).temperature(30, 'metric', 'x')).toContain(
      `${ESC}38;2;`
    );
    expect(createPaint(2).temperature(30, 'metric', 'x')).toContain(
      `${ESC}38;5;`
    );
    // 16 colours: a bright foreground code (90–97).
    expect(createPaint(1).temperature(30, 'metric', 'x')).toContain(`${ESC}9`);
  });

  it('colours imperial temperatures on the same scale', () => {
    const paint = createPaint(3);
    expect(paint.temperature(86, 'imperial', 'x')).toBe(
      paint.temperature(30, 'metric', 'x')
    );
    expect(toCelsius(212, 'imperial')).toBe(100);
  });

  it('only colours likely rain strongly', () => {
    const paint = createPaint(3);
    expect(paint.rain(10, 'x')).toBe(paint.dim('x'));
    expect(paint.rain(70, 'x')).not.toBe(paint.rain(40, 'x'));
  });
});
