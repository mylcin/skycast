import { describe, expect, it } from 'vitest';
import { createPaint } from '../../../src/renderers/paint.ts';
import {
  fitLine,
  joinFitting,
  padEnd,
  padStart,
  sideBySide,
  truncate,
  visibleWidth,
  wrap,
} from '../../../src/renderers/text.ts';

const red = (s: string) => createPaint(3).error(s);

describe('width', () => {
  it('ignores ANSI codes and counts wide characters', () => {
    expect(visibleWidth(red('abc'))).toBe(3);
    expect(visibleWidth('東京')).toBe(4);
    expect(visibleWidth('İstanbul')).toBe(8);
  });

  it('pads by visible width', () => {
    expect(padEnd(red('ab'), 4)).toBe(`${red('ab')}  `);
    expect(padStart('ab', 4)).toBe('  ab');
    expect(padEnd('abcdef', 3)).toBe('abcdef');
  });
});

describe('truncate', () => {
  it('adds an ellipsis only when needed', () => {
    expect(truncate('Thunderstorm', 20, '…')).toBe('Thunderstorm');
    expect(truncate('Thunderstorm', 8, '…')).toBe('Thunder…');
    expect(truncate('Light showers', 7, '...')).toBe('Ligh...');
    expect(truncate('abc', 1, '...')).toBe('.');
  });
});

describe('wrap', () => {
  it('breaks between words and splits words longer than a line', () => {
    expect(wrap('one two three', 7)).toEqual(['one two', 'three']);
    expect(wrap('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrap('  spaced   out  ', 20)).toEqual(['spaced out']);
  });
});

describe('joinFitting', () => {
  it('starts a new line instead of splitting a part', () => {
    expect(joinFitting(['aaa', 'bbb', 'ccc'], ' · ', 10)).toEqual([
      'aaa · bbb',
      'ccc',
    ]);
    expect(joinFitting([red('aaa'), 'bbb'], ' · ', 9)).toEqual([
      `${red('aaa')} · bbb`,
    ]);
    expect(joinFitting([], ' ', 10)).toEqual([]);
  });
});

describe('fitLine', () => {
  it('drops trailing parts but keeps the first ones', () => {
    expect(fitLine(['Paris', '18°C', 'Overcast', '70%'], '  ', 20)).toBe(
      'Paris  18°C'
    );
    expect(fitLine(['Paris', '18°C', 'Overcast'], '  ', 4, 2)).toBe(
      'Paris  18°C'
    );
  });
});

describe('sideBySide', () => {
  it('aligns the right block and trims trailing space', () => {
    expect(sideBySide(['ab', 'c'], ['x', 'y', 'z'], 3, 1)).toEqual([
      'ab  x',
      'c   y',
      '    z',
    ]);
  });
});
