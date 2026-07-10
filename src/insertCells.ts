import * as vscode from 'vscode';
import { RawCell } from './core/serializer';
import { makeExecutableCell, makeDisplayCodeCell } from './core/cellTemplates';
import { rawCellToData } from './cellFactory';

/**
 * Registers the insert-cell commands for MyST notebooks:
 *   - `myst-notebook.insertExecutableCell` → a collapsed {code-cell}
 *   - `myst-notebook.insertDisplayCode`    → a display-only ```python markup block
 *
 * Both mint their cell via the pure `cellTemplates` factories, map it through the
 * single `rawCellToData` mapper, and insert it directly below the active cell.
 *
 * Focus strategy is lifted from `enterSplit.ts` (see the long note there): after a
 * structural edit, VS Code's internal focused-cell pointer must not be disturbed.
 * We therefore quit edit mode, insert additively via WorkspaceEdit +
 * NotebookEdit.insertCells (which does NOT corrupt the pointer), then set
 * `nbEditor.selection` to the new cell and enter edit mode.
 */
export function registerInsertCells(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('myst-notebook.insertExecutableCell', () =>
      insertCellBelow(makeExecutableCell)
    ),
    vscode.commands.registerCommand('myst-notebook.insertDisplayCode', () =>
      insertCellBelow(makeDisplayCodeCell)
    )
  );
}

async function insertCellBelow(makeCell: () => RawCell): Promise<void> {
  const editor = vscode.window.activeNotebookEditor;
  if (!editor || editor.notebook.notebookType !== 'myst-notebook') return;

  const nb = editor.notebook;
  // `selection.end` is the exclusive end of the selected range — i.e. the index
  // directly below the active cell. When the selection is empty (no cell focused),
  // append at the end of the notebook.
  const selection = editor.selection;
  const insertIndex = selection.isEmpty ? nb.cellCount : selection.end;

  // Finalise the current cell without disturbing VS Code's focus pointer.
  await vscode.commands.executeCommand('notebook.cell.quitEdit');

  const newCell = rawCellToData(makeCell());
  const insertEdit = new vscode.WorkspaceEdit();
  insertEdit.set(nb.uri, [vscode.NotebookEdit.insertCells(insertIndex, [newCell])]);
  await vscode.workspace.applyEdit(insertEdit);

  // Let VS Code reconcile the additive insert before we re-read/set the cell selection.
  await new Promise<void>(resolve => setTimeout(resolve, 30));
  // The additive insertCells edit doesn't invalidate our `editor` handle, so reuse it
  // directly rather than re-resolving via `visibleNotebookEditors`.
  if (nb.cellCount > insertIndex) {
    editor.selection = new vscode.NotebookRange(insertIndex, insertIndex + 1);
    await vscode.commands.executeCommand('notebook.cell.edit');
  }
}
