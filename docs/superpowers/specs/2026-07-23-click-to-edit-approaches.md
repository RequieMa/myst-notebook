# Single-Click Edit for Markup Cells — Approach Inventory

**Date:** 2026-07-23
**Status:** exploring

## Root Cause

`onDidChangeNotebookEditorSelection` only fires when the selection **changes**.
If a markup cell is already selected, clicking on its rendered content does NOT
change the selection → event doesn't fire → handler never runs.

There is no public VS Code API to:
- Detect clicks on rendered markup cell content
- Read/set a cell's edit state (Editing vs Preview)

Confirmed by VS Code maintainer isidorn in [microsoft/vscode-discussions#1839](https://github.com/microsoft/vscode-discussions/discussions/1839).

## Approaches (recommended order)

### Approach 1: Event + Button combo (recommended first try)

**Mechanism:**
- `onDidChangeNotebookEditorSelection` fires when selection changes (user
  clicks a DIFFERENT cell or first click on a cell) → auto-enter edit mode
- Cell status bar "✏️ Edit" button as fallback for clicking the SAME cell again

**Implementation:**
1. `cellFocus.ts`: on selection change to a NEW markup cell → `setTimeout(50)` → `notebook.cell.edit`
2. `cellStatusBar.ts`: add "✏️ Edit" `NotebookCellStatusBarItem` on markup cells
   (alongside `▶ Run` on code cells), click → `notebook.cell.edit`

**Pros:** Natural first-click UX; button handles re-clicks; both use proven APIs
**Cons:** Re-clicking same cell needs button

---

### Approach 2: Button-only ("✏️ Edit" on every markup cell)

**Mechanism:**
- `NotebookCellStatusBarItem` on every markup cell showing "✏️ Edit"
- Click button → `notebook.cell.edit`
- Same pattern as the `▶ Run` button on code cells

**Implementation:**
- Extend `cellStatusBar.ts` to also create items for markup cells
- Item command: `myst-notebook.editCell` (new command)

**Pros:** Reliable, consistent UX, proven API
**Cons:** Not "click on cell" but "click on button"

---

### Approach 3: Markup cells as Code cells (language=markdown)

**Mechanism:**
- In `cellFactory.ts`, change markup cells from `NotebookCellKind.Markup` to
  `NotebookCellKind.Code` with `languageId: 'markdown'`
- Code cells naturally auto-enter edit mode on single click

**Implementation:**
- Modify `rawCellToData()` in `cellFactory.ts`
- Check impact on serializer, renderer, enterSplit, and execution

**Pros:** No hack needed — native VS Code behavior
**Cons:** Breaks inline markdown rendering (Code cells don't use markdown-it
  renderer); huge impact on the extension's core value proposition

---

### Approach 4: NotebookCellStatusBarItemProvider

**Mechanism:**
- Register a `NotebookCellStatusBarItemProvider` for `myst-notebook` type
- VS Code calls the provider for every cell; we return "✏️ Edit" for markup cells

**Pros:** More efficient than per-cell items (VS Code manages lifecycle)
**Cons:** Same UX as Approach 2 (button, not click-on-cell)

---

### Approach 5: Renderer Messaging (speculative)

**Mechanism:**
- Add `requiresMessaging: "optional"` to `myst-markdown-it` renderer contribution
- Inject click-handling JS into rendered HTML output
- Use `postMessage` to notify extension host when user clicks rendered content
- Extension host calls `notebook.cell.edit`

**Pros:** Closest to "click on cell" behavior
**Cons:** Markdown-it renderers use `extendMarkdownIt()` API which may not
  support `postMessage`; JS injection may be blocked by webview sandbox;
  significant research needed to confirm feasibility

---

### Approach 6: Accept VS Code limitation

**Mechanism:**
- Remove `cellFocus.ts` entirely
- Document that markup cells require double-click or Enter to edit
- This is VS Code's default behavior for all notebook extensions

**Pros:** No hack, no maintenance burden
**Cons:** User feedback explicitly identified this as a pain point

---

## Decision Log

| Date | Decision |
|------|----------|
| 2026-07-23 | Trying in order: 1 → 2 → 3 → 4 → 5 → 6 |
