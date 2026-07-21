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

    // Find the backslash that triggered this completion session so we can set
    // the replace-range correctly. Without an explicit range VS Code replaces the
    // "word" at the cursor, but `\` is not a word character in markdown, so it
    // stays behind and the inserted \alpha produces \\alpha.
    const linePrefix = line.slice(0, position.character);
    const lastBackslash = linePrefix.lastIndexOf('\\');
    const replaceRange =
      lastBackslash >= 0
        ? new vscode.Range(position.line, lastBackslash, position.line, position.character)
        : undefined;

    const recent = new Set(this.store.getRecent(20));

    const items = MATH_SYMBOLS.map((sym, index) => {
      const item = new vscode.CompletionItem(sym.latex, vscode.CompletionItemKind.Value);
      item.detail = sym.unicode ?? '';
      item.documentation = sym.description;
      // Boost recently used symbols to the top
      item.sortText = recent.has(sym.latex)
        ? `0_${String(index).padStart(4, '0')}`
        : `1_${String(index).padStart(4, '0')}`;
      if (replaceRange) {
        item.range = replaceRange;
      }
      return item;
    });

    return items;
  }
}
