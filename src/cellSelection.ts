import * as vscode from 'vscode';
import { extendCellSelection, type SelectionState } from './core/cellSelection';

/**
 * Register keyboard cell multi-select commands for myst-notebook.
 *
 * State lives in this closure: `anchor`/`active` track the shift-selection
 * ends; `lastStart`/`lastEnd` are the last selection we wrote. The anchor is
 * reset lazily — if the active notebook changed, or the current selection no
 * longer matches what we last wrote, extendCellSelection re-anchors from the
 * current selection. No selection-change listener, so no race conditions.
 */
export function registerCellSelection(context: vscode.ExtensionContext): void {
  let state: SelectionState | undefined;
  let lastNotebookUri: string | undefined;

  function extend(delta: -1 | 1): void {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor || editor.notebook.notebookType !== 'myst-notebook') return;

    const uri = editor.notebook.uri.toString();
    if (uri !== lastNotebookUri) {
      state = undefined;
      lastNotebookUri = uri;
    }

    const sel = editor.selection;
    const result = extendCellSelection(
      state,
      { start: sel.start, end: sel.end, isEmpty: sel.isEmpty },
      editor.notebook.cellCount,
      delta,
    );
    state = result.state;
    editor.selection = new vscode.NotebookRange(result.start, result.end);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('myst-notebook.extendSelectionUp', () => extend(-1)),
    vscode.commands.registerCommand('myst-notebook.extendSelectionDown', () => extend(1)),
  );
}
