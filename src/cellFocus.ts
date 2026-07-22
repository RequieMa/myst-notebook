import * as vscode from 'vscode';

/**
 * Register single-click cell edit: when the user clicks on a MARKUP cell it
 * immediately enters edit mode — no double-click needed.
 */
export function registerSingleClickEdit(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.onDidChangeNotebookEditorSelection((e) => {
      const nb = e.notebookEditor.notebook;
      if (nb.notebookType !== 'myst-notebook') return;
      if (e.selection.isEmpty) return;
      if (e.selection.end - e.selection.start > 1) return;

      const cell = nb.cellAt(e.selection.start);
      if (cell.kind !== vscode.NotebookCellKind.Markup) return;

      void vscode.commands.executeCommand('notebook.cell.edit');
    }),
  );
}
