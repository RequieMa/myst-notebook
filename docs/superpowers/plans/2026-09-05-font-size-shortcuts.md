# Font Size Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two keyboard shortcuts (`Ctrl+Alt+=` / `Ctrl+Alt+-`) and a status-bar dropdown so users can change the MyST notebook font size without opening VS Code settings.

**Architecture:** A pure `src/core/fontSize.ts` module holds the clamp/resolve math (no VS Code imports, unit-testable). A `src/fontSize.ts` wiring module registers 3 commands and a window status-bar item; both `notebook.markup.fontSize` and `editor.fontSize` are written together via `ConfigurationTarget.Global`. `package.json` declares the commands and keybindings. Follows the existing "self-contained registration call in `activate()`" pattern (cf. `cellStatusBar.ts`, `cellFocus.ts`).

**Tech Stack:** TypeScript, VS Code Notebook API (`vscode.workspace.getConfiguration`, `vscode.window.createStatusBarItem`, `vscode.window.showQuickPick`), vitest for unit tests.

**Spec:** Approved in-chat design (bounded task — no separate spec file). Key decisions captured in Global Constraints below.

## Global Constraints

- VS Code ≥ 1.85 (project floor — Notebook API used throughout).
- Keybindings: `Ctrl+Alt+=` (increase), `Ctrl+Alt+-` (decrease). Do NOT use `Ctrl+Shift+=`/`Ctrl+Shift+-` (already bound to window zoom).
- Step `1` px, clamp range **8–32**.
- Write BOTH `notebook.markup.fontSize` AND `editor.fontSize`, using `ConfigurationTarget.Global` (persist to user settings, not workspace).
- Do **NOT** touch `notebook.output.fontSize`.
- Status-bar item text: `$(text-size) <N>px` (codicon `text-size`). Clicking it opens a QuickPick of `[12, 13, 14, 16, 18, 20, 24]`.
- Status-bar item is visible only when the active notebook's type is `myst-notebook`.
- Unit tests run under vitest; `vscode` is aliased to `src/__stubs__/vscode.ts` (see `vitest.config.ts`). Pure core modules must not import `vscode`.
- Follow existing patterns: pure logic in `src/core/`, VS Code wiring in top-level `src/*.ts`.

---

### Task 1: Pure font-size helpers

**Files:**
- Create: `src/core/fontSize.ts`
- Test: `src/core/fontSize.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exported from `src/core/fontSize.ts`):
  - `FONT_SIZE_MIN: number` (= 8)
  - `FONT_SIZE_MAX: number` (= 32)
  - `FONT_SIZE_STEP: number` (= 1)
  - `FONT_SIZE_PRESETS: number[]` (= `[12, 13, 14, 16, 18, 20, 24]`)
  - `clampFontSize(n: number): number`
  - `resolveFontSize(markup: number | undefined, editor: number | undefined): number`

- [ ] **Step 1: Write the failing test**

Create `src/core/fontSize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  clampFontSize,
  resolveFontSize,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_PRESETS,
} from './fontSize';

describe('clampFontSize', () => {
  it('clamps below the minimum', () => {
    expect(clampFontSize(7)).toBe(8);
  });

  it('clamps above the maximum', () => {
    expect(clampFontSize(33)).toBe(32);
  });

  it('rounds fractional values', () => {
    expect(clampFontSize(14.6)).toBe(15);
  });

  it('passes in-range integer values through unchanged', () => {
    expect(clampFontSize(16)).toBe(16);
  });

  it('clamps and rounds together at the top', () => {
    expect(clampFontSize(32.4)).toBe(32);
  });
});

describe('resolveFontSize', () => {
  it('returns markup when it is a positive number', () => {
    expect(resolveFontSize(16, 14)).toBe(16);
  });

  it('falls back to editor when markup is 0 (inherit)', () => {
    expect(resolveFontSize(0, 14)).toBe(14);
  });

  it('falls back to editor when markup is undefined', () => {
    expect(resolveFontSize(undefined, 14)).toBe(14);
  });

  it('defaults to 14 when both are undefined', () => {
    expect(resolveFontSize(undefined, undefined)).toBe(14);
  });

  it('ignores a non-positive editor and defaults to 14', () => {
    expect(resolveFontSize(undefined, -1)).toBe(14);
  });
});

