import * as vscode from 'vscode';
import { MATH_SYMBOLS } from './mathSymbols';
import { MathSymbolStore } from './mathPalette';

interface SymbolPickItem extends vscode.QuickPickItem {
  latex: string;
}

export async function insertMathSymbolQuickPick(
  store: MathSymbolStore,
  insertAtCursor: (latex: string) => void
): Promise<void> {
  const recent = store.getRecent(20);
  const recentSet = new Set(recent);

  const recentItems: SymbolPickItem[] = recent.map(latex => {
    const sym = MATH_SYMBOLS.find(s => s.latex === latex);
    return {
      label: latex,
      description: sym ? `${sym.unicode ?? ''} — ${sym.description}` : '',
      latex,
    };
  });

  const allItems: SymbolPickItem[] = MATH_SYMBOLS
    .filter(sym => !recentSet.has(sym.latex))
    .map(sym => ({
      label: sym.latex,
      description: `${sym.unicode ?? ''} — ${sym.description}`,
      latex: sym.latex,
    }));

  const items: SymbolPickItem[] = [
    ...(recentItems.length > 0
      ? [{ label: 'Recently used', kind: vscode.QuickPickItemKind.Separator, latex: '' }]
      : []),
    ...recentItems,
    ...(allItems.length > 0
      ? [{ label: 'All symbols', kind: vscode.QuickPickItemKind.Separator, latex: '' }]
      : []),
    ...allItems,
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Search math symbols…',
    matchOnDescription: true,
  });

  if (!picked || !picked.latex) return;

  insertAtCursor(picked.latex);
  store.add(picked.latex);
}
