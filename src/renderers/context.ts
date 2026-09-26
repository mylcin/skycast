import type { Messages } from '../i18n/index.ts';
import type { Paint } from './paint.ts';
import type { Symbols } from './symbols.ts';

/** Everything a renderer needs besides the data. Renderers are pure. */
export interface RenderContext {
  readonly t: Messages;
  readonly paint: Paint;
  readonly symbols: Symbols;
  /** Terminal columns available. */
  readonly width: number;
}
