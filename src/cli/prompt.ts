import { CancelledError } from '../core/errors.ts';
import type { Location } from '../core/models.ts';
import type { Messages } from '../i18n/index.ts';
import { placeLabel } from '../renderers/place.ts';
import type { Symbols } from '../renderers/symbols.ts';

/** "Paris, Texas, United States  (25K)". */
export function choiceLabel(
  place: Location,
  t: Messages,
  symbols: Symbols
): string {
  const label = placeLabel(place, t, symbols);
  if (!place.population) return label;
  const population = new Intl.NumberFormat(t.locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(place.population);
  return `${label}  (${population})`;
}

/**
 * Asks which of several places the user meant. Only called when stdin and
 * stderr are terminals; the picker draws on stderr so stdout stays clean.
 */
export async function choosePlace(
  places: readonly Location[],
  query: string,
  options: { t: Messages; symbols: Symbols; signal?: AbortSignal }
): Promise<Location> {
  const { default: select } = await import('@inquirer/select');
  try {
    const index = await select(
      {
        message: options.t.cli.choosePlace(query),
        choices: places.map((place, value) => ({
          name: choiceLabel(place, options.t, options.symbols),
          value,
        })),
        pageSize: 10,
        loop: false,
      },
      {
        input: process.stdin,
        output: process.stderr,
        clearPromptOnDone: true,
        ...(options.signal && { signal: options.signal }),
      }
    );
    const place = places[index];
    if (!place) throw new CancelledError();
    return place;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'ExitPromptError' || error.name === 'AbortPromptError')
    ) {
      throw new CancelledError();
    }
    throw error;
  }
}
