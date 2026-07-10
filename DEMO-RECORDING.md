# Demo GIF Recording Guide

## Setup

1. Open `myst-notebook/` in VS Code, press **F5** to launch Extension Dev Host
2. In the dev host, open `test-fixtures/smoke-workspace/` folder
3. Close all sidebar panels except the Explorer
4. Set editor font size to 14–16 (bigger = more readable in GIF)
5. Install **Peek**: `sudo apt install peek`

## Recording settings (Peek)

- Window size: 1280×720 or 1024×600
- FPS: 15 (GIF doesn't need 30)
- Format: GIF
- Cursor capture: Yes

---

## Clip 1 — Open + first render (15–20s)

**Goal:** show the core value in one shot — open a `.md`, see it render.

1. Start recording, window focused on the dev host
2. `chapter.md` is open as plain markdown → right-click tab → **Reopen Editor With… → MyST Notebook**
3. The file transforms: cells appear, existing prose renders, math renders
4. Click between cells to show rendering
5. Type a new paragraph → click away → it renders

**What this proves:** zero-config, instant visual feedback.

---

## Clip 2 — Code execution (20–25s)

**Goal:** show that `{code-cell}` blocks actually run.

1. Press **Ctrl+Shift+E** → a collapsed `{code-cell}` appears
2. Type `import numpy as np; print(np.linspace(0, 10, 5))`
3. Press **Shift+Enter** → output appears below
4. Press **Ctrl+Shift+E** again → type a simple plot or print → run it

**What this proves:** real Jupyter execution, no Jupyter extension needed.

---

## Clip 3 — Math input (10–15s)

**Goal:** show KaTeX rendering and the math palette.

1. In a markup cell, type `$E = mc^2$` → move focus → it renders
2. Type `$$\\int_0^\\infty e^{-x} dx = 1$$` → move focus → display math renders
3. Type `$\` → autocomplete pops up → pick a symbol
4. (Optional) Show the Math Palette sidebar → click a symbol to insert

**What this proves:** math-first authoring, LaTeX stays readable.

---

## Clip 4 — Knowledge graph (15–20s)

**Goal:** show wikilinks and graph visualization.

1. Create a few cells with `[[some-note]]` wikilinks
2. Press **Ctrl+Shift+G** → the knowledge graph webview opens
3. Drag a node around to show interactivity
4. (Optional) Show the Backlinks panel in Explorer

**What this proves:** MyST-aware linking, graph works offline.

---

## After recording

- Trim dead space at beginning/end (Peek has basic trimming)
- If GIF too large (>5MB), compress with `gifsicle`: `gifsicle -O3 input.gif -o output.gif`
- Name files: `demo-render.gif`, `demo-run.gif`, `demo-math.gif`, `demo-graph.gif`
- Place in `myst-notebook/media/` (update README paths if needed)

## Quick shots (screenshots)

If GIFs are too heavy, fall back to well-cropped screenshots:
- Before/after: plain `.md` vs MyST Notebook view
- A code cell with output visible
- Math palette in sidebar
- Graph view