describe('FONT_SIZE_PRESETS', () => {
  it('stays within the clamp range', () => {
    for (const p of FONT_SIZE_PRESETS) {
      expect(p).toBeGreaterThanOrEqual(FONT_SIZE_MIN);
      expect(p).toBeLessThanOrEqual(FONT_SIZE_MAX);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/fontSize.test.ts`
Expected: FAIL — `Cannot find module './fontSize'` (or `clampFontSize is not exported`).

- [ ] **Step 3: Write the minimal implementation**

Create `src/core/fontSize.ts`:

```ts
/** Font-size control bounds and presets. Pure module — no VS Code imports. */

export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 32;
export const FONT_SIZE_STEP = 1;
export const FONT_SIZE_PRESETS = [12, 13, 14, 16, 18, 20, 24];

/** Clamp and round a requested font size into [FONT_SIZE_MIN, FONT_SIZE_MAX]. */
export function clampFontSize(n: number): number {
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)));
}

/**
 * Resolve the effective font size.
 *
 * `notebook.markup.fontSize` is `0` (or unset) when it should inherit from
 * `editor.fontSize`. Returns the markup value when it is a positive number,
 * otherwise the editor value when positive, otherwise the 14px fallback.
 */
export function resolveFontSize(
  markup: number | undefined,
  editor: number | undefined,
): number {
  if (typeof markup === 'number' && markup > 0) return markup;
  if (typeof editor === 'number' && editor > 0) return editor;
  return 14;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/fontSize.test.ts`
Expected: PASS — all 11 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/fontSize.ts src/core/fontSize.test.ts
git commit -m "feat: pure font-size clamp/resolve helpers with tests"
```

---

### Task 2: `registerFontSize` wiring + extension activation

**Files:**
- Create: `src/fontSize.ts`
- Modify: `src/extension.ts` (add one import + one call)

**Interfaces:**
- Consumes (from Task 1, `src/core/fontSize.ts`): `clampFontSize`, `resolveFontSize`, `FONT_SIZE_PRESETS`, `FONT_SIZE_STEP`.
- Produces:
  - `registerFontSize(context: vscode.ExtensionContext): void` (from `src/fontSize.ts`).
  - Command IDs (registered here, referenced by `package.json` in Task 3): `myst-notebook.increaseFontSize`, `myst-notebook.decreaseFontSize`, `myst-notebook.setFontSize`.

- [ ] **Step 1: Write the wiring module**

Create `src/fontSize.ts`:

```ts
import * as vscode from 'vscode';
import {
  clampFontSize,
  resolveFontSize,
  FONT_SIZE_PRESETS,
  FONT_SIZE_STEP,
} from './core/fontSize';

interface FontSizeOption extends vscode.QuickPickItem {
  size: number;
}

/**
 * Register font-size commands and a status-bar item for myst-notebook.
 *
 * One number drives both the markup preview font (`notebook.markup.fontSize`)
 * and the editor/code-cell font (`editor.fontSize`), kept in sync and
 * persisted to Global settings. `notebook.output.fontSize` is left alone.
 */
export function registerFontSize(context: vscode.ExtensionContext): void {
  function currentSize(): number {
    const markup = vscode.workspace
      .getConfiguration('notebook')
      .get<number>('markup.fontSize');
    const editor = vscode.workspace.getConfiguration('editor').get<number>('fontSize');
    return resolveFontSize(markup, editor);
  }

  async function apply(size: number): Promise<number> {
    const clamped = clampFontSize(size);
    await vscode.workspace
      .getConfiguration('notebook')
      .update('markup.fontSize', clamped, vscode.ConfigurationTarget.Global);
    await vscode.workspace
      .getConfiguration('editor')
      .update('fontSize', clamped, vscode.ConfigurationTarget.Global);
    return clamped;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('myst-notebook.increaseFontSize', () =>
      apply(currentSize() + FONT_SIZE_STEP),
    ),
    vscode.commands.registerCommand('myst-notebook.decreaseFontSize', () =>
      apply(currentSize() - FONT_SIZE_STEP),
    ),
    vscode.commands.registerCommand('myst-notebook.setFontSize', async () => {
      const current = currentSize();
      const options: FontSizeOption[] = FONT_SIZE_PRESETS.map((s) => ({
        label: `${s}px`,
        description: s === current ? 'current' : undefined,
        size: s,
      }));
      const picked = await vscode.window.showQuickPick(options, {
        title: 'MyST: Font Size',
        placeHolder: `Current: ${current}px`,
      });
      if (picked) {
        await apply(picked.size);
      }
    }),
  );

  const item = vscode.window.createStatusBarItem(
    'myst-notebook.fontSize',
    vscode.StatusBarAlignment.Right,
    100,
  );
  item.command = 'myst-notebook.setFontSize';
  item.tooltip = 'MyST font size (click to change)';

  const refresh = (): void => {
    const editor = vscode.window.activeNotebookEditor;
    if (editor && editor.notebook.notebookType === 'myst-notebook') {
      item.text = `$(text-size) ${currentSize()}px`;
      item.show();
    } else {
      item.hide();
    }
  };

  refresh();

  context.subscriptions.push(
    item,
    vscode.window.onDidChangeActiveNotebookEditor(refresh),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('notebook.markup.fontSize') ||
        e.affectsConfiguration('editor.fontSize')
      ) {
        refresh();
      }
    }),
  );
}
```

- [ ] **Step 2: Wire it into activation**

Modify `src/extension.ts`. Two changes:

1. Add the import after the `registerSingleClickEdit` import (line 18):

```ts
import { registerSingleClickEdit } from './cellFocus';
import { registerFontSize } from './fontSize';
```

2. Add the registration call after `registerSingleClickEdit(context);` (line 38):

```ts
  // Single-click to enter edit mode (selection-change path)
  registerSingleClickEdit(context);

  // Font-size shortcuts + status-bar dropdown
  registerFontSize(context);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS — no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/fontSize.ts src/extension.ts
git commit -m "feat: register font-size commands and status-bar item"
```

---

### Task 3: package.json commands + keybindings + verification

**Files:**
- Modify: `package.json` (add 3 commands to `contributes.commands`, 2 keybindings to `contributes.keybindings`)

**Interfaces:**
- Consumes (from Task 2): command IDs `myst-notebook.increaseFontSize`, `myst-notebook.decreaseFontSize`, `myst-notebook.setFontSize`.

- [ ] **Step 1: Add the three commands**

In `package.json`, inside `contributes.commands`, add after the `myst-notebook.runCell` entry (the last one):

```json
  {
    "command": "myst-notebook.increaseFontSize",
    "title": "MyST: Increase Font Size",
    "category": "MyST"
  },
  {
    "command": "myst-notebook.decreaseFontSize",
    "title": "MyST: Decrease Font Size",
    "category": "MyST"
  },
  {
    "command": "myst-notebook.setFontSize",
    "title": "MyST: Set Font Size",
    "category": "MyST"
  }
```

(The `myst-notebook.runCell` entry currently ends with `"category": "MyST"\n  }` — add a comma after its closing `}` before the new entries.)

- [ ] **Step 2: Add the two keybindings**

In `package.json`, inside `contributes.keybindings`, add after the `myst-notebook.convertToMarkdown` entry (the last one):

```json
  {
    "command": "myst-notebook.increaseFontSize",
    "key": "ctrl+alt+=",
    "when": "notebookType == 'myst-notebook' && notebookEditorFocused"
  },
  {
    "command": "myst-notebook.decreaseFontSize",
    "key": "ctrl+alt+-",
    "when": "notebookType == 'myst-notebook' && notebookEditorFocused"
  }
```

(Similarly: the `convertToMarkdown` keybinding entry ends with `}` — add a comma before the new entries.)

- [ ] **Step 3: Validate package.json is well-formed**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('valid JSON')"`
Expected: `valid JSON`.

- [ ] **Step 4: Full build**

Run: `npm run build`
Expected: PASS — esbuild bundles extension, renderer, and graph webview with no errors.

- [ ] **Step 5: Full unit test suite**

Run: `npm test`
Expected: PASS — all existing tests plus the new `src/core/fontSize.test.ts` (11 tests) green.

- [ ] **Step 6: Manual smoke check (F5 / Extension Development Host)**

Expected behavior:
1. Open a `.md` file as a MyST Notebook.
2. A status-bar item `$(text-size) 14px` (or your current size) appears on the right.
3. Press `Ctrl+Alt+=` → the number increases by 1, markup preview and code editor both grow; press `Ctrl+Alt+-` → decreases by 1.
4. Click the status-bar item → QuickPick lists `12/13/14/16/18/20/24`; picking one updates both fonts and the status-bar text.
5. Changing the font via the normal VS Code settings UI also refreshes the status-bar text.
6. Switching to a non-notebook editor hides the status-bar item.

- [ ] **Step 7: Commit**

```bash
git add package.json
git commit -m "feat: font-size commands and keybindings in package.json"
```
