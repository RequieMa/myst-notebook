import * as vscode from 'vscode';
import type { MystController } from './mystController';

/**
 * Register a "▶ Run" status bar item on every code cell in myst-notebook
 * documents. Clicking it executes that cell. During execution the item shows
 * "⏳ Running..." and is disabled.
 */
export function registerCellStatusBar(
  context: vscode.ExtensionContext,
  controller: MystController,
): void {
  // Per-notebook map: cell index → status bar item
  const notebookItems = new Map<string, Map<number, vscode.NotebookCellStatusBarItem>>();

  const RUN_TEXT = '$(play) Run';
  const RUNNING_TEXT = '$(sync~spin) Running...';
  const RUN_TOOLTIP = 'Run this cell';
  const RUNNING_TOOLTIP = 'Cell is running…';

  function createItem(cell: vscode.NotebookCell): vscode.NotebookCellStatusBarItem {
    const item = vscode.notebooks.createNotebookCellStatusBarItem(
      cell,
      vscode.NotebookCellStatusBarAlignment.Right,
    );
    item.text = RUN_TEXT;
    item.command = {
      command: 'myst-notebook.runCell',
      title: 'Run Cell',
      arguments: [{ notebookUri: cell.notebook.uri.toString(), cellIndex: cell.index }],
    };
    item.tooltip = RUN_TOOLTIP;
    return item;
  }

  function ensureItems(notebook: vscode.NotebookDocument): Map<number, vscode.NotebookCellStatusBarItem> {
    const key = notebook.uri.toString();
    let items = notebookItems.get(key);
    if (!items) {
      items = new Map();
      notebookItems.set(key, items);
    }
    // Sync items with current cells: create for new code cells, dispose for removed ones.
    const currentIndices = new Set<number>();
    for (const cell of notebook.getCells()) {
      if (cell.kind === vscode.NotebookCellKind.Code) {
        currentIndices.add(cell.index);
        if (!items.has(cell.index)) {
          items.set(cell.index, createItem(cell));
        }
      }
    }
    // Dispose items for cells that no longer exist.
    for (const [idx, item] of items) {
      if (!currentIndices.has(idx)) {
        item.dispose();
        items.delete(idx);
      }
    }
    return items;
  }

  function disposeNotebook(uri: vscode.Uri): void {
    const key = uri.toString();
    const items = notebookItems.get(key);
    if (items) {
      for (const item of items.values()) item.dispose();
      notebookItems.delete(key);
    }
  }

  // --- Event listeners ---

  context.subscriptions.push(
    vscode.workspace.onDidOpenNotebookDocument((notebook) => {
      if (notebook.notebookType !== 'myst-notebook') return;
      ensureItems(notebook);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseNotebookDocument((notebook) => {
      disposeNotebook(notebook.uri);
    }),
  );

  context.subscriptions.push(
    vscode.notebooks.onDidChangeNotebookCells((e) => {
      if (e.notebook.notebookType !== 'myst-notebook') return;
      // Re-sync: onDidChangeNotebookCells fires for cell add, remove, move, and
      // kind changes. Ensure items and disposable sync avoids leaking items.
      ensureItems(e.notebook);
    }),
  );

  // Initialise items for already-open notebooks (e.g. on extension activation).
  for (const notebook of vscode.workspace.notebookDocuments) {
    if (notebook.notebookType === 'myst-notebook') {
      ensureItems(notebook);
    }
  }

  // --- Execution state updates ---

  // Hook into the controller's execution pipeline so we can update the
  // status bar item for the cell currently being executed.
  const originalExecute = controller.execute.bind(controller);
  controller.execute = async function (
    this: MystController,
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument,
  ): Promise<void> {
    const key = notebook.uri.toString();
    const items = notebookItems.get(key);

    // Mark running cells
    const runningIndices = new Set<number>();
    for (const cell of cells) {
      if (cell.kind === vscode.NotebookCellKind.Code) {
        runningIndices.add(cell.index);
        const item = items?.get(cell.index);
        if (item) {
          item.text = RUNNING_TEXT;
          item.command = undefined; // disable click while running
          item.tooltip = RUNNING_TOOLTIP;
        }
      }
    }

    try {
      await originalExecute(cells, notebook);
    } finally {
      // Restore run state
      for (const idx of runningIndices) {
        const item = items?.get(idx);
        if (item) {
          item.text = RUN_TEXT;
          item.command = {
            command: 'myst-notebook.runCell',
            title: 'Run Cell',
            arguments: [{ notebookUri: notebook.uri.toString(), cellIndex: idx }],
          };
          item.tooltip = RUN_TOOLTIP;
        }
      }
    }
  };
}
