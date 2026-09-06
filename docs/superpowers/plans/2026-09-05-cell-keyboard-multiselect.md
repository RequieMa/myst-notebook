# Keyboard Cell Multi-Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Ctrl+Shift+↑/↓` extends/shrinks the cell selection in a `myst-notebook` with text-editor-like anchor semantics, so multi-selected cells can be copied/pasted with the native `Ctrl+C`/`Ctrl+V`.

**Architecture:** A pure `src/core/cellSelection.ts` module computes the next selection range from `{anchor, active, lastStart, lastEnd}` state (no VS Code imports). A `src/cellSelection.ts` wiring module holds that state in a closure and sets `NotebookEditor.selection`. Anchor reset is **lazy**: on each keypress, if the current selection no longer equals the last one we wrote, we re-anchor from the current selection — no event listener, no race conditions.

**Tech Stack:** TypeScript, VS Code Notebook API (`NotebookEditor.selection`, `NotebookRange`), vitest.

**Spec:** Approved in-chat design (bounded task — no separate spec file). Key decisions captured in Global Constraints below.

## Global Constraints

- VS Code ≥ 1.85.
- Keybindings: `Ctrl+Shift+Up` (shrink/grow up), `Ctrl+Shift+Down` (grow down), both with `when: notebookType == 'myst-notebook' && notebookEditorFocused && !inputFocus` (`!inputFocus` = cell-list focus, the same guard as the existing Ctrl+D delete binding).
- Anchor semantics (model B): `anchor` is fixed until the user changes the selection outside our command; `active` moves with the keypress. Selection = `[min(anchor, active), max(anchor, active) + 1)`. Pressing up past the anchor grows the selection upward.
- Selection is clamped to `[0, cellCount)`.
- Empty selection → select the single cell at the clamped position (delta ignored on the first press).
- Pure logic lives in `src/core/cellSelection.ts` (no `vscode` import). Wiring lives in `src/cellSelection.ts`.
- Copy/paste is NOT implemented here — VS Code's native cell copy/paste handles it once multi-selection works.

---

### Task 1: Pure selection-extension function

**Files:**
- Create: `src/core/cellSelection.ts`
- Test: `src/core/cellSelection.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exported from `src/core/cellSelection.ts`):
  - `interface SelectionState { anchor: number; active: number; lastStart: number; lastEnd: number }`
  - `interface SelectionInput { start: number; end: number; isEmpty: boolean }`
  - `interface SelectionResult { state: SelectionState; start: number; end: number }`
  - `extendCellSelection(prev: SelectionState | undefined, current: SelectionInput, cellCount: number, delta: -1 | 1): SelectionResult`

- [ ] **Step 1: Write the failing test**

Create `src/core/cellSelection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extendCellSelection, type SelectionState } from './cellSelection';

