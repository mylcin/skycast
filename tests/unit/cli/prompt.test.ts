import { describe, expect, it, vi } from 'vitest';
import { CancelledError } from '../../../src/core/errors.ts';
import { en } from '../../../src/i18n/en.ts';
import { getSymbols } from '../../../src/renderers/symbols.ts';

const select = vi.fn();
vi.mock('@inquirer/select', () => ({ default: select }));

const { choiceLabel, choosePlace } = await import('../../../src/cli/prompt.ts');

const paris = {
  name: 'Paris',
  region: 'Île-de-France',
  countryCode: 'FR',
  latitude: 48.85,
  longitude: 2.35,
  population: 2138551,
};
const texas = {
  name: 'Paris',
  region: 'Texas',
  countryCode: 'US',
  latitude: 33.66,
  longitude: -95.55,
  population: 24782,
};
const symbols = getSymbols(true);

describe('choiceLabel', () => {
  it('tells namesakes apart by region, country and size', () => {
    expect(choiceLabel(paris, en, symbols)).toBe(
      'Paris, Île-de-France, France  (2.1M)'
    );
    expect(
      choiceLabel({ ...texas, population: undefined } as never, en, symbols)
    ).toBe('Paris, Texas, United States');
  });
});

describe('choosePlace', () => {
  it('asks on stderr and returns the chosen place', async () => {
    select.mockResolvedValueOnce(1);
    const place = await choosePlace([paris, texas], 'Paris', {
      t: en,
      symbols,
    });
    expect(place).toBe(texas);
    const [config, context] = select.mock.calls[0] as [
      { message: string; choices: { name: string }[] },
      { output: unknown },
    ];
    expect(config.message).toBe('Which “Paris”?');
    expect(config.choices.map(c => c.name)).toEqual([
      'Paris, Île-de-France, France  (2.1M)',
      'Paris, Texas, United States  (24.8K)',
    ]);
    expect(context.output).toBe(process.stderr);
  });

  it('turns Ctrl+C into a quiet cancel', async () => {
    select.mockRejectedValueOnce(
      Object.assign(new Error('closed'), { name: 'ExitPromptError' })
    );
    await expect(
      choosePlace([paris], 'Paris', { t: en, symbols })
    ).rejects.toBeInstanceOf(CancelledError);
  });

  it('lets other errors through', async () => {
    select.mockRejectedValueOnce(new RangeError('boom'));
    await expect(
      choosePlace([paris], 'Paris', { t: en, symbols })
    ).rejects.toThrow('boom');
  });
});
