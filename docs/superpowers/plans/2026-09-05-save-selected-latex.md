# Save Selected LaTeX Snippet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `Ctrl+Alt+S` shortcut saves the exactly-cursor-selected LaTeX text inside the current notebook cell into the math-symbol store (`.vscode/myst-symbols.json`), making it available in the Math Palette, the Ctrl+Shift+M QuickPick, and the `\` completion list.

**Architecture:** A pure `src/core/mathCompletionItems.ts` module computes the completion entries for custom (user-saved) LaTeX snippets (no VS Code imports). `src/mathCompletion.ts` appends those entries to the existing built-in completion list. A new `myst-notebook.saveSelectedLatex` command in `src/extension.ts` reads the active cell editor's exact selection, guards that it is a real `myst-notebook` cell, trims it, and records it via `store.add` + `provider.refresh`.

**Tech Stack:** TypeScript, VS Code Notebook API (`window.activeTextEditor`, `window.activeNotebookEditor`), vitest.

**Spec:** Approved in-chat design (bounded task — no separate spec file). Key decisions captured in Global Constraints below.

## Global Constraints

- VS Code ≥ 1.85.
- Store **exactly** the cursor-selected text in the **current cell** (trimmed only — no `$` delimiter stripping, no whole-cell/whole-math extraction). Example: selecting `\frac{du}{dt}` inside `$\frac{du}{dt} = \phi$` saves only `\frac{du}{dt}`.
- Guard: the command only runs when the active notebook is `myst-notebook` AND the active text editor's document is one of that notebook's cells (prevents Command-Palette misuse in unrelated files).
- Keybinding: `Ctrl+Alt+S`, `when: notebookType == 'myst-notebook' && editorTextFocus && editorHasSelection`.
- Completion custom entries: include only snippets that are NOT in `MATH_SYMBOLS_BY_LATEX` AND have `count > 0` (explicit saves, not `markSeen`). Sorted in the used-symbol tier (`0_…`) by count desc; plain-text insertion (no snippet).
- Custom completion items use `label`/`insertText` = the latex string, `detail = 'saved'`, `documentation = 'Saved LaTeX snippet'`, and the same `recordMathSymbol` accept command as built-in items.
- Pure logic in `src/core/mathCompletionItems.ts` (no imports); wiring in `src/mathCompletion.ts` and `src/extension.ts`.

---

### Task 1: Pure custom-completion-entries builder

**Files:**
- Create: `src/core/mathCompletionItems.ts`
- Test: `src/core/mathCompletionItems.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exported from `src/core/mathCompletionItems.ts`):
  - `interface CustomCompletionEntry { latex: string; count: number; sortText: string }`
  - `buildCustomCompletionEntries(stored: string[], builtInKeys: { has(latex: string): boolean }, getCount: (latex: string) => number): CustomCompletionEntry[]`

- [ ] **Step 1: Write the failing test**

Create `src/core/mathCompletionItems.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildCustomCompletionEntries } from './mathCompletionItems';

const builtIn = new Set(['\\alpha', '\\beta']);

