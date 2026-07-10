import * as vscode from 'vscode';
import { RawCell } from './core/serializer';
import { hideInputFromCellMetadata } from './core/tags';

/**
 * Convert a core `RawCell` into a VS Code `NotebookCellData`. This is the SINGLE
 * place that maps our cell model onto the notebook model, so cells created at load
 * time (serializer) and at type time (auto-split) are identical — same inner-code
 * `value`, same `metadata.myst` fences, same input-collapse default for code cells.
 */
export function rawCellToData(c: RawCell): vscode.NotebookCellData {
  const kind =
    c.kind === 'code' ? vscode.NotebookCellKind.Code : vscode.NotebookCellKind.Markup;
  const data = new vscode.NotebookCellData(kind, c.value, c.language);
  // Shallow-clone metadata: `metadata.myst.{fence,closeFence}` is the code-cell
  // round-trip linchpin; defend against in-place mutation between load and save.
  const metadata: Record<string, unknown> = c.metadata ? { ...c.metadata } : {};
  if (c.kind === 'code') {
    // Collapse code input to mirror the MyST hide-input tag: a `:tags: [hide-input]`
    // (or `hide-cell`) option line collapses the cell so only outputs show; otherwise
    // the input stays expanded. Lives only in in-memory metadata — `cellsToText`
    // ignores everything except `metadata.myst`.
    metadata.inputCollapsed = hideInputFromCellMetadata(metadata);
  }
  data.metadata = metadata;
  return data;
}
