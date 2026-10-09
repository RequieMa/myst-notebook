import * as vscode from 'vscode';
import { MATH_SYMBOLS, MATH_SYMBOLS_BY_LATEX } from './mathSymbols';
import { MathSymbolStore } from './mathPalette';
import { buildMathQuickPickSections } from './core/mathQuickPickItems';

interface SymbolPickItem extends vscode.QuickPickItem {
  latex: string;
  snippet?: string;
}

export async function insertMathSymbolQuickPick(
  store: MathSymbolStore,
  insertAtCursor: (latex: string, snippet?: string) => void
): Promise<void> {
  const sections = buildMathQuickPickSections({
    stored: store.getAll(),
    recent: store.getRecent(20),
    getSymbol: (latex) => MATH_SYMBOLS_BY_LATEX.get(latex),
    builtInSymbols: MATH_SYMBOLS,
    getCount: (latex) => store.getStats(latex)?.count ?? 0,
  });

  const items: SymbolPickItem[] = [];
  for (const section of sections) {
    items.push({
      label: section.title,
      kind: vscode.QuickPickItemKind.Separator,
      latex: '',
      snippet: undefined,
    });
    for (const item of section.items) {
      items.push({
        label: item.latex,
        description: item.description,
        latex: item.latex,
        snippet: item.snippet,
      });
    }
  }

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Search math symbols…',
    matchOnDescription: true,
  });

  if (!picked || !picked.latex) return;

  insertAtCursor(picked.latex, picked.snippet);
  store.add(picked.latex);
}
