# Smoke Test Checklist — MyST Notebook v0.1.0

Run through these before publishing to the Marketplace. Each item should take ~30 seconds.

## Setup

1. Open `myst-notebook/` folder in VS Code
2. Press **F5** → a new window opens titled **"[Extension Development Host]"**
3. In the dev host, open the `test-fixtures/smoke-workspace/` folder

---

## 1. Open as MyST Notebook

- [ ] `test-fixtures/smoke-workspace/chapter.md` opens as a normal markdown file
- [ ] Right-click the tab → **Reopen Editor With… → MyST Notebook** → the file reopens with rendered cells
- [ ] The toolbar button **Open as MyST Notebook** also works (icon in editor title bar)

## 2. Prose rendering

- [ ] Type a paragraph in a markup cell, then click into another cell → the paragraph renders (headings, lists, bold, links)
- [ ] `$E = mc^2$` renders as inline KaTeX math
- [ ] `$$...$$` renders as display math
- [ ] Admonitions (`:::{note}`, `:::{warning}`) render with colored borders

## 3. Cell splitting

- [ ] Press **Enter** at the end of a paragraph in a markup cell → a new empty cell appears below, cursor in it
- [ ] Press **Enter** inside a `:::` fence block → inserts a newline without splitting (not inside a fence)
- [ ] Press **Enter** in an empty cell → inserts a newline

## 4. Code execution

- [ ] Press **Ctrl+Shift+E** → an executable `{code-cell}` appears (collapsed), cursor inside
- [ ] Type `print("hello")` and press **Shift+Enter** → output streams live below
- [ ] Press **Ctrl+Shift+D** → a display-only code block appears (not executable, the cell shows "Display Code")
- [ ] Press **Ctrl+D** (with cell focused, not editing) → a cell is deleted

## 5. Math palette

- [ ] In a markup cell, type `$` then `\alpha` → autocomplete appears inline
- [ ] Press **Ctrl+Shift+M** → math symbol picker opens (recently used first)
- [ ] The **Math Palette** panel is visible in the Explorer sidebar

## 6. Save & round-trip

- [ ] Make edits, press **Ctrl+S** → the `.md` file on disk contains your changes
- [ ] Reopen the file as a regular `.md` → all MyST syntax is intact, no formatting damage

## 7. Install from .vsix (production-like)

- [ ] In your **normal** VS Code (not Extension Dev Host):
  - **Extensions** panel → **…** (top-right) → **Install from VSIX…**
  - Select `myst-notebook/myst-notebook-0.1.0.vsix`
- [ ] Open a `.md` file in a MyST project → **Reopen Editor With… → MyST Notebook**
- [ ] Prose renders, math renders, code cells run

---

## Found an issue?

Note it here and we'll triage before publishing.
