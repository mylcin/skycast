export interface SparklineOptions {
  /** Characters from lowest to highest. */
  readonly levels: readonly string[];
  /** Fixed scale (e.g. 0–100 for probabilities); defaults to the data range. */
  readonly min?: number;
  readonly max?: number;
}

/**
 * One character per value. Missing values leave a gap; a flat series draws
 * a middle bar rather than pretending everything is at the bottom.
 */
export function sparkline(
  values: readonly (number | null)[],
  options: SparklineOptions
): string[] {
  const known = values.filter((v): v is number => v !== null);
  const min = options.min ?? Math.min(...known);
  const max = options.max ?? Math.max(...known);
  const top = options.levels.length - 1;
  return values.map(value => {
    if (value === null || known.length === 0) return ' ';
    const level =
      max === min
        ? Math.floor(top / 2)
        : Math.round(
            ((Math.min(Math.max(value, min), max) - min) / (max - min)) * top
          );
    return options.levels[level] ?? ' ';
  });
}

/**
 * Averages consecutive values into `buckets` equal groups (the last may be
 * shorter), for series wider than the screen.
 */
export function downsample(
  values: readonly (number | null)[],
  buckets: number
): (number | null)[] {
  if (values.length <= buckets) return [...values];
  const size = Math.ceil(values.length / buckets);
  return Array.from({ length: Math.ceil(values.length / size) }, (_, i) => {
    const group = values
      .slice(i * size, (i + 1) * size)
      .filter((v): v is number => v !== null);
    return group.length
      ? group.reduce((sum, v) => sum + v, 0) / group.length
      : null;
  });
}
