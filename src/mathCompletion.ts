import * as vscode from 'vscode';
import { MATH_SYMBOLS } from './mathSymbols';
import { MathSymbolStore } from './mathPalette';
import { isInsideMathContext } from './mathContextDetector';


export class MathCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly store: MathSymbolStore) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] | undefined {
    const line = document.lineAt(position).text;
    if (!isInsideMathContext(line, position.character)) {
      return undefined;
    }

    const recent = new Set(this.store.getRecent(20));

    const items = MATH_SYMBOLS.map((sym, index) => {
      const item = new vscode.CompletionItem(sym.latex, vscode.CompletionItemKind.Value);
      item.detail = sym.unicode ?? '';
      item.documentation = sym.description;
      // Boost recently used symbols to the top
      item.sortText = recent.has(sym.latex)
        ? `0_${String(index).padStart(4, '0')}`
        : `1_${String(index).padStart(4, '0')}`;
      return item;
    });

    return items;
  }
}
