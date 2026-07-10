import * as vscode from 'vscode';
import { textToCells, cellsToText, RawCell } from './core/serializer';
import { rawCellToData } from './cellFactory';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export class MystSerializer implements vscode.NotebookSerializer {
  deserializeNotebook(content: Uint8Array): vscode.NotebookData {
    // The pure core works on newline-stripped canonical text; this adapter owns the
    // file's trailing newline (stripped here, re-appended on serialize). A file that
    // lacked a trailing newline gains one on first save — a one-time, self-healing
    // normalization that is within the documented supported subset.
    const text = decoder.decode(content).replace(/\n$/, '');
    const cells = textToCells(text).map(rawCellToData);
    return new vscode.NotebookData(cells);
  }

  serializeNotebook(data: vscode.NotebookData): Uint8Array {
    // An empty notebook serializes to an empty file (not a stray "\n").
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
