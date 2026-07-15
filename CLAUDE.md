# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A VS Code extension that turns `.md` files in MyST/Jupyter Book projects into editable notebook documents. Prose and math (`$...$`, `$$...$$`) render in place via KaTeX, `{code-cell}` blocks execute through Jupyter, and a knowledge graph visualizes `[[wikilinks]]` and citations.

## Commands

```bash
npm run build              # bundle extension + renderer + graph webview (esbuild)
npm run watch              # build in watch mode
npm test                   # run unit tests (vitest, matches src/**/*.test.ts)
npm run test:integration   # full build + integration test via vscode-test
```

`npm run build` must succeed before tests or F5 debugging — it generates `renderer/generated/katexCss.ts` (KaTeX CSS with woff2 fonts inlined as data URIs) which is gitignored.

## Architecture

Three bundles produced by `esbuild.js` from a single `npm run build`:

| Bundle | Entry | Format | Target | Output |
|--------|-------|--------|--------|--------|
| Extension host | `src/extension.ts` | CJS | Node | `dist/extension.js` |
| Notebook renderer | `renderer/mystRenderer.ts` | ESM | Browser (webview) | `dist/renderer/mystRenderer.js` |
| Graph webview | `src/graph/webview-src/main.ts` | IIFE | Browser | `dist/graph/webview.js` |

### Activation flow (`src/extension.ts`)

`activate()` wires everything in order: serializer → controller (execution) → kernel commands → Enter-split → insert-cell commands → workspace chrome → math palette/completion/linter → Zotero setup → onboarding → graph features. Each subsystem is a self-contained registration call; the function is long but flat.

### Serialization round-trip (`src/core/serializer.ts` + `src/mystSerializer.ts`)

`core/serializer.ts` is a pure module (no VS Code types). `textToCells()` splits MyST text into `RawCell[]` via `blockSplitter.ts`; `cellsToText()` reassembles. The contract: operates on newline-stripped canonical text — the `MystSerializer` adapter owns the file's trailing newline. `cellFactory.ts` is the **single** `RawCell → NotebookCellData` mapper, used by both load and type-time cell creation paths.

### Code execution (`src/mystController.ts` + `src/kernelSession.ts`)

`MystController` is the `NotebookController`. It resolves a kernel session per notebook, starting an on-demand Jupyter server via `child_process.spawn()` and connecting over WebSocket (`@jupyterlab/services`). Key design points:

- **`KernelSession` is a backend-agnostic interface** — no `@jupyterlab/services` type leaks through. `kernelSession.ts` exports only `KernelSession`, `KernelOutput`, and `startServerKernel`.
- **Output streams incrementally** — `executeCode()` returns an `AsyncIterable<KernelOutput>`; the controller coalesces successive stdout/stderr chunks into the same output block.
- **Stale detection** — a kernel that dies or disconnects marks itself `isStale`; the controller evicts and re-resolves on next run.
- **Deduped concurrent starts** — `resolveSession()` has a `pending` map so overlapping run clicks don't spawn duplicate Jupyter servers.

### Kernel resolution pipeline

1. `pythonEnvService.ts` discovers Python environments via the `ms-python.python` extension API (stateless, returns plain `KernelSpecInfo[]` — no ms-python types leak).
2. `core/kernelResolution.ts` is a **pure function** returning a discriminated union (`use | needsIpykernel | pick | none`) — fully unit-testable without an extension host.
3. `envSetup.ts` probes for `ipykernel` + `jupyter-server` in the chosen interpreter, offers one-click install via the Tasks API, re-probes.
4. `kernelSession.ts` spawns the Jupyter server, connects, starts a `python3` kernel, returns a `KernelSession`.

### Enter-to-split (`src/enterSplit.ts`)

The most nuanced focus-management code in the extension. On Enter in a markup cell:
- Shorthand fences (` ```run`, ` ```show`) expand on close → replaceCells (structural edit, focus reset unavoidable).
- Common path (single paragraph): **quitEdit → additive insertCells** (does NOT corrupt VS Code's internal focused-cell pointer) → set `nbEditor.selection` → `notebook.cell.edit`. This is the only reliable pattern.
- Empty cells or cells inside an open construct (`hasOpenConstruct()` in `blockSplitter.ts`) just insert a newline.

### Knowledge graph (`src/graph/`)

Forked from Foam (foam-core), adapted for MyST. `graph/index.ts` bootstraps a Foam workspace over the VS Code workspace and registers five features: graph webview (D3 force-graph in a Lit-based webview), backlinks tree view, navigation (DefinitionProvider), hover provider, and link completion. The MyST citation parser (`myst-citation-parser.ts`) makes `{cite}` roles visible as graph nodes.

### Renderer (`renderer/mystRenderer.ts`)

A markdown-it plugin that extends VS Code's built-in notebook renderer with inline `$...$` and block `$$...$$` math (KaTeX) and `{code-cell}` fence rendering. **MyST colon-fence directives** (`:::{note}`, `:::{warning}`, etc.) are intentionally NOT rendered — VS Code's notebook renderer uses `md.renderInline()` which skips block-level processing. They appear as source text and are handled at build time by `jupyter-book build`.

### Test structure

- Unit tests: `src/**/*.test.ts`, run via vitest. VS Code is stubbed (`src/__stubs__/vscode.ts`). Core modules (`blockSplitter`, `serializer`, `kernelResolution`, `tags`, `shorthand`, etc.) are tested pure.
- Integration/smoke tests: `src/test/smoke.test.ts`, run via `@vscode/test-cli` in a real VS Code instance. Needs `npm run build` first.

## Key constraints

- **VS Code ≥ 1.85** required (Notebook API used throughout).
- **`ms-python.python`** is an `extensionDependencies` — installed automatically, required for Python env discovery.
- **CRLF** is out of scope for v1; the block splitter assumes LF line endings.
- **Blank-line normalization**: inter-block separation is canonicalized to a single blank line on first save. Files already in canonical form round-trip byte-for-byte.
- **Relative local images** may not resolve in the renderer sandbox; use `https://` URLs or data URIs.
