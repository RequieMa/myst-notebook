import * as vscode from 'vscode';

/**
 * Register single-click cell edit: when the user clicks on a MARKUP cell it
 * immediately enters edit mode — no double-click needed.
 *
 * Code cells are deliberately excluded: VS Code already enters edit mode
 * naturally on single-click for code cells, and toggling would exit instead.
 *
 * Uses the same delayMs + explicit selection + notebook.cell.edit pattern as
 * enterSplit.ts's selectCellBestEffort, which is the only reliable way to
 * enter edit mode after VS Code's internal state has settled.
 */
export function registerSingleClickEdit(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.onDidChangeNotebookEditorSelection((e) => {
      const nb = e.notebookEditor.notebook;
      if (nb.notebookType !== 'myst-notebook') return;

      // No cell selected → skip.
      if (e.selection.isEmpty) return;

      // Multi-select (Shift+click) → more than one cell; skip.
      if (e.selection.end - e.selection.start > 1) return;

      // Only markup cells — code cells already enter edit mode on click.
      const cell = nb.cellAt(e.selection.start);
      if (cell.kind !== vscode.NotebookCellKind.Markup) return;

      // Defer: let VS Code's click handler finish, then explicitly set
      // selection and enter edit mode. Same pattern as enterSplit.ts.
      const index = e.selection.start;
      const editor = e.notebookEditor;
      setTimeout(async () => {
        // Re-set selection in case VS Code moved it during click processing
        editor.selection = new vscode.NotebookRange(index, index + 1);
        await new Promise(r => setTimeout(r, 10));
        await vscode.commands.executeCommand('notebook.cell.edit');
      }, 50);
    }),
  );
}
