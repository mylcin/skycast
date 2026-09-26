import { en } from './en.ts';
import { tr } from './tr.ts';
import type { Lang, Messages } from './types.ts';

export const messages: Record<Lang, Messages> = { en, tr };

export function getMessages(lang: Lang): Messages {
  return messages[lang];
}

export { isLang, LANGS } from './types.ts';
export type { Lang, Messages } from './types.ts';
