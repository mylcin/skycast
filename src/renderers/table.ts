import { padEnd, padStart, truncate, visibleWidth } from './text.ts';

export interface Cell {
  /** Plain text: measured, padded and truncated before any colour is added. */
  readonly text: string;
  readonly style?: (text: string) => string;
}

export interface Column<Row> {
  readonly header: string;
  readonly align?: 'left' | 'right';
  /**
   * Columns with a priority are dropped when the table doesn't fit, lowest
   * first. Columns without one always stay.
   */
  readonly priority?: number;
  /** Shrinks (with an ellipsis) once nothing more can be dropped. */
  readonly flexible?: boolean;
  readonly cell: (row: Row) => Cell | string;
}

export interface TableOptions {
  readonly width: number;
  readonly gap?: number;
  readonly indent?: number;
  readonly ellipsis: string;
  /** Styles the header row; omit to leave out the header. */
  readonly header?: (text: string) => string;
}

const asCell = (cell: Cell | string): Cell =>
  typeof cell === 'string' ? { text: cell } : cell;

/** Lays out rows as aligned columns that fit `width`. */
export function renderTable<Row>(
  rows: readonly Row[],
  columns: readonly Column<Row>[],
  { width, gap = 2, indent = 0, ellipsis, header }: TableOptions
): string[] {
  const cells = rows.map(row =>
    columns.map(column => asCell(column.cell(row)))
  );
  const natural = columns.map((column, c) =>
    Math.max(
      header ? visibleWidth(column.header) : 0,
      ...cells.map(row => visibleWidth(row[c]?.text ?? ''))
    )
  );

  const active = columns.map((_, c) => c);
  const total = (): number =>
    indent +
    active.reduce((sum, c) => sum + (natural[c] ?? 0), 0) +
    gap * Math.max(0, active.length - 1);

  while (total() > width) {
    let drop = -1;
    for (const c of active) {
      const priority = columns[c]?.priority;
      if (priority === undefined) continue;
      if (drop === -1 || priority <= (columns[drop]?.priority ?? Infinity))
        drop = c;
    }
    if (drop === -1) break;
    active.splice(active.indexOf(drop), 1);
  }

  const widths = [...natural];
  const flex = active.find(c => columns[c]?.flexible);
  if (flex !== undefined && total() > width) {
    const minimum = visibleWidth(ellipsis) + 1;
    const shrunk = (natural[flex] ?? 0) - (total() - width);
    // Too narrow even for "a…": leave the column out rather than overflow.
    if (shrunk < minimum) active.splice(active.indexOf(flex), 1);
    else widths[flex] = shrunk;
  }

  const line = (values: readonly Cell[]): string =>
    (
      ' '.repeat(indent) +
      active
        .map(c => {
          const column = columns[c];
          const cell = values[c] ?? { text: '' };
          const w = widths[c] ?? 0;
          const text = truncate(cell.text, w, ellipsis);
          const styled = cell.style ? cell.style(text) : text;
          return column?.align === 'right'
            ? padStart(styled, w)
            : padEnd(styled, w);
        })
        .join(' '.repeat(gap))
    ).trimEnd();

  const lines = cells.map(line);
  if (header) {
    const headerCells = columns.map(column => ({
      text: column.header,
      style: header,
    }));
    lines.unshift(line(headerCells));
  }
  return lines;
}
