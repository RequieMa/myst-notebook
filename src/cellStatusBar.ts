import * as vscode from 'vscode';
import type { MystController } from './mystController';

/**
 * Register a "▶ Run" status bar item on every code cell in myst-notebook
 * documents. Clicking it executes that cell. During execution the item shows
 * "⏳ Running..." and is disabled.
 *
 * Item lifecycle is delegated to VS Code via a
 * {@link vscode.NotebookCellStatusBarItemProvider} (the old
 * `createNotebookCellStatusBarItem` factory was removed). Running state is
 * driven by {@link MystController.onDidChangeCellExecution}, so it reflects any
 * execution path — the status-bar ▶ Run button and the built-in Run /
 * Shift+Enter alike — since both route through `MystController.execute`.
 */
export function registerCellStatusBar(
  context: vscode.ExtensionContext,
  controller: MystController,
): void {
  const RUN_TEXT = '$(play) Run';
  const RUNNING_TEXT = '$(sync~spin) Running...';
  const RUN_TOOLTIP = 'Run this cell';
  const RUNNING_TOOLTIP = 'Cell is running…';

  // Cell keys currently executing: `${notebookUri}::${cellIndex}`.
  const runningCells = new Set<string>();
  const changeEmitter = new vscode.EventEmitter<void>();

  const provider: vscode.NotebookCellStatusBarItemProvider = {
    onDidChangeCellStatusBarItems: changeEmitter.event,
    provideCellStatusBarItems(cell) {
      if (cell.kind !== vscode.NotebookCellKind.Code) return [];
      const isRunning = runningCells.has(cellKey(cell));
      const item = new vscode.NotebookCellStatusBarItem(
        isRunning ? RUNNING_TEXT : RUN_TEXT,
        vscode.NotebookCellStatusBarAlignment.Right,
      );
      item.tooltip = isRunning ? RUNNING_TOOLTIP : RUN_TOOLTIP;
      if (!isRunning) {
        item.command = {
          command: 'myst-notebook.runCell',
          title: 'Run Cell',
          arguments: [{ notebookUri: cell.notebook.uri.toString(), cellIndex: cell.index }],
        };
      }
      return [item];
    },
  };

  context.subscriptions.push(
    vscode.notebooks.registerNotebookCellStatusBarItemProvider('myst-notebook', provider),
  );

  // Track running state from the controller's execution lifecycle. The start
  // event fires synchronously when `execute` is called (before any await), so
  // the item flips to "Running..." immediately; the finish event fires in a
  // `finally`, so it always restores the Run item even if execution throws.
  context.subscriptions.push(
    controller.onDidChangeCellExecution(({ cells, running }) => {
      for (const cell of cells) {
        const key = cellKey(cell);
        if (running) runningCells.add(key);
        else runningCells.delete(key);
      }
      changeEmitter.fire();
    }),
  );
}

function cellKey(cell: vscode.NotebookCell): string {
  return `${cell.notebook.uri.toString()}::${cell.index}`;
}
