import * as vscode from 'vscode';
import { textToCells, cellsToText, RawCell } from './core/serializer';
import { rawCellToData } from './cellFactory';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export class MystSerializer implements vscode.NotebookSerializer {
  deserializeNotebook(content: Uint8Array): vscode.NotebookData {
    const text = decoder.decode(content).replace(/\n$/, '');
    const rawCells = textToCells(text);
    // Empty file (or whitespace-only): inject a single empty markup cell so the
    // user has somewhere to type. Without this, the notebook opens with zero cells
    // and VS Code's notebook editor has no surface to focus or edit.
    if (rawCells.length === 0) {
      return new vscode.NotebookData([
        new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, '', 'markdown'),
      ]);
    }
    const cells = rawCells.map(rawCellToData);
    return new vscode.NotebookData(cells);
  }

  serializeNotebook(data: vscode.NotebookData): Uint8Array {
    if (data.cells.length === 0) return encoder.encode('');
    const cells: RawCell[] = data.cells.map((c) => ({
      kind: c.kind === vscode.NotebookCellKind.Code ? 'code' : 'markup',
      language: c.languageId,
      value: c.value,
      metadata: (c.metadata ?? {}) as Record<string, unknown>,
    }));
    return encoder.encode(cellsToText(cells) + '\n');
  }
}
