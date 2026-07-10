# MyST Notebook

**Write MyST Markdown e-books in VS Code — rendered inline, no preview pane, no build step.**

---

## The problem with existing tools

| Tool | Pain |
|------|------|
| Jupyter Notebook | Browser-based, heavy, not a writing environment |
| VS Code Markdown Preview | Separate pane, not MyST-aware, can't execute cells |
| Quarto | Separate render step — you write blind, then build to see |
| JupyterBook CLI | Build-only, no live editing |

**MyST Notebook is different.** It opens your `.md` source directly in VS Code's notebook editor. Prose renders in place when you leave a cell — headings, math, directives, figures all appear inline. You never leave your editor. You never run a build. You just type.

---

## What it looks like

- Type a paragraph → move focus away → it renders.
- Press **Enter** at the end of a paragraph → a new cell opens below, cursor ready.
- Press **Ctrl+Shift+E** → an executable code cell appears, collapsed, cursor inside.
- Press **Shift+Enter** → the cell runs, output streams in live.
- Press **Ctrl+D** → the cell is gone.

The document is the notebook. The notebook is the document.

---

## Features

### Inline rendering — no preview pane

Prose, math (`$...$`, `$$...$$`), admonitions (`:::{{note}}`, `:::{{warning}}`, …), and figures (`:::{{figure}}`) render in place. KaTeX fonts are bundled — math renders offline with no CDN required.

### Auto-split while you type

Finishing a paragraph by pressing Enter automatically creates a new cell below and moves the cursor into it. Blank lines inside fences (`:::`, ` ``` `) are handled correctly — the split is MyST-aware.

### Code execution — no Jupyter extension

Code cells (`{{code-cell}}` blocks) run against a Python environment MyST discovers itself via the Python extension. It launches its own Jupyter server, so the full 450 MB Jupyter extension is not required. First run shows a quick-pick of available environments (venv, conda, pyenv, poetry, system); MyST remembers the choice for the workspace. Missing `ipykernel` or `jupyter-server`? MyST offers to install them.

Output streams incrementally as cells run — no waiting for completion.

### Lossless round-trip

The serializer reads and writes your `.md` source with a strict lossless guarantee. `serialize(deserialize(text)) === text`. Nothing is reordered or rewritten.

### Zotero citations

One command configures the [Citation Picker for Zotero](https://marketplace.visualstudio.com/items?itemName=mblode.zotero) to insert MyST `` {{cite}}`key` `` references directly from your Zotero library.

---

## Keyboard shortcuts

### Writing

| Key | Action |
|-----|--------|
| **Enter** | Split cell at cursor — or insert newline if inside a fence or empty cell |
| **Alt+Enter** | Insert a literal newline without splitting |
| **Shift+Enter** | Run cell and advance |

### Cells

| Key | Action |
|-----|--------|
| **Ctrl+D** | Delete selected cell (when not in edit mode) |
| **Ctrl+Shift+E** | Insert executable `{{code-cell}}` below |
| **Ctrl+Shift+D** | Insert display-only code block below |

### Math input

| Key | Action |
|-----|--------|
| **`\`** inside `$...$` | Autocomplete — shows searchable symbol list inline |
| **Ctrl+Shift+M** | Open symbol picker (recently used first) |

Type `\al` inside a math block and VS Code's autocomplete shows `\alpha`, `\aleph`, etc. The sidebar **Math Palette** panel (Explorer) collects symbols you've written and lets you click to re-insert them.

### Zotero

| Key | Action |
|-----|--------|
| **Alt+Shift+Z** | Open citation picker and insert `` {{cite}}`key` `` |

### Kernel management (Command Palette)

| Command | Action |
|---------|--------|
| **MyST: Restart Kernel** | Restart kernel, clear all state |
| **MyST: Interrupt Kernel** | Send SIGINT to interrupt a running cell |

---

## Requirements

- **VS Code 1.85+**
- **Python extension** (`ms-python.python`) — for environment discovery
- **A Python environment** — only needed to run code cells. Editing, rendering, and saving work without one.

Optional: [Zotero](https://www.zotero.org/) + [Better BibTeX](https://retorque.re/zotero-better-bibtex/) for citation support.

---

## Getting started

1. Open a `.md` file that is part of a MyST / Jupyter Book project (one with a `myst.yml`).
2. Click **Open as MyST Notebook** in the editor toolbar (or run **MyST: Open as MyST Notebook** from the Command Palette). MyST also offers this automatically the first time you open a `.md` in a MyST workspace.
3. Start writing.

To make MyST Notebook the default for `.md` files: open **Configure default editor for '.md'** in the Command Palette and select **MyST Notebook**.

---

## Known limitations

- **Relative local image paths** in `figure`/`image` directives may not resolve in the renderer sandbox. Absolute `https://` URLs and data URIs work.
- **CRLF line endings** are out of scope for v1 (LF assumed).
- **Multi-block auto-split** (a cell that already contains blank-line-separated blocks) uses a structural rewrite; VS Code may leave the new cell selected but not enter edit mode — a VS Code limitation with no reliable workaround.
- **Inter-block normalization**: blank-line separation is canonicalized to one blank line on first save. This is a one-time change; already-canonical files round-trip exactly.

---

## Why I built this

I write technical documents in MyST, and every existing workflow forced the same compromise: write blind in a plain editor, then run a build to see if it looked right. Preview panes split my attention; Jupyter pulled me into a browser; Quarto and JupyterBook made me stop and compile. None of them let me *write* the way the document actually reads.

So I built the tool I wanted — the source file **is** the notebook, rendered in place, no build step, no second window. If you've felt the same friction, this is for you.

---

## Support this project

MyST Notebook is free and open source, and it always will be. If it saves you time or you'd like to see it keep improving, you can support the work:

[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?logo=github)](https://github.com/sponsors/RequieMa)

Starring the [repo](https://github.com/RequieMa/myst-notebook) and sharing it with others who write in MyST helps just as much — it's how the project reaches the people who need it.

---

## Development

```bash
npm install
npm run build   # bundle via esbuild
npm test        # vitest (pure-core serializer tests)
```

**F5** in VS Code launches the Extension Development Host.

```bash
npx @vscode/vsce package   # produces myst-notebook-x.x.x.vsix
```

C4 architecture diagrams live in [`docs/diagrams/`](docs/diagrams/README.md).

---

## License

MIT
