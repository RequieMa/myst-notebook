# Spec: Alt+Enter newline + Ctrl+D delete cell

**Date:** 2026-07-03  
**Status:** Approved

## Problem

Two missing keybindings in the MyST Notebook editor:

1. No way to insert a literal newline inside a markup cell. `Enter` always splits (or inserts a newline only inside open constructs). Users who want a blank line within a paragraph have no affordance.
2. No keyboard shortcut to delete a selected cell. Users must reach for the mouse or command palette.

## Design

### Alt+Enter — force newline

**What it does:** Always inserts a literal `\n` at the cursor, regardless of cell content or cursor context.

**Implementation:**
- Export the existing private `insertNewline()` function from `src/enterSplit.ts`.
- Register `myst-notebook.insertNewline` in `src/extension.ts` (one-liner calling `insertNewline()`).
- Add a keybinding in `package.json`:

```json
{
  "command": "myst-notebook.insertNewline",
  "key": "alt+enter",
  "when": "notebookType == 'myst-notebook' && editorTextFocus"
}
```

`editorTextFocus` scopes this to when the cell's text editor is active (typing mode). Works uniformly regardless of cursor position — inside a fence, inside a paragraph, anywhere.

### Ctrl+D — delete focused cell

**What it does:** Deletes the currently selected cell when the cell is selected but not in edit mode.

**Implementation:** Pure keybinding only — no new TypeScript. Delegates to VS Code's built-in `notebook.cell.delete`:

```json
{
  "command": "notebook.cell.delete",
  "key": "ctrl+d",
  "when": "notebookType == 'myst-notebook' && notebookEditorFocused && !inputFocus"
}
```

`notebookEditorFocused && !inputFocus` = a cell is selected but its text editor is not active (not in edit/typing mode). This matches the user's intent: "nothing is in focus" means the cell outline is highlighted but you're not inside it.

## Files changed

| File | Change |
|------|--------|
| `src/enterSplit.ts` | Export `insertNewline` |
| `src/extension.ts` | Register `myst-notebook.insertNewline` command |
| `package.json` | Add `myst-notebook.insertNewline` command declaration + two keybindings |

## Non-goals

- No changes to `Enter` or `Shift+Enter` behaviour.
- `Ctrl+D` does NOT fire in edit mode (intentional — `Ctrl+D` has text-editor meaning there, e.g. select next occurrence).
- No new unit tests needed (no pure logic; VS Code glue only).
