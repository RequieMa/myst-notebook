# Cell UX Improvements — Design Spec

**Date:** 2026-07-21
**Status:** approved

## Overview

Three independent changes based on user feedback:

1. **Execute button** — `▶ Run` status bar item on every code cell bottom-right
2. **Single-click edit** — click on a cell enters edit mode immediately (no double-click required)
3. **LaTeX `\` duplication bug** — completion items insert double backslash (`\\alpha` instead of `\alpha`)

## 1. Execute Button — `src/cellStatusBar.ts` (new)

### Purpose

Every code cell shows a `▶ Run` button at its bottom edge. Clicking it executes that cell. While the cell runs the button shows `⏳ Running...` and is inactive.

### Approach

Use VS Code's `vscode.notebooks.createNotebookCellStatusBarItem()` API with `NotebookCellStatusBarAlignment.Right`.

### Architecture

```
extension.ts
  └─ registerCellStatusBar(context, controller)
       ├─ onDidOpenNotebookDocument → create items for all code cells
       ├─ onDidChangeNotebookCells → add/remove items for changed cells
       ├─ onDidCloseNotebookDocument → dispose all items for that notebook
       └─ controller execution callbacks → update item text
```

### Data model

- `Map<string, Map<number, vscode.NotebookCellStatusBarItem>>` — keyed by notebook URI, then cell index
- Each item stores `{text, command, tooltip}`; on click fires `myst-notebook.runCell`

### Command: `myst-notebook.runCell`

Parameters: `{ notebookUri: string, cellIndex: number }`

Implementation: looks up the notebook document, finds the cell by index, calls `controller.execute([cell], notebook)`.

### Execution state tracking

`MystController` adds a public `onCellExecutionStateChange` event (or callback registry) that fires `{ notebookUri, cellIndex, running: boolean }` before and after each cell executes. The status bar module subscribes to update items:

- Before execute: item.text = `$(sync~spin) Running...`, item.command = undefined (disabled)
- After execute: item.text = `$(play) Run`, item.command = `myst-notebook.runCell` (enabled)

The event is fired inside the existing `execute()` loop, wrapping each cell's execution block. No new state machine needed — it piggybacks on the existing for-of loop.

### Edge cases

- Cell deleted while running → no-op on completion (guard against stale cell index)
- Notebook closed during execution → dispose cleans up
- Multiple cells selected and run via Shift+Enter → only the focused cell's button updates; other cells run via the normal execute-all path (their buttons update too if we track per-cell)
- No kernel session available → clicking `▶ Run` triggers kernel resolution (same as Shift+Enter); if user cancels, button stays as `▶ Run`

## 2. Single-Click Edit — `src/cellFocus.ts` (new)

### Purpose

Clicking on a notebook cell immediately enters edit mode, no double-click required.

### Approach

Listen for `onDidChangeNotebookEditorSelection`. When the selection changes to a new cell, programmatically invoke `notebook.cell.edit` to enter edit mode.

### Architecture

```
extension.ts
  └─ registerSingleClickEdit(context)
       └─ onDidChangeNotebookEditorSelection
            ├─ guard: notebookType !== 'myst-notebook' → skip
            ├─ guard: selection is empty → skip
            ├─ guard: cell is already in edit mode (document.activeNotebookEditor check) → skip
            └─ vscode.commands.executeCommand('notebook.cell.edit')
```

### Data model

No persistent tracking needed. The guard checks whether the notebook editor currently has an active (editing) cell by inspecting `vscode.window.activeNotebookEditor?.notebook` state. If the cell at the selection is already being edited, skip.

### Edge cases

- Keyboard navigation (arrow keys) → also triggers edit mode (acceptable; user can press Escape to exit)
- Cell already in edit mode → guard (checking if editor is active on this cell) prevents re-trigger
- Escape → exits edit mode, selection may change → next click triggers edit enter (correct)
- Escape + click same cell → edit mode was exited by Escape, so guard passes and re-enters edit (correct)
- Clicking on cell chrome (toolbar, status bar items) → does NOT fire selection change for a different cell, so no spurious edit
- Multi-select (Shift+click) → `editor.selection` is `isEmpty === false` with multiple cells; we skip (guard: `selection.isEmpty`)

## 3. LaTeX Backslash Duplication Fix — `src/mathCompletion.ts` (modify)

### Problem

Typing `\` triggers MathCompletionProvider. Selecting `\alpha` from the list results in `\\alpha` because VS Code's default word-replacement range stops at the `\` (a non-word character in markdown), leaving the original `\` in place and appending `\alpha`.

### Fix

Set `item.range` on each `CompletionItem` to explicitly include the triggering `\`:

```typescript
const linePrefix = line.slice(0, position.character);
const lastBackslash = linePrefix.lastIndexOf('\\');
if (lastBackslash >= 0) {
    item.range = new vscode.Range(
        position.line, lastBackslash,
        position.line, position.character
    );
}
```

This tells VS Code: "replace the range from `\` to the cursor with the selected item." Since the item label is `\alpha` (includes backslash), the result is `\alpha` — correct.

### Edge cases

- Cursor not preceded by `\` → no range set (VS Code default behavior; shouldn't happen since `\` is the trigger character, but defensive)
- Multiple `\` on the same line → `lastIndexOf` finds the closest one, which is correct (cursor is after the trigger `\`)
- Completion triggered in non-math context → `isInsideMathContext` already guards; range logic only runs inside math blocks

## Test Coverage

| Module | Test file | What's tested |
|--------|-----------|---------------|
| `cellStatusBar.ts` | `src/cellStatusBar.test.ts` | Item creation for code cells (not markup), execution state toggle (`▶ Run` → `⏳ Running...` → `▶ Run`), cleanup on notebook close, item removal on cell delete, item addition on cell insert |
| `cellFocus.ts` | `src/cellFocus.test.ts` | Single-click triggers `notebook.cell.edit`, same cell re-click is no-op, non-myst-notebook is ignored, empty selection is ignored, tracking state cleaned on notebook close |
| `mathCompletion.ts` | `src/mathCompletion.test.ts` | `range` covers `\` to cursor, no range when no `\` before cursor, items outside math context return undefined, range uses correct line+character positions |

### Test infrastructure

All tests use vitest with `src/__stubs__/vscode.ts` for VS Code API stubs. New stub methods needed:

- `notebooks.createNotebookCellStatusBarItem` → returns a mock with `text`, `command`, `tooltip`, `dispose`, `show`/`hide`, `backgroundColor`
- `window.onDidChangeNotebookEditorSelection` → event emitter stub
- `commands.executeCommand` → mock that records calls

## Files Changed

| File | Change |
|------|--------|
| `src/cellStatusBar.ts` | **New** — execute button module |
| `src/cellFocus.ts` | **New** — single-click edit module |
| `src/mathCompletion.ts` | **Modify** — add `range` to completion items |
| `src/mystController.ts` | **Modify** — expose running-cell state for status bar |
| `src/extension.ts` | **Modify** — register both new modules + `runCell` command |
| `package.json` | **Modify** — add `myst-notebook.runCell` command |
| `src/cellStatusBar.test.ts` | **New** |
| `src/cellFocus.test.ts` | **New** |
| `src/mathCompletion.test.ts` | **Modify** — add range assertions |
| `src/__stubs__/vscode.ts` | **Modify** — add new stub APIs |