describe('buildCustomCompletionEntries', () => {
  it('includes custom symbols with positive count', () => {
    const counts: Record<string, number> = { '\\frac{a}{b}': 3 };
    const entries = buildCustomCompletionEntries(['\\frac{a}{b}'], builtIn, (l) => counts[l] ?? 0);
    expect(entries).toHaveLength(1);
    expect(entries[0].latex).toBe('\\frac{a}{b}');
    expect(entries[0].count).toBe(3);
  });

  it('excludes built-in symbols', () => {
    const counts: Record<string, number> = { '\\alpha': 5 };
    const entries = buildCustomCompletionEntries(['\\alpha'], builtIn, (l) => counts[l] ?? 0);
    expect(entries).toHaveLength(0);
  });

  it('excludes zero-count (markSeen) symbols', () => {
    const counts: Record<string, number> = { '\\colon': 0 };
    const entries = buildCustomCompletionEntries(['\\colon'], builtIn, (l) => counts[l] ?? 0);
    expect(entries).toHaveLength(0);
  });

  it('sorts by count descending', () => {
    const counts: Record<string, number> = { '\\a': 1, '\\b': 5, '\\c': 3 };
    const entries = buildCustomCompletionEntries(['\\a', '\\b', '\\c'], builtIn, (l) => counts[l] ?? 0);
    expect(entries.map(e => e.latex)).toEqual(['\\b', '\\c', '\\a']);
  });

  it('emits tier-0 sortText (used-symbol tier)', () => {
    const counts: Record<string, number> = { '\\a': 1 };
    const entries = buildCustomCompletionEntries(['\\a'], builtIn, (l) => counts[l] ?? 0);
    expect(entries[0].sortText).toMatch(/^0_/);
  });

  it('higher count gets earlier sortText', () => {
    const counts: Record<string, number> = { '\\a': 1, '\\b': 100 };
    const entries = buildCustomCompletionEntries(['\\a', '\\b'], builtIn, (l) => counts[l] ?? 0);
    const byLatex = Object.fromEntries(entries.map(e => [e.latex, e.sortText]));
    expect(byLatex['\\b'] < byLatex['\\a']).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/mathCompletionItems.test.ts`
Expected: FAIL — `Cannot find module './mathCompletionItems'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/core/mathCompletionItems.ts`:

```ts
/** Custom saved-LaTeX completion entries. Pure module — no VS Code imports. */

export interface CustomCompletionEntry {
  latex: string;
  count: number;
  sortText: string;
}

/**
 * Build the completion entries for custom (user-saved) LaTeX snippets.
 *
 * A snippet is included only when it is NOT already in the built-in symbol
 * list AND has a positive usage count (i.e. was explicitly saved via
 * `myst-notebook.saveSelectedLatex`, not merely markSeen'd by the linter).
 * Entries sort in the used-symbol tier (`0_…`), by count descending.
 */
export function buildCustomCompletionEntries(
  stored: string[],
  builtInKeys: { has(latex: string): boolean },
  getCount: (latex: string) => number,
): CustomCompletionEntry[] {
  const entries: CustomCompletionEntry[] = [];
  stored.forEach((latex, i) => {
    if (builtInKeys.has(latex)) return;
    const count = getCount(latex);
    if (count <= 0) return;
    const countKey = String(9999 - Math.min(count, 9999)).padStart(4, '0');
    entries.push({
      latex,
      count,
      sortText: `0_${countKey}_c${String(i).padStart(4, '0')}`,
    });
  });
  entries.sort((a, b) => a.sortText.localeCompare(b.sortText));
  return entries;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/mathCompletionItems.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/mathCompletionItems.ts src/core/mathCompletionItems.test.ts
git commit -m "feat: pure custom-completion-entries builder with tests"
```

---

### Task 2: Append custom entries in the completion provider

**Files:**
- Modify: `src/mathCompletion.ts` (imports + `provideCompletionItems` body)

**Interfaces:**
- Consumes (from Task 1): `buildCustomCompletionEntries`.
- Consumes (existing): `MathSymbolStore.getStats`, `MathSymbolStore.getAll`, `MATH_SYMBOLS_BY_LATEX`.

- [ ] **Step 1: Update imports**

In `src/mathCompletion.ts`, replace:

```ts
import { MATH_SYMBOLS } from './mathSymbols';
```

with:

```ts
import { MATH_SYMBOLS, MATH_SYMBOLS_BY_LATEX } from './mathSymbols';
import { buildCustomCompletionEntries } from './core/mathCompletionItems';
```

- [ ] **Step 2: Append custom entries before the return**

In `provideCompletionItems`, immediately before `return items;`, add:

```ts
    // Custom saved LaTeX snippets (added via Ctrl+Alt+S)
    const customEntries = buildCustomCompletionEntries(
      this.store.getAll(),
      MATH_SYMBOLS_BY_LATEX,
      (latex) => this.store.getStats(latex)?.count ?? 0,
    );
    for (const entry of customEntries) {
      const item = new vscode.CompletionItem(entry.latex, vscode.CompletionItemKind.Value);
      item.detail = 'saved';
      item.documentation = 'Saved LaTeX snippet';
      item.insertText = entry.latex;
      if (replaceRange) {
        item.range = replaceRange;
      }
      item.sortText = entry.sortText;
      if (this.acceptCommand) {
        item.command = {
          command: this.acceptCommand.command,
          title: this.acceptCommand.title,
          arguments: [entry.latex],
        };
      }
      items.push(item);
    }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS — no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/mathCompletion.ts
git commit -m "feat: show saved LaTeX snippets in backslash completion"
```

---

### Task 3: Save command + package.json + verification

**Files:**
- Modify: `src/extension.ts` (register `myst-notebook.saveSelectedLatex`)
- Modify: `package.json` (1 command + 1 keybinding)

**Interfaces:**
- Consumes (existing, in `activate` scope): `store` (`MathSymbolStore`), `provider` (`MathSymbolProvider`).
- Produces: command ID `myst-notebook.saveSelectedLatex`.

- [ ] **Step 1: Register the save command**

In `src/extension.ts`, locate the `recordMathSymbol` command block:

```ts
  // Command: record a math symbol as explicitly used (fired by completion accept)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'myst-notebook.recordMathSymbol',
      (latex: string) => store.add(latex),
    ),
  );
```

Add the following immediately after it:

```ts
  // Command: save the exact cursor-selected LaTeX in the current cell
  context.subscriptions.push(
    vscode.commands.registerCommand('myst-notebook.saveSelectedLatex', () => {
      const editor = vscode.window.activeTextEditor;
      const nbEditor = vscode.window.activeNotebookEditor;
      if (!editor || !nbEditor || nbEditor.notebook.notebookType !== 'myst-notebook') {
        void vscode.window.showInformationMessage('MyST: Save LaTeX works inside a MyST notebook cell.');
        return;
      }
      const isCell = nbEditor.notebook.getCells().some((c) => c.document === editor.document);
      if (!isCell) {
        void vscode.window.showInformationMessage('MyST: select text inside a notebook cell first.');
        return;
      }
      const text = editor.document.getText(editor.selection).trim();
      if (!text) {
        void vscode.window.showInformationMessage('MyST: select LaTeX text first.');
        return;
      }
      store.add(text);
      provider.refresh();
      void vscode.window.showInformationMessage(`MyST: saved "${text}" to math symbols.`);
    }),
  );
```

- [ ] **Step 2: Add the command to package.json**

Inside `contributes.commands`, add:

```json
  {
    "command": "myst-notebook.saveSelectedLatex",
    "title": "MyST: Save Selected LaTeX",
    "category": "MyST"
  }
```

- [ ] **Step 3: Add the keybinding to package.json**

Inside `contributes.keybindings`, add:

```json
  {
    "command": "myst-notebook.saveSelectedLatex",
    "key": "ctrl+alt+s",
    "when": "notebookType == 'myst-notebook' && editorTextFocus && editorHasSelection"
  }
```

(Mind the commas between entries.)

- [ ] **Step 4: Validate package.json**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('valid JSON')"`
Expected: `valid JSON`.

- [ ] **Step 5: Full build + unit tests**

Run: `npm run build` then `npm test`
Expected: PASS — esbuild succeeds; all tests green including `src/core/mathCompletionItems.test.ts` (6 tests).

- [ ] **Step 6: F5 smoke check**

Expected behavior:
1. In a MyST Notebook markup cell, type `$\frac{du}{dt} = \phi$`.
2. Select exactly `\frac{du}{dt}` with the cursor, press `Ctrl+Alt+S` → toast `saved "\frac{du}{dt}" to math symbols.`.
3. The Math Palette sidebar now lists `\frac{du}{dt}`.
4. Press `Ctrl+Shift+M` → `\frac{du}{dt}` appears in the "Recently used" section; picking it inserts it at the cursor.
5. In another cell, type `\fr` → the completion list includes `\frac{du}{dt}` (detail `saved`); accepting it inserts the full string and replaces `\fr`.
6. Pressing `Ctrl+Alt+S` with no selection does nothing (keybinding guarded by `editorHasSelection`); via Command Palette with no selection it shows the "select LaTeX text first" message.
7. `\alpha` (a built-in symbol) selected and saved does NOT produce a duplicate — its built-in entry just rises in usage.

- [ ] **Step 7: Commit**

```bash
git add src/extension.ts package.json
git commit -m "feat: save selected LaTeX snippet shortcut (Ctrl+Alt+S)"
```
