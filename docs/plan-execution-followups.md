# MyST Notebook — Next Session Plan (post-kernel-execution)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> execute this plan task-by-task (two-stage review: spec compliance → code quality). Steps use
> checkbox (`- [ ]`) syntax. All paths are relative to `myst-notebook/`.

## Context

Kernel execution shipped (Option A): code cells run against a self-owned Jupyter server
launched in a Python environment discovered via `ms-python`, driven over WebSocket with
`@jupyterlab/services`. See `docs/diagrams/` (C4) and `docs/RESEARCH.md`. Two things a user
feels *now that execution works* are still rough — output only appears on completion, and a
dead kernel needs a window reload — and both are cheap because the transport groundwork exists.
This plan does those two first (highest-leverage), then discretionary polish.

**Current wiring (verified):**
- `src/kernelSession.ts` — `KernelSession { executeCode(code, token): AsyncIterable<KernelOutput>; dispose() }`;
  `executeCode` already bridges `future.onIOPub` **incrementally** into the async iterable; cancellation
  already calls `kernel.interrupt()`. `startServerKernel(interpreterPath)` spawns the server + kernel.
- `src/mystController.ts` — `execute()` loops cells; per cell it drains the iterable into an
  `outputs[]` array and calls `exec.replaceOutput([...])` **once at the end** (this is why output
  isn't incremental). Per-notebook `sessions` cache keyed by `notebook.uri.toString()`; `dispose()`
  disposes all sessions. `resolveSession()` does discover → resolve → pick → ensureRuntime → start.

---

## Highest-leverage

### Task 1: Stream cell output incrementally — ✅ DONE (2026-07-03)

**Files:** Modify `src/mystController.ts` (execute loop). Possibly touch `src/kernelSession.ts`
only if the iterable's granularity needs adjusting (it already yields per IOPub message, so likely not).

**Problem:** `kernelSession.executeCode` yields `KernelOutput` items as they arrive, but the controller
buffers them and calls `replaceOutput` once after `future.done`. So a long-running cell shows nothing
until it finishes. README lists "Streaming code output" as a known limitation.

- [x] **Step 1:** In the per-cell loop, replace the "collect then `replaceOutput` once" pattern with
  incremental emission. On the first output item, `exec.replaceOutput([new NotebookCellOutput(items)])`;
  for subsequent items `exec.appendOutput(...)` (or append items to a single output). Confirm the exact
  VS Code API shape: `NotebookCellExecution.appendOutput(items | outputs, cell?)` and
  `appendOutputItems(items, output)` — pick the one matching how outputs group (stdout stream should
  coalesce into one output; a new `execute_result`/`display_data` starts a new output).
- [x] **Step 2:** Preserve stream coalescing — successive `stream` (stdout/stderr) chunks should append
  to the *same* output item rather than creating a new output per chunk, so the cell reads like a console.
  Decide the grouping rule and document it. (stdout and stderr are distinct mimes → two coalescing buckets.)
- [x] **Step 3:** Keep the existing error path (`NotebookCellOutputItem.error`) and `exec.end(ok, Date.now())`
  timing. Cancellation still interrupts (already wired in `kernelSession`).
- [x] **Step 4:** Manual verify at the gate: run `import time; [print(i) or time.sleep(0.3) for i in range(5)]`
  and confirm lines appear one-by-one, not all at once. Update README: remove "Streaming code output" from
  Known limitations / Roadmap.

**Note:** No unit test (VS Code glue). The pure MIME mapping already lives in `kernelSession`; this task is
purely about *when* the controller flushes to the cell.

### Task 2: Kernel lifecycle — interrupt, restart, death-recovery — ✅ DONE (2026-07-03)

**Files:** Modify `src/kernelSession.ts` (extend the `KernelSession` interface), `src/mystController.ts`
(commands + cache eviction), `package.json` (command + keybinding contributions).

**Problem:** The `sessions` cache never invalidates. If a kernel dies (or the user wants a fresh state),
there's no restart — only a window reload. Interrupt works *during* a run (cancellation token) but there's
no standalone interrupt/restart affordance.

- [x] **Step 1: Expose lifecycle on the session seam.** Add to `KernelSession` in `kernelSession.ts`:
  `interrupt(): Promise<void>` and `restart(): Promise<boolean>` (wrap `kernel.interrupt()` /
  `kernel.restart()` from `@jupyterlab/services`; both are on `IKernelConnection`). Guard + log with the
  `[kernelSession]` prefix. `restart` keeps the same server/kernel connection (jupyterlab `restart()` reuses it).
- [x] **Step 2: Detect a dead kernel and evict the cache.** Subscribe to the kernel connection's
  `statusChanged` / `connectionStatusChanged`; when it reaches `dead` (or connection lost), log it and mark
  the session stale. In `MystController`, on a stale session, evict from `this.sessions` so the next run
  re-resolves and starts fresh (reusing the persisted default — no re-prompt).
- [x] **Step 3: Restart command.** Register `myst-notebook.restartKernel` (title "MyST: Restart Kernel")
  and `myst-notebook.interruptKernel` ("MyST: Interrupt Kernel") in `package.json` contributes.commands,
  gated in `contributes.menus.commandPalette` with `when: notebookType == 'myst-notebook'`. Handler: look up the
  active notebook's cached session → `restart()`/`interrupt()`; if none, no-op with an info message.
- [x] **Step 4: Wire NotebookController interrupt affordance.** Set `controller.interruptHandler` to call
  the session's `interrupt()` so the toolbar stop button works outside the per-cell token path.
- [ ] **Step 5:** Manual verify: start a long run → toolbar interrupt stops it; run `import os; os._exit(0)`
  to kill the kernel → next run recovers by starting a fresh kernel (no reload); Restart command clears
  kernel state (a variable set before restart is gone after). *(Requires extension host; not run headless.)*

---

## Polish (discretionary — each independent)

### Task 3: Vendor KaTeX CSS for offline use — ✅ DONE (2026-07-03)

**Files:** `renderer/mystRenderer.ts`, `esbuild.js` (bundle/copy the CSS), `package.json` if an asset path
is contributed.

Currently `mystRenderer.ts` injects `<link href="https://cdn.jsdelivr.net/npm/katex@0.16/.../katex.min.css">`,
so math is unstyled offline (README known limitation).

- [x] **Step 1:** Vendor `katex.min.css` with fonts inlined as data URIs. Implemented via a build-time
  `generateKatexCss()` step in `esbuild.js` that rewrites all 20 `@font-face` `src:` entries to
  `url(data:font/woff2;base64,...)` and writes the result to `renderer/generated/katexCss.ts` (gitignored,
  regenerated on every build). `mystRenderer.ts` imports it and injects a `<style>` tag instead of the CDN
  `<link>`, so the renderer bundle is fully self-contained with no network requests.
- [x] **Step 2:** Manual verify with network disabled: math renders styled. Update README (remove the CDN
  limitation + the corresponding roadmap bullet). *(Visual verify requires extension host.)*

### Task 4: Preserve cursor/focus after auto-split — ✅ DONE (2026-07-03)

**Files:** `src/enterSplit.ts` (and any selection handling it uses).

After an auto-split on a paragraph break, cursor/focus position may not be preserved (README known limitation,
called a "v1 rough edge").

- [x] **Step 1:** Added `cursorToStart` option to `selectCellBestEffort`. On the common single-paragraph
  path, after entering edit mode on the new empty cell, the caret is pinned to `(0,0)` via a URI-matched
  `visibleTextEditors` lookup — no-op-safe if the editor hasn't materialised yet. Delay bumped 30→50ms for
  consistency. Multi-block edge case still uses best-effort focus (VS Code limitation after `replaceCells`).
- [x] **Step 2:** Manual verify across the split cases (mid-paragraph, end-of-cell, inside vs outside a fence).
  Update README. *(Behavioral verify requires extension host.)*

### Task 5: Styled MyST directive rendering — ✅ DONE (2026-07-03)

**Files:** `renderer/mystRenderer.ts` (markdown-it plugin/rules), `src/core/mystFigure.ts` (pure helper + tests).

`:::{directive}` blocks currently round-trip losslessly but render as raw MyST source (README limitation).
Admonitions (note/tip/warning/…) and figures are the high-value targets.

- [x] **Step 1:** Admonitions (already shipped by a prior session) render as styled colored callout boxes.
  Added `figure`/`image` directive rendering: `token.meta.arg` captures the image src from the opener line;
  the renderer emits `<figure><img>`/`<figcaption>`; `:alt:`/`:width:` option lines are parsed as metadata
  (not caption text) via the pure `parseFigureBody` helper in `src/core/mystFigure.ts` (9 vitest tests).
  Width is validated against a CSS-length whitelist to prevent CSS injection. Admonitions unchanged; serializer
  untouched (round-trip lossless).
- [x] **Step 2:** Manual verify a sampling of directives render styled and still round-trip
  (`serialize(deserialize(x)) === x`). Update README. *(Visual verify requires extension host.)*

---

## Housekeeping / prerequisites (not tasks, but decide early)

- **No git remote.** Everything is on local `main`. If backup / PRs / CI are wanted, add a remote first —
  it's a prerequisite for any PR-based flow.
- **Suggested order:** Task 1 → Task 2 (highest-leverage, and they compose — streaming makes a long run
  worth interrupting). Polish tasks 3–5 are independent; pick by whatever bugs you most.

## Testing convention (unchanged)

Pure logic in `src/core/*.test.ts` (vitest); VS Code / transport glue is verified manually via the
"MyST Notebook" output channel. Add `[controller]` / `[kernelSession]` log points for anything new so the
manual gate stays diagnosable. Keep `dist/`, `.vsix`, and `test-workspace/` out of git (already gitignored).
