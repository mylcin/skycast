/**
 * Renders README screenshots from the real CLI: runs commands against the
 * fixture server in truecolor and turns the ANSI output into SVG.
 *
 *   node scripts/screenshot.ts
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/cli/run.ts';
import { startFixtureServer } from './fixture-server.ts';

const COLUMNS = 84;
const CHAR = 8.4;
const LINE = 20;
const PAD = 22;
const BAR = 30;

const THEME = {
  background: '#1e1e2e',
  foreground: '#cdd6f4',
  prompt: '#a6adc8',
  basic: {
    31: '#f38ba8',
    32: '#a6e3a1',
    33: '#f9e2af',
    34: '#89b4fa',
    35: '#cba6f7',
    36: '#89dceb',
    90: '#7f849c',
  } as Record<number, string>,
};

interface Style {
  color?: string;
  bold?: boolean;
  dim?: boolean;
}

const ESC = '\u001b';
const SGR_SPLIT = new RegExp(`(${ESC}\\[[\\d;]*m)`);
const SGR = new RegExp(`^${ESC}\\[([\\d;]*)m$`);

/** Splits a line into styled runs, following the SGR codes ansis emits. */
function parse(line: string): { text: string; style: Style }[] {
  const runs: { text: string; style: Style }[] = [];
  let style: Style = {};
  for (const part of line.split(SGR_SPLIT)) {
    const sgr = SGR.exec(part);
    if (!sgr) {
      if (part) runs.push({ text: part, style: { ...style } });
      continue;
    }
    const codes = (sgr[1] ?? '0').split(';').map(Number);
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i] ?? 0;
      if (code === 0) style = {};
      else if (code === 1) style.bold = true;
      else if (code === 2) style.dim = true;
      else if (code === 22) style = { ...style, bold: false, dim: false };
      else if (code === 39) delete style.color;
      else if (code === 38 && codes[i + 1] === 2) {
        const [r, g, b] = codes.slice(i + 2, i + 5);
        style.color = `rgb(${r},${g},${b})`;
        i += 4;
      } else if (THEME.basic[code]) style.color = THEME.basic[code];
    }
  }
  return runs;
}

const escape = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** One SVG "terminal window" with a prompt line and the output. */
function toSvg(command: string, output: string): string {
  const lines = output.replace(/\n$/, '').split('\n');
  const height = BAR + PAD * 2 + LINE * (lines.length + 2);
  const width = PAD * 2 + CHAR * COLUMNS;
  const text = (
    row: number,
    runs: { text: string; style: Style }[]
  ): string => {
    let col = 0;
    const spans = runs.flatMap(({ text: chunk, style }) => {
      const chars = Array.from(chunk);
      // One x per visible character keeps columns aligned whatever font
      // renders it; spaces are left out, since SVG would collapse them.
      const visible = chars
        .map((char, i) => ({ char, x: PAD + (col + i) * CHAR }))
        .filter(({ char }) => char !== ' ');
      col += chars.length;
      if (visible.length === 0) return [];
      const attrs = [
        `x="${visible.map(({ x }) => x.toFixed(1)).join(' ')}"`,
        style.color ? `fill="${style.color}"` : '',
        style.bold ? 'font-weight="700"' : '',
        style.dim ? 'fill-opacity="0.55"' : '',
      ].filter(Boolean);
      const content = escape(visible.map(({ char }) => char).join(''));
      return [`<tspan ${attrs.join(' ')}>${content}</tspan>`];
    });
    return `<text y="${BAR + PAD + LINE * row + 14}">${spans.join('')}</text>`;
  };
  const rows = [
    text(0, [
      { text: '$ ', style: { color: THEME.prompt } },
      { text: command, style: { bold: true } },
    ]),
    ...lines.map((line, i) => text(i + 2, parse(line))),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(command)}">
<rect width="100%" height="100%" rx="10" fill="${THEME.background}"/>
<circle cx="${PAD}" cy="${BAR / 2 + 4}" r="5.5" fill="#f38ba8"/><circle cx="${PAD + 18}" cy="${BAR / 2 + 4}" r="5.5" fill="#f9e2af"/><circle cx="${PAD + 36}" cy="${BAR / 2 + 4}" r="5.5" fill="#a6e3a1"/>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" font-size="14" fill="${THEME.foreground}" xml:space="preserve">
${rows.join('\n')}
</g>
</svg>
`;
}

// A fixed clock on both sides keeps the pictures identical between runs.
const NOW = new Date('2026-09-26T21:30:00Z');
const server = await startFixtureServer(0, () => NOW);
const home = mkdtempSync(join(tmpdir(), 'skycast-shots-'));

async function capture(args: string[]): Promise<string> {
  let stdout = '';
  const stream = {
    write: (text: string) => ((stdout += text), true),
    isTTY: true,
    columns: COLUMNS,
    getColorDepth: () => 24,
  };
  await run(
    args,
    {
      stdout: stream,
      stderr: { write: () => true, isTTY: false },
      stdin: { isTTY: false },
      env: {
        LANG: 'en_US.UTF-8',
        TZ: 'Europe/Istanbul',
        COLUMNS: String(COLUMNS),
        SKYCAST_FORECAST_URL: server.forecastUrl,
        SKYCAST_GEOCODING_URL: server.geocodingUrl,
        SKYCAST_CONFIG_DIR: join(home, 'config'),
        SKYCAST_CACHE_DIR: join(home, 'cache'),
      },
      platform: 'darwin',
    },
    { now: () => NOW }
  );
  return stdout;
}

const shots: [string, string[]][] = [
  ['now', ['now', 'Istanbul']],
  ['forecast', ['forecast', 'Istanbul']],
  ['hourly', ['hourly', 'Istanbul', '--hours', '24', '--compact']],
  ['compare', ['compare', 'Istanbul', 'Paris, France', 'New York']],
  ['now-tr', ['now', 'İstanbul', '--lang', 'tr']],
];
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
for (const [name, args] of shots) {
  const command = `skycast ${args.map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`;
  writeFileSync(
    new URL(`../docs/${name}.svg`, import.meta.url),
    toSvg(command, await capture(args))
  );
  process.stdout.write(`docs/${name}.svg\n`);
}
await server.close();
