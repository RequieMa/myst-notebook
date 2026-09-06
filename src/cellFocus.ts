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
 * Behavior:
 * - Click a markup cell → it enters edit mode.
 * - Click a different cell (or empty space) → the previously edited cell
 *   previews; if the new selection is a single markup cell, it enters edit
 *   mode (pattern proven in enterSplit.ts).
 * - Press Escape while editing → the cell previews and NO cell re-enters edit
 *   mode, leaving the notebook list free for multi-select / navigation.
 * - Arrow keys (after Escape) → move the selection one cell without entering
 *   edit mode.
 *
 * The Escape / arrow-key cases cannot be told apart from a click by the event
 * data alone: Escape re-emits the SAME selection, and arrow keys move the
 * selection by exactly one cell. So we (1) detect Escape via an unchanged
 * selection signature and enter "navigation mode", and (2) while navigating,
 * treat single adjacent steps as arrow keys (no edit) and any other change as
 * a click (edit + leave navigation mode).
 *
 * Auto-preview uses `notebook.quitEditAllCells` (VS Code ≥ 1.111), which
 * previews every editing markup cell regardless of list focus. On older VS
 * Code it falls back to `notebook.cell.quitEdit` (which targets the focused
 * cell — correct on the old focus model).
 */
export function registerSingleClickEdit(context: vscode.ExtensionContext): void {
  // Re-entrancy guard: `notebook.cell.edit` and `notebook.quitEditAllCells`
  // fire `onDidChangeNotebookEditorSelection` unconditionally (focusElement →
  // updateSelectionsState with forceEventEmit=true). This drops those echoes
  // and prevents a concurrent second handler from racing the first.
  const handling = new Set<string>();

  // Last selection signature per notebook, to detect an UNCHANGED selection
  // (Escape's quit-edit re-emits the same selection, and our own commands do
  // too — the latter are already caught by `handling`).
  const lastSelections = new Map<string, string>();

  // Notebooks in "navigation mode": the user quit edit via Escape and is now
  // moving with arrow keys. While navigating, adjacent single steps do NOT
  // enter edit mode.
  const navigating = new Set<string>();

  // Last single-cell selection start, for the adjacent-step (arrow-key) check.
  const lastStart = new Map<string, number>();

  context.subscriptions.push(
    vscode.workspace.onDidCloseNotebookDocument((nb) => {
      const key = nb.uri.toString();
      handling.delete(key);
      lastSelections.delete(key);
      navigating.delete(key);
      lastStart.delete(key);
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeNotebookEditorSelection(async (e) => {
      const nbEditor = e.notebookEditor;
      const nb = nbEditor.notebook;
      if (nb.notebookType !== 'myst-notebook') return;
      const key = nb.uri.toString();

      if (handling.has(key)) return;

      const signature = e.selections.map((s) => `${s.start}:${s.end}`).join(',');

      // Resolve the single-markup-cell target (cell index) from the selection.
      let target: number | undefined;
      if (e.selections.length === 1) {
        const selection = e.selections[0];
        if (!selection.isEmpty && selection.end - selection.start === 1) {
          const cell = nb.cellAt(selection.start);
          if (cell.kind === vscode.NotebookCellKind.Markup) {
            target = cell.index;
          }
        }
      }

      // Escape (quit-edit) re-emits the SAME selection. Enter navigation mode
      // so the following arrow-key moves do not yank a cell back into edit.
      if (lastSelections.get(key) === signature) {
        if (target !== undefined) navigating.add(key);
        return;
      }
      lastSelections.set(key, signature);

      // In navigation mode, a single adjacent step is an arrow key — navigate
      // without editing. Anything else (non-adjacent jump, empty/multi/code
      // selection) is a click/other action — leave navigation mode.
      if (navigating.has(key)) {
        const prev = lastStart.get(key);
        if (target !== undefined && prev !== undefined && Math.abs(target - prev) === 1) {
          lastStart.set(key, target);
          return;
        }
        navigating.delete(key);
      }

      if (target !== undefined) lastStart.set(key, target);
      else lastStart.delete(key);

      handling.add(key);
      try {
        // Auto-preview: revert every cell in edit mode back to preview.
        try {
          await vscode.commands.executeCommand('notebook.quitEditAllCells');
        } catch {
          await vscode.commands.executeCommand('notebook.cell.quitEdit');
        }

        if (target === undefined) return;

        nbEditor.selection = new vscode.NotebookRange(target, target + 1);
        await vscode.commands.executeCommand('notebook.cell.edit');
      } finally {
        handling.delete(key);
      }
    }),
  );
}
