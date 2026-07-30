import * as vscode from 'vscode';
import { MATH_SYMBOLS } from './mathSymbols';
import { MathSymbolStore } from './mathPalette';
import { isInsideMathContext } from './mathContextDetector';


export class MathCompletionProvider implements vscode.CompletionItemProvider {
  constructor(
    private readonly store: MathSymbolStore,
    private readonly acceptCommand?: { command: string; title: string },
  ) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] | undefined {
    if (!isInsideMathContext(document, position)) {
      return undefined;
    }

    const line = document.lineAt(position).text;
    const linePrefix = line.slice(0, position.character);
    const lastBackslash = linePrefix.lastIndexOf('\\');
    const replaceRange =
      lastBackslash >= 0
        ? new vscode.Range(position.line, lastBackslash, position.line, position.character)
        : undefined;

    const items = MATH_SYMBOLS.map((sym, index) => {
      const item = new vscode.CompletionItem(sym.latex, vscode.CompletionItemKind.Value);
      item.detail = sym.unicode ?? '';
      item.documentation = sym.description;

      // Snippet insertion for brace-wrapping commands
      if (sym.snippet) {
        item.insertText = new vscode.SnippetString(sym.snippet);
      }

      if (replaceRange) {
        item.range = replaceRange;
      }

      // Sort: config stats → built-in index
      const stats = this.store.getStats(sym.latex);
      if (stats && stats.count > 0) {
        // Tier 0: used symbols, sorted by count desc (padded for string sort)
        const countKey = String(9999 - Math.min(stats.count, 9999)).padStart(4, '0');
        item.sortText = `0_${countKey}_${String(index).padStart(4, '0')}`;
      } else {
        // Tier 1: unused symbols, by built-in index
        item.sortText = `1_${String(index).padStart(4, '0')}`;
      }

      // Fire on-accept command so usage is recorded
      if (this.acceptCommand) {
        item.command = {
          command: this.acceptCommand.command,
          title: this.acceptCommand.title,
          arguments: [sym.latex],
        };
      }

      return item;
    });

    return items;
  }
}