describe('extendCellSelection', () => {
  it('first press grows downward from a single cell', () => {
    const r = extendCellSelection(undefined, { start: 3, end: 4, isEmpty: false }, 10, 1);
    expect(r.start).toBe(3);
    expect(r.end).toBe(5);
    expect(r.state).toEqual({ anchor: 3, active: 4, lastStart: 3, lastEnd: 5 });
  });

  it('continues growing downward', () => {
    const prev: SelectionState = { anchor: 3, active: 4, lastStart: 3, lastEnd: 5 };
    const r = extendCellSelection(prev, { start: 3, end: 5, isEmpty: false }, 10, 1);
    expect(r.start).toBe(3);
    expect(r.end).toBe(6);
  });

  it('shrinks from the bottom on up', () => {
    const prev: SelectionState = { anchor: 3, active: 5, lastStart: 3, lastEnd: 6 };
    const r = extendCellSelection(prev, { start: 3, end: 6, isEmpty: false }, 10, -1);
    expect(r.start).toBe(3);
    expect(r.end).toBe(5);
    expect(r.state.active).toBe(4);
  });

  it('returns to a single cell on further up', () => {
    const prev: SelectionState = { anchor: 3, active: 4, lastStart: 3, lastEnd: 5 };
    const r = extendCellSelection(prev, { start: 3, end: 5, isEmpty: false }, 10, -1);
    expect(r.start).toBe(3);
    expect(r.end).toBe(4);
  });

  it('crosses the anchor to grow upward', () => {
    const prev: SelectionState = { anchor: 3, active: 3, lastStart: 3, lastEnd: 4 };
    const r = extendCellSelection(prev, { start: 3, end: 4, isEmpty: false }, 10, -1);
    expect(r.start).toBe(2);
    expect(r.end).toBe(4);
  });

  it('re-anchors when the selection was changed by the user', () => {
    const prev: SelectionState = { anchor: 3, active: 5, lastStart: 3, lastEnd: 6 };
    const r = extendCellSelection(prev, { start: 7, end: 8, isEmpty: false }, 10, 1);
    expect(r.start).toBe(7);
    expect(r.end).toBe(9);
    expect(r.state.anchor).toBe(7);
  });

  it('clamps at the top boundary', () => {
    const prev: SelectionState = { anchor: 0, active: 0, lastStart: 0, lastEnd: 1 };
    const r = extendCellSelection(prev, { start: 0, end: 1, isEmpty: false }, 10, -1);
    expect(r.start).toBe(0);
    expect(r.end).toBe(1);
  });

  it('clamps at the bottom boundary', () => {
    const prev: SelectionState = { anchor: 9, active: 9, lastStart: 9, lastEnd: 10 };
    const r = extendCellSelection(prev, { start: 9, end: 10, isEmpty: false }, 10, 1);
    expect(r.start).toBe(9);
    expect(r.end).toBe(10);
  });

  it('selects a single cell from an empty selection', () => {
    const r = extendCellSelection(undefined, { start: 3, end: 3, isEmpty: true }, 10, 1);
    expect(r.start).toBe(3);
    expect(r.end).toBe(4);
    expect(r.state.anchor).toBe(3);
  });

  it('clamps an empty selection to cell 0', () => {
    const r = extendCellSelection(undefined, { start: -1, end: -1, isEmpty: true }, 10, 1);
    expect(r.start).toBe(0);
    expect(r.end).toBe(1);
  });

  it('continues from a mouse multi-selection', () => {
    const r = extendCellSelection(undefined, { start: 2, end: 5, isEmpty: false }, 10, 1);
    expect(r.start).toBe(2);
    expect(r.end).toBe(6);
    expect(r.state.anchor).toBe(2);
  });

  it('no-ops for an empty notebook', () => {
    const r = extendCellSelection(undefined, { start: 0, end: 0, isEmpty: true }, 0, 1);
    expect(r.start).toBe(0);
    expect(r.end).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/cellSelection.test.ts`
Expected: FAIL — `Cannot find module './cellSelection'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/core/cellSelection.ts`:

```ts
/** Cell multi-selection extension. Pure module — no VS Code imports. */

export interface SelectionState {
  anchor: number;
  active: number;
  lastStart: number;
  lastEnd: number;
}

export interface SelectionInput {
  start: number;
  end: number;
  isEmpty: boolean;
}

export interface SelectionResult {
  state: SelectionState;
  start: number;
  end: number;
}

/**
 * Compute the next cell selection after an extend keypress.
 *
 * `anchor` is the fixed end of the selection; `active` is the end that moves.
 * Selection is `[min(anchor, active), max(anchor, active) + 1)`. The anchor is
 * reset lazily: when `current` does not equal the last selection we produced
 * (`prev.lastStart/lastEnd`), the user moved the selection, so we re-anchor
 * from `current`.
 */
export function extendCellSelection(
  prev: SelectionState | undefined,
  current: SelectionInput,
  cellCount: number,
  delta: -1 | 1,
): SelectionResult {
  if (cellCount <= 0) {
    return {
      state: prev ?? { anchor: 0, active: 0, lastStart: 0, lastEnd: 0 },
      start: 0,
      end: 0,
    };
  }

  if (current.isEmpty) {
    const idx = Math.min(Math.max(0, current.start), cellCount - 1);
    return {
      state: { anchor: idx, active: idx, lastStart: idx, lastEnd: idx + 1 },
      start: idx,
      end: idx + 1,
    };
  }

  const unchanged =
    prev !== undefined &&
    current.start === prev.lastStart &&
    current.end === prev.lastEnd;

  const anchor = unchanged ? prev.anchor : current.start;
  const activeBase = unchanged ? prev.active : current.end - 1;
  const active = Math.min(Math.max(0, activeBase + delta), cellCount - 1);

  const start = Math.min(anchor, active);
  const end = Math.max(anchor, active) + 1;

  return {
    state: { anchor, active, lastStart: start, lastEnd: end },
    start,
    end,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/cellSelection.test.ts`
Expected: PASS — all 12 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/cellSelection.ts src/core/cellSelection.test.ts
git commit -m "feat: pure cell-selection extension logic with tests"
```

---

### Task 2: `registerCellSelection` wiring + extension activation

**Files:**
- Create: `src/cellSelection.ts`
- Modify: `src/extension.ts` (one import + one call)

**Interfaces:**
- Consumes (from Task 1): `extendCellSelection`, `SelectionState`.
- Produces: `registerCellSelection(context: vscode.ExtensionContext): void` (from `src/cellSelection.ts`), and command IDs `myst-notebook.extendSelectionUp`, `myst-notebook.extendSelectionDown` (referenced by `package.json` in Task 3).

- [ ] **Step 1: Write the wiring module**

Create `src/cellSelection.ts`:

```ts
import * as vscode from 'vscode';
import { extendCellSelection, type SelectionState } from './core/cellSelection';

/**
 * Register keyboard cell multi-select commands for myst-notebook.
 *
 * State lives in this closure: `anchor`/`active` track the shift-selection
 * ends; `lastStart`/`lastEnd` are the last selection we wrote. The anchor is
 * reset lazily — if the active notebook changed, or the current selection no
 * longer matches what we last wrote, extendCellSelection re-anchors from the
 * current selection. No selection-change listener, so no race conditions.
 */
export function registerCellSelection(context: vscode.ExtensionContext): void {
  let state: SelectionState | undefined;
  let lastNotebookUri: string | undefined;

  function extend(delta: -1 | 1): void {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor || editor.notebook.notebookType !== 'myst-notebook') return;

    const uri = editor.notebook.uri.toString();
    if (uri !== lastNotebookUri) {
      state = undefined;
      lastNotebookUri = uri;
    }

    const sel = editor.selection;
    const result = extendCellSelection(
      state,
      { start: sel.start, end: sel.end, isEmpty: sel.isEmpty },
      editor.notebook.cellCount,
      delta,
    );
    state = result.state;
    editor.selection = new vscode.NotebookRange(result.start, result.end);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('myst-notebook.extendSelectionUp', () => extend(-1)),
    vscode.commands.registerCommand('myst-notebook.extendSelectionDown', () => extend(1)),
  );
}
```

- [ ] **Step 2: Wire it into activation**

Modify `src/extension.ts`. Two changes:

1. Add the import after `import { registerFontSize } from './fontSize';`:

```ts
import { registerFontSize } from './fontSize';
import { registerCellSelection } from './cellSelection';
```

2. Add the registration call after `registerFontSize(context);`:

```ts
  // Font-size shortcuts + status-bar dropdown
  registerFontSize(context);

  // Keyboard cell multi-select (Ctrl+Shift+Up/Down)
  registerCellSelection(context);
```

> Note: if Task 2 is executed before the font-size plan, adapt the anchor lines — import `registerCellSelection` after the `registerSingleClickEdit` import, and call `registerCellSelection(context)` after `registerSingleClickEdit(context);`. This plan's font-size anchor lines assume the font-size plan is already merged.

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS — no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/cellSelection.ts src/extension.ts
git commit -m "feat: register keyboard cell multi-select commands"
```

---

### Task 3: package.json commands + keybindings + verification

**Files:**
- Modify: `package.json` (2 commands in `contributes.commands`, 2 keybindings in `contributes.keybindings`)

**Interfaces:**
- Consumes (from Task 2): command IDs `myst-notebook.extendSelectionUp`, `myst-notebook.extendSelectionDown`.

- [ ] **Step 1: Add the two commands**

In `package.json`, inside `contributes.commands`, add (placing them after the font-size commands if that plan is already merged, otherwise after `myst-notebook.runCell`):

```json
  {
    "command": "myst-notebook.extendSelectionUp",
    "title": "MyST: Extend Cell Selection Up",
    "category": "MyST"
  },
  {
    "command": "myst-notebook.extendSelectionDown",
    "title": "MyST: Extend Cell Selection Down",
    "category": "MyST"
  }
```

- [ ] **Step 2: Add the two keybindings**

In `package.json`, inside `contributes.keybindings`, add:

```json
  {
    "command": "myst-notebook.extendSelectionUp",
    "key": "ctrl+shift+up",
    "when": "notebookType == 'myst-notebook' && notebookEditorFocused && !inputFocus"
  },
  {
    "command": "myst-notebook.extendSelectionDown",
    "key": "ctrl+shift+down",
    "when": "notebookType == 'myst-notebook' && notebookEditorFocused && !inputFocus"
  }
```

(Mind the commas: each new entry must be comma-separated from its neighbors.)

- [ ] **Step 3: Validate package.json**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('valid JSON')"`
Expected: `valid JSON`.

- [ ] **Step 4: Full build + unit tests**

Run: `npm run build` then `npm test`
Expected: PASS — esbuild succeeds; all tests green including `src/core/cellSelection.test.ts` (12 tests).

- [ ] **Step 5: F5 smoke check**

Expected behavior:
1. Open a `.md` as a MyST Notebook. Press Escape if a cell is in edit mode, so the cell list has focus.
2. With cell 2 selected, press `Ctrl+Shift+Down` → cells 2 and 3 selected. Press again → 2, 3, 4. Press `Ctrl+Shift+Up` → back to 2, 3 (shrinks), again → single cell 2, again → grows upward to 1, 2.
3. Click a far-away cell, then `Ctrl+Shift+Down` → a fresh 2-cell selection starts there (re-anchored).
4. With multiple cells selected, `Ctrl+C` then `Ctrl+V` pastes copies of those cells (native VS Code behavior).
5. `Ctrl+Shift+Up/Down` does nothing while editing text inside a cell (`inputFocus`) — text selection keeps its normal Shift+Up/Down behavior.

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "feat: keyboard cell multi-select commands and keybindings"
```
