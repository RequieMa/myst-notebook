/** Math-symbol QuickPick section builders. Pure module — no VS Code imports. */
import type { MathSymbol } from '../mathSymbols';

export interface MathQuickPickItem {
  latex: string;
  description: string;
  snippet?: string;
}

export interface MathQuickPickSection {
  title: string;
  items: MathQuickPickItem[];
}

export interface MathQuickPickInput {
  /** All stored latex strings, in no particular order (store.getAll()). */
  stored: string[];
  /** Recently used latex strings, already sorted most-relevant first (store.getRecent(n)). */
  recent: string[];
  /** Look up a built-in symbol by its latex key. Undefined → custom/saved symbol. */
  getSymbol: (latex: string) => MathSymbol | undefined;
  /** All built-in symbols in display order (for the "All symbols" section). */
  builtInSymbols: readonly MathSymbol[];
  /** Usage count for a stored latex (0 = merely seen, >0 = explicitly saved/used). */
  getCount: (latex: string) => number;
}

/**
 * Build the QuickPick sections for the math-symbol picker (Ctrl+Shift+M).
 *
 * - "Recently used" — recent symbols, built-in ones described with their
 *   unicode glyph + description, custom ones labelled `saved`.
 * - "Saved symbols" — custom (non-built-in) symbols with a positive usage
 *   count, so user-saved snippets always surface even when they fall outside
 *   the recency window. Symbols already shown under "Recently used" are
 *   omitted here to avoid duplication.
 * - "All symbols" — remaining built-in symbols not already in the recent list.
 *
 * Empty sections are dropped.
 */
export function buildMathQuickPickSections(input: MathQuickPickInput): MathQuickPickSection[] {
  const { stored, recent, getSymbol, builtInSymbols, getCount } = input;
  const recentSet = new Set(recent);

  const recentItems: MathQuickPickItem[] = recent
    .map((latex) => {
      const sym = getSymbol(latex);
      return {
        latex,
        description: sym
          ? `${sym.unicode ?? ''} — ${sym.description}`
          : getCount(latex) > 0
            ? 'saved'
            : '',
        snippet: sym?.snippet,
      };
    })
    .filter((item) => item.latex);

  const savedItems: MathQuickPickItem[] = stored
    .filter((latex) => !getSymbol(latex) && getCount(latex) > 0 && !recentSet.has(latex))
    .map((latex) => ({ latex, description: 'saved', snippet: undefined }));

  const allItems: MathQuickPickItem[] = builtInSymbols
    .filter((sym) => !recentSet.has(sym.latex))
    .map((sym) => ({
      latex: sym.latex,
      description: `${sym.unicode ?? ''} — ${sym.description}`,
      snippet: sym.snippet,
    }));

  const sections: MathQuickPickSection[] = [];
  if (recentItems.length > 0) sections.push({ title: 'Recently used', items: recentItems });
  if (savedItems.length > 0) sections.push({ title: 'Saved symbols', items: savedItems });
  if (allItems.length > 0) sections.push({ title: 'All symbols', items: allItems });
  return sections;
}
