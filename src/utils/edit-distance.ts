/** Levenshtein distance: the fewest single-character edits from a to b. */
export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j] ?? 0;
      row[j] = Math.min(
        current + 1,
        (row[j - 1] ?? 0) + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      previous = current;
    }
  }
  return row[b.length] ?? 0;
}

/** Candidates within `max` edits of `word`, closest first. */
export function closest(
  word: string,
  candidates: readonly string[],
  max: number
): string[] {
  return candidates
    .map(candidate => ({ candidate, distance: editDistance(word, candidate) }))
    .filter(({ distance }) => distance <= max)
    .sort((a, b) => a.distance - b.distance)
    .map(({ candidate }) => candidate);
}
