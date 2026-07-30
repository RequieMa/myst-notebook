import * as vscode from 'vscode';
import { MATH_SYMBOLS, MATH_SYMBOLS_BY_LATEX } from './mathSymbols';
import { MathSymbolStore } from './mathPalette';

interface SymbolPickItem extends vscode.QuickPickItem {
  latex: string;
  snippet?: string;
}

export async function insertMathSymbolQuickPick(
  store: MathSymbolStore,
  insertAtCursor: (latex: string, snippet?: string) => void
): Promise<void> {
  const recent = store.getRecent(20);
  const recentSet = new Set(recent);

  // Use MATH_SYMBOLS_BY_LATEX for O(1) lookup on large lists
  const recentItems: SymbolPickItem[] = recent
    .map(latex => {
      const sym = MATH_SYMBOLS_BY_LATEX.get(latex);
      return {
        label: latex,
        description: sym ? `${sym.unicode ?? ''} — ${sym.description}` : '',
        latex,
        snippet: sym?.snippet,
      };
    })
    .filter(item => item.label); // skip symbols not in built-in list

  const allItems: SymbolPickItem[] = MATH_SYMBOLS
    .filter(sym => !recentSet.has(sym.latex))
    .map(sym => ({
      label: sym.latex,
      description: `${sym.unicode ?? ''} — ${sym.description}`,
      latex: sym.latex,
      snippet: sym.snippet,
    }));

  const items: SymbolPickItem[] = [
    ...(recentItems.length > 0
      ? [{ label: 'Recently used', kind: vscode.QuickPickItemKind.Separator, latex: '', snippet: undefined }]
      : []),
    ...recentItems,
    ...(allItems.length > 0
      ? [{ label: 'All symbols', kind: vscode.QuickPickItemKind.Separator, latex: '', snippet: undefined }]
      : []),
    ...allItems,
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Search math symbols…',
    matchOnDescription: true,
  });

  if (!picked || !picked.latex) return;

  insertAtCursor(picked.latex, picked.snippet);
  store.add(picked.latex);
}
