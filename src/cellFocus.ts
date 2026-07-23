import * as vscode from 'vscode';

/**
 * Register single-click cell edit for markup cells.
 *
 * LIMITATION: `onDidChangeNotebookEditorSelection` only fires when the
 * selection CHANGES. Clicking on an already-selected markup cell (rendered
 * webview content) does NOT change the selection, so the event doesn't fire.
 * VS Code has no public API to detect clicks on rendered markup cells or to
 * read/set a cell's edit state (Editing vs Preview). See microsoft/vscode-
 * discussions#1839.
 *
 * What this DOES cover: when the user clicks a DIFFERENT cell (or the first
 * cell after opening), the selection changes and we auto-enter edit mode.
 * For re-clicking the same cell, VS Code's built-in cell toolbar ("...")
 * provides an Edit action as fallback.
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
