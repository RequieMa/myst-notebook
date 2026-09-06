import * as vscode from 'vscode';

/**
 * Register single-click cell edit for markup cells, plus auto-preview on
 * focus loss.
 *
 * LIMITATION: `onDidChangeNotebookEditorSelection` only fires when the
 * selection CHANGES. Clicking on an already-selected markup cell (rendered
 * webview content) does NOT change the selection, so the event doesn't fire.
 * VS Code has no public API to detect clicks on rendered markup cells or to
 * read/set a cell's edit state (Editing vs Preview). See microsoft/vscode-
 * discussions#1839.
 *
 * Auto-preview: when the selection moves away from the cell being edited, we
 * call `notebook.cell.quitEdit` to finalise it back into preview. quitEdit
 * acts on the cell holding VS Code's internal focus pointer (the one in edit
 * mode) and does not move that pointer, so we then re-assert the selection
 * and enter edit mode on the newly-selected cell (pattern proven in
 * enterSplit.ts). For re-clicking the same cell, VS Code's built-in cell
 * toolbar ("...") provides an Edit action as fallback.
 */
export function registerSingleClickEdit(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.onDidChangeNotebookEditorSelection(async (e) => {
      const nbEditor = e.notebookEditor;
      const nb = nbEditor.notebook;
      if (nb.notebookType !== 'myst-notebook') return;

      // Auto-preview: revert whatever cell is currently in edit mode back to
      // its rendered preview. No-op when nothing is being edited.
      await vscode.commands.executeCommand('notebook.cell.quitEdit');

      // Existing single-click-edit logic (single markup cell only).
      if (e.selection.isEmpty) return;
      if (e.selection.end - e.selection.start > 1) return;

      const cell = nb.cellAt(e.selection.start);
      if (cell.kind !== vscode.NotebookCellKind.Markup) return;

      // Re-assert selection, then enter edit mode (enterSplit.ts pattern).
      nbEditor.selection = new vscode.NotebookRange(cell.index, cell.index + 1);
      await vscode.commands.executeCommand('notebook.cell.edit');
    }),
  );
}
