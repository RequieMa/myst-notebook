import * as vscode from 'vscode';

/**
 * Register single-click cell edit: when the user clicks on a notebook cell it
 * immediately enters edit mode — no double-click needed. Arrow-key navigation
 * between cells also enters edit mode for the newly focused cell.
 *
 * Guard: only fires for myst-notebook documents and only when a single cell is
 * selected (multi-select via Shift+click is skipped).
 */
export function registerSingleClickEdit(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.onDidChangeNotebookEditorSelection((e) => {
      const nb = e.notebookEditor.notebook;
      if (nb.notebookType !== 'myst-notebook') return;

      // No cell selected → skip.
      if (e.selection.isEmpty) return;

      // Multi-select (Shift+click) → more than one cell; skip.
      // `end` is exclusive, so end - start == 1 means exactly one cell.
      if (e.selection.end - e.selection.start > 1) return;

      // A single cell is selected — enter edit mode.
      // `notebook.cell.edit` is a no-op if the cell is already being edited,
      // so we can call it unconditionally.
      void vscode.commands.executeCommand('notebook.cell.edit');
    }),
  );
}
