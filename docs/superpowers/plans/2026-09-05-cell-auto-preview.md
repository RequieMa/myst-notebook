# Cell Auto-Preview on Focus Loss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user clicks a different cell in a `myst-notebook`, the previously-edited markup cell automatically reverts to its rendered preview state.

**Architecture:** Extend the existing selection-change handler in `src/cellFocus.ts`. Before the current "single-click enters edit mode" logic, call `notebook.cell.quitEdit` so the cell VS Code is currently editing renders back to preview; then re-assert the selection and enter edit mode on the newly-selected markup cell using the proven focus pattern from `src/enterSplit.ts`.

**Tech Stack:** TypeScript, VS Code Notebook API (`onDidChangeNotebookEditorSelection`, `notebook.cell.quitEdit`, `notebook.cell.edit`).

**Spec:** Approved in-chat design (bounded task — no separate spec file). Key decisions captured in Global Constraints below.

## Global Constraints

- VS Code ≥ 1.85.
- Scope is notebook-internal only: the revert fires when the selection moves to another cell within the same `myst-notebook`. (Clicking outside the notebook is out of scope.)
- `notebook.cell.quitEdit` must run **before** `notebook.cell.edit`, and both must be awaited (ordering matters).
- The revert must happen on **every** selection change (single, multi, or empty selection), not just single-markup-cell selections — the user's `quitEdit` applies regardless of what the new selection is.
- The existing "single-click enters edit mode" behavior (single markup cell only) is preserved unchanged.
- Follow the `enterSplit.ts` focus pattern: after `quitEdit`, re-assert `nbEditor.selection` before `notebook.cell.edit`.
- No unit test for this wiring (matches existing `cellFocus.ts`, which is not unit-tested); verify via typecheck + `npm test` regression + F5 smoke.

---

### Task 1: Revert edited cell to preview on selection change

**Files:**
- Modify: `src/cellFocus.ts` (the `registerSingleClickEdit` function)

**Interfaces:**
- Consumes: VS Code commands `notebook.cell.quitEdit`, `notebook.cell.edit` (built-in).
- Produces: nothing new — behavior change only.

- [ ] **Step 1: Rewrite the selection-change handler**

Replace the body of `registerSingleClickEdit` in `src/cellFocus.ts` with the version below. The whole file should read:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS — no type errors.

- [ ] **Step 3: Build + regression tests**

Run: `npm run build` then `npm test`
Expected: PASS — esbuild succeeds; all existing unit tests still green (no unit test added for this wiring).

- [ ] **Step 4: F5 smoke check (Extension Development Host)**

Expected behavior:
1. Open a `.md` as a MyST Notebook. Double-click a markup cell (cell A) → it enters edit mode.
2. Single-click another markup cell (cell B) → **cell A reverts to preview**, cell B enters edit mode.
3. Click a code cell (cell C) while editing markup cell B → cell B reverts to preview, cell C is focused.
4. Shift-click to multi-select while editing a markup cell → the edited cell reverts to preview, selection is multi.
5. Press Enter in a cell (existing onEnter split) still works and still lands the cursor in the new cell below.

If F5 shows `notebook.cell.edit` re-entering the OLD cell instead of the new one after `quitEdit`, re-check that `nbEditor.selection = new vscode.NotebookRange(cell.index, cell.index + 1)` runs before `edit` (Step 1 already includes it).

- [ ] **Step 5: Commit**

```bash
git add src/cellFocus.ts
git commit -m "feat: auto-preview edited cell when selection moves away"
```
