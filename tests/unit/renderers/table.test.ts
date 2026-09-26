import { describe, expect, it } from 'vitest';
import { createPaint } from '../../../src/renderers/paint.ts';
import { renderTable, type Column } from '../../../src/renderers/table.ts';
import { visibleWidth } from '../../../src/renderers/text.ts';

interface Row {
  name: string;
  temp: number;
  note: string;
  wind: string;
}

const rows: Row[] = [
  { name: 'Istanbul', temp: 19, note: 'Overcast', wind: '18 km/h' },
  { name: 'Paris', temp: 8, note: 'Light showers', wind: '5 km/h' },
];

const columns: Column<Row>[] = [
  { header: 'Place', cell: r => r.name },
  { header: 'Now', align: 'right', cell: r => `${r.temp}°` },
  { header: 'Condition', flexible: true, cell: r => r.note },
  { header: 'Wind', priority: 0, cell: r => r.wind },
];

describe('renderTable', () => {
  it('aligns columns and right-aligns numbers', () => {
    expect(
      renderTable(rows, columns, { width: 80, ellipsis: '…', header: s => s })
    ).toEqual([
      'Place     Now  Condition      Wind',
      'Istanbul  19°  Overcast       18 km/h',
      'Paris      8°  Light showers  5 km/h',
    ]);
  });

  it('drops low-priority columns first, then shrinks the flexible one', () => {
    const narrow = renderTable(rows, columns, { width: 26, ellipsis: '…' });
    expect(narrow).toEqual([
      'Istanbul  19°  Overcast',
      'Paris      8°  Light show…',
    ]);
    expect(Math.max(...narrow.map(visibleWidth))).toBeLessThanOrEqual(26);
  });

  it('measures plain text so colour never shifts columns', () => {
    const paint = createPaint(3);
    const styled: Column<Row>[] = [
      { header: 'Place', cell: r => ({ text: r.name, style: paint.bold }) },
      {
        header: 'Now',
        align: 'right',
        cell: r => ({ text: `${r.temp}°`, style: paint.error }),
      },
    ];
    const lines = renderTable(rows, styled, { width: 80, ellipsis: '…' });
    expect(lines.map(visibleWidth)).toEqual([13, 13]);
  });

  it('respects indent and gap', () => {
    const [line] = renderTable([rows[0]!], columns.slice(0, 2), {
      width: 80,
      ellipsis: '…',
      gap: 1,
      indent: 2,
    });
    expect(line).toBe('  Istanbul 19°');
  });
});
