/** Characters that have an ASCII fallback for terminals without Unicode. */
export interface Symbols {
  readonly ellipsis: string;
  readonly separator: string;
  readonly dash: string;
  readonly degree: string;
  /** Arrows pointing where the wind blows to: N, NE, E … NW. Empty in ASCII. */
  readonly arrows: readonly string[];
  /** Eight levels, low to high. */
  readonly spark: readonly string[];
  readonly barFill: string;
  readonly barTrack: string;
}

const unicode: Symbols = {
  ellipsis: '…',
  separator: '·',
  dash: '–',
  degree: '°',
  arrows: ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'],
  spark: ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'],
  barFill: '━',
  barTrack: '─',
};

const ascii: Symbols = {
  ellipsis: '...',
  separator: '|',
  dash: '-',
  // ° is Latin-1 and survives even the old Windows console.
  degree: '°',
  // ASCII has no unambiguous diagonal arrows; the compass point says it.
  arrows: [],
  spark: ['_', '.', ',', '-', '~', '+', '*', '#'],
  barFill: '=',
  barTrack: '-',
};

export function getSymbols(supportsUnicode: boolean): Symbols {
  return supportsUnicode ? unicode : ascii;
}
