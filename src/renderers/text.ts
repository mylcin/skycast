import stringWidth from 'fast-string-width';

/** Columns a string occupies in a terminal, ignoring ANSI codes. */
export function visibleWidth(text: string): number {
  return stringWidth(text);
}

export function padEnd(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - visibleWidth(text)));
}

export function padStart(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - visibleWidth(text))) + text;
}

/** Shortens plain text to `width` columns, ending with the ellipsis. */
export function truncate(
  text: string,
  width: number,
  ellipsis: string
): string {
  if (visibleWidth(text) <= width) return text;
  if (width <= visibleWidth(ellipsis))
    return ellipsis.slice(0, Math.max(0, width));
  let result = '';
  for (const char of text) {
    if (visibleWidth(result + char + ellipsis) > width) break;
    result += char;
  }
  return result.trimEnd() + ellipsis;
}

/** Word-wraps plain text to `width` columns. Words longer than a line are split. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word;
    while (visibleWidth(rest) > width) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(rest.slice(0, width));
      rest = rest.slice(width);
    }
    if (!line) line = rest;
    else if (visibleWidth(`${line} ${rest}`) <= width) line = `${line} ${rest}`;
    else {
      lines.push(line);
      line = rest;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Places two blocks of lines side by side. */
export function sideBySide(
  left: readonly string[],
  right: readonly string[],
  leftWidth: number,
  gap: number
): string[] {
  const height = Math.max(left.length, right.length);
  return Array.from({ length: height }, (_, i) =>
    `${padEnd(left[i] ?? '', leftWidth)}${' '.repeat(gap)}${right[i] ?? ''}`.trimEnd()
  );
}

/**
 * Joins parts with a separator, starting a new line whenever the next part
 * would pass `width`. Parts may contain ANSI codes; they are never split.
 */
export function joinFitting(
  parts: readonly string[],
  separator: string,
  width: number
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const part of parts) {
    if (!line) line = part;
    else if (visibleWidth(line + separator + part) <= width)
      line += separator + part;
    else {
      lines.push(line);
      line = part;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Joins as many parts as fit on one line, dropping from the end. The first
 * `keep` parts always stay.
 */
export function fitLine(
  parts: readonly string[],
  separator: string,
  width: number,
  keep = 1
): string {
  let count = parts.length;
  while (
    count > keep &&
    visibleWidth(parts.slice(0, count).join(separator)) > width
  )
    count--;
  return parts.slice(0, count).join(separator);
}
