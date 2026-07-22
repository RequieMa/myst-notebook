import * as vscode from 'vscode';

/**
 * Register single-click cell edit: when the user clicks on a notebook cell it
 * immediately enters edit mode — no double-click needed. Arrow-key navigation
 * between cells also enters edit mode for the newly focused cell.
 *
 * Guard: only fires for myst-notebook documents and only when a single cell is
 * selected (multi-select via Shift+click is skipped).
 *
 * Deferred via setTimeout(0) so VS Code finishes processing the click/selection
 * before we call notebook.cell.edit. Without the deferral the command races
 * with VS Code's own click handler and either toggles edit mode off (for code
 * cells that auto-enter on click) or gets overridden (for markup cells).
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
      // Defer to next tick so VS Code's own click handler settles first.
      // Without this deferral the command runs before VS Code processes the
      // click, causing a race where edit mode is either toggled off (code
      // cells) or overridden (markup cells).
      setTimeout(() => {
        void vscode.commands.executeCommand('notebook.cell.edit');
      }, 0);
    }),
  );
}
