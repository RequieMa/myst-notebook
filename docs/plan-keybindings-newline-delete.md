# Keybindings: Alt+Enter Newline + Ctrl+D Delete Cell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Alt+Enter` to force a literal newline inside a markup cell, and `Ctrl+D` to delete the selected cell when not in edit mode.

**Architecture:** Export the existing private `insertNewline()` helper, register it as a named command, and add two `package.json` keybinding entries. `Ctrl+D` requires no new TypeScript — it delegates to VS Code's built-in `notebook.cell.delete`.

**Tech Stack:** TypeScript, VS Code Extension API (`package.json` contributes.commands + contributes.keybindings).

---

### Task 1: Export `insertNewline` and register the command

**Files:**
- Modify: `src/enterSplit.ts` (export the private function)
- Modify: `src/extension.ts` (register command)
- Modify: `package.json` (declare command + two keybindings)

- [ ] **Step 1: Export `insertNewline` from `enterSplit.ts`**

  In `src/enterSplit.ts`, change line 184 from:

  ```typescript
  function insertNewline(): Thenable<unknown> {
  ```

  to:

  ```typescript
  export function insertNewline(): Thenable<unknown> {
  ```

- [ ] **Step 2: Register the command in `extension.ts`**

  In `src/extension.ts`, add the import at the top alongside the existing `registerEnterSplit` import:

  ```typescript
  import { registerEnterSplit, insertNewline } from './enterSplit';
  ```

  Then, after the `registerEnterSplit(context)` call (around line 36), add:

  ```typescript
  // Alt+Enter: force a literal newline inside a markup cell
  context.subscriptions.push(
    vscode.commands.registerCommand('myst-notebook.insertNewline', () => insertNewline())
  );
  ```

- [ ] **Step 3: Declare the command in `package.json`**

  In the `contributes.commands` array (after the `myst-notebook.interruptKernel` entry, around line 131), add:

  ```json
  {
    "command": "myst-notebook.insertNewline",
    "title": "MyST Notebook: Insert Newline"
  },
  ```

- [ ] **Step 4: Add the two keybindings in `package.json`**

  In the `contributes.keybindings` array, add both entries (after the existing `ctrl+shift+d` entry):

  ```json
  {
    "command": "myst-notebook.insertNewline",
    "key": "alt+enter",
    "when": "notebookType == 'myst-notebook' && editorTextFocus"
  },
  {
    "command": "notebook.cell.delete",
    "key": "ctrl+d",
    "when": "notebookType == 'myst-notebook' && notebookEditorFocused && !inputFocus"
  }
  ```

- [ ] **Step 5: Type-check**

  ```bash
  cd myst-notebook && npx tsc --noEmit
  ```

  Expected: no output (clean).

- [ ] **Step 6: Run tests**

  ```bash
  npm test
  ```

  Expected: `187 passed` (count may grow if other tasks added tests; all should pass).

- [ ] **Step 7: Build and package**

  ```bash
  npx @vscode/vsce package
  ```

  Expected: `myst-notebook-0.0.1.vsix` produced, no errors.

- [ ] **Step 8: Commit**

  ```bash
  git add src/enterSplit.ts src/extension.ts myst-notebook/package.json
  git commit -m "feat(myst-notebook): Alt+Enter force newline; Ctrl+D delete cell"
  ```

---

## Manual verify (requires extension host)

Install the `.vsix`, open a `.md` MyST notebook, and confirm:

1. **Alt+Enter inside a paragraph** → inserts a literal newline, does NOT split the cell.
2. **Alt+Enter inside a `:::` admonition or `$$` block** → also inserts a newline (same as before, but now also accessible via Alt+Enter).
3. **Ctrl+D with a cell selected (not in edit mode)** → deletes the cell.
4. **Ctrl+D while typing inside a cell (edit mode)** → does NOT delete (should do its normal editor action — select next occurrence — or nothing).
