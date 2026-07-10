# Implementation Plan: writer-first code cells + chrome cleanup

Design: `docs/design-code-cell-ergonomics.md`. Read it first.

Three independent-ish workstreams. Order: **1 (model) → 2 (ergonomics) → 3 (chrome)**.
Workstream 1 is the foundation the others build on. Each phase ends green (`npm test`).

TDD throughout: write the failing test named in each step, then the code.

---

## Workstream 1 — Directive options → metadata (foundation)

Goal: peel `:key: value` option lines out of the editable code body into
`metadata.myst.options`; re-emit verbatim on save; derive collapse from
`hide-input`/`hide-cell` tags. Kernel receives pure code.

### 1.1 Core parse: lift option lines — `src/core/serializer.ts`
- Extend `parseCodeCell` to return `{ value, openFence, closeFence, optionLines }`.
  After the opening fence, consume consecutive leading lines matching
  `/^:[\w-]+:.*$/` into `optionLines` (verbatim strings, in order). Remaining lines
  are the pure code `value`.
- `RawCell.metadata.myst` gains `options?: string[]` (the raw option lines, order-
  preserving — do NOT parse into a map; verbatim strings guarantee round-trip).
- `textToCells`: store `optionLines` at `metadata.myst.options`.
- `cellsToText`: emit `openFence`, then each `options` line, then `value` (if non-
  empty), then `closeFence`.
- **Tests** (serializer.test.ts):
  - `:tags: [hide-input]` line ends up in `metadata.myst.options`, NOT in `value`
    (update the existing line-86 test: `value` is now `'x = 1'`, options is
    `['​:tags: [hide-input]']`).
  - Round-trip byte-for-byte with options (extend line-86 test's round-trip half).
  - Multiple option lines (`:tags:` + `:name:`) preserved in order.
  - Code cell with NO options: `options` absent/empty, unchanged round-trip.
  - Option-like line NOT at the top of the body (after real code) stays in `value`
    (only *leading* option lines are lifted).

### 1.2 Collapse derives from tags — `src/cellFactory.ts`
- Add `hasHideInputTag(options: string[] | undefined): boolean` — true if any
  option line is `:tags:` and its `[...]` list contains `hide-input` or `hide-cell`.
  Keep it a pure helper (export for unit test).
- Replace hard-coded `metadata.inputCollapsed = true` with
  `metadata.inputCollapsed = hasHideInputTag(myst.options)`.
- **Tests** (new `cellFactory.test.ts`):
  - `hide-input` tag → `inputCollapsed === true`.
  - no tag → `inputCollapsed === false`.
  - `hide-cell` tag → true; unrelated tag (`raises-exception`) → false.

### 1.3 inputCollapse fallback respects tags — `src/inputCollapse.ts`
- Currently force-collapses every code cell on open. Change: only collapse cells
  whose metadata already says `inputCollapsed === true` is *intended* — i.e. drive
  off the same derived flag. Since `cellFactory` now sets the correct flag at load,
  the safest change is: **collapse a cell only if `metadata.inputCollapsed === true`**
  (the value cellFactory computed), and expand (set false) if the tag is absent.
  Net: the module now enforces "match the tag", not "always collapse".
- Guard the no-op skip so it doesn't dirty a notebook already in the correct state.
- This module touches live VS Code API (no unit test); verify in the F5 checklist.

### 1.4 Kernel gets clean code — `src/mystController.ts`
- No code change expected (it already sends `cell.document.getText()`, which is now
  pure code). Add a guard-rail: assert-style comment + a core-level test that a
  round-tripped hide-input cell's `value` contains no `:tags:` line.
- **Test**: in serializer.test.ts, a `{code-cell}` with `:tags:` → `code.value`
  has no line starting with `:`.

**Checkpoint:** `npm test` green. Manually F5: open `test-fixtures/sample-chapter.md`,
confirm tagged cells collapse, untagged cells expand, saving preserves `:tags:`.

---

## Workstream 2 — Writer ergonomics (hotkeys + shorthand)

Depends on WS1 (both paths construct cells via the same metadata shape).

Add a single factory the two paths share, mirroring `rawCellToData` philosophy
(one place builds each cell kind).

### 2.1 Cell-template factory — `src/cellTemplates.ts` (new)
- `makeExecutableCell(): RawCell` — `{code-cell} python` fence, `options:
  [':tags: [hide-input]']`, empty value. (Collapsed via WS1 derivation.)
- `makeDisplayCodeCell(): RawCell` — markup cell whose `value` is a plain
  ` ```python\n\n``` ` fence.
- **Tests** (`cellTemplates.test.ts`): each template round-trips through
  `cellsToText([...])` to the expected MyST source; executable template's derived
  `inputCollapsed` is true; display template is `kind: 'markup'`.

### 2.2 Insert commands + keybindings — `src/insertCells.ts` (new) + `package.json`
- `registerInsertCells(context)`: two commands
  - `myst-notebook.insertExecutableCell`
  - `myst-notebook.insertDisplayCode`
  Each: find active notebook editor, build cell via 2.1 → `rawCellToData`, insert
  below the current cell with `NotebookEdit.insertCells` (additive — reuse the
  focus-preserving pattern from `enterSplit.ts:62-81`), then place the cursor in
  the new cell's body.
- `package.json` `contributes.commands`: add both with titles
  `MyST: Insert Executable Cell (collapsed)` / `MyST: Insert Display Code Block`.
- `package.json` `contributes.keybindings`: bind under
  `when: notebookType == 'myst-notebook' && notebookEditorFocused`. Proposed:
  `ctrl+shift+e` (executable), `ctrl+shift+d` (display). Verify no MyST-context
  collision with existing `ctrl+1..9` math slots (different keys — OK).
- Register in `extension.ts` (`registerInsertCells(context)`).
- Command bodies use live VS Code API → covered by F5 checklist, not unit tests.
  The *cell shape* they produce is unit-tested via 2.1.

### 2.3 Shorthand fences ` ```run ` / ` ```show ` — `src/enterSplit.ts`
- Before the empty/open-construct guard (`enterSplit.ts:44-47`), add a shorthand
  check: if the current cell's full text (trimmed) is exactly ` ```run ` or
  ` ```show `, consume it — replace the current markup cell with the corresponding
  template cell (WS 2.1) + a trailing empty markup cell, focus appropriately.
  - ` ```run ` → executable collapsed code cell.
  - ` ```show ` → display code markup cell (cursor lands inside the fence).
- Extract the trigger test into a pure helper in `core/` for unit testing:
  `matchShorthand(cellText: string): 'run' | 'show' | null` in
  `src/core/blockSplitter.ts` (or a new `core/shorthand.ts`).
- **Tests** (`core/shorthand.test.ts`): ` ```run `→'run', ` ```show `→'show',
  leading/trailing whitespace tolerated, ` ```python `→null, ` ```runner `→null,
  empty→null.
- The VS Code wiring in enterSplit → F5 checklist.

**Checkpoint:** `npm test` green. F5: type ` ```run `+Enter → collapsed exec cell;
` ```show `+Enter → display block; `Ctrl+Shift+E`/`Ctrl+Shift+D` insert the right
cells; existing Enter-split behavior for prose unchanged.

---

## Workstream 3 — Chrome cleanup (workspace settings)

### 3.1 Remove the ineffective iframe CSS — `renderer/mystRenderer.ts`
- Delete `ensureInsertToolbarHidden()` and its call (`:12-13`, `:190-198`). The
  `.cell-insertion-toolbar` lives in the notebook parent DOM, unreachable from the
  renderer iframe — it never worked. Leave `ensureKatexCss` untouched.

### 3.2 Write workspace settings on activation — `src/workspaceChrome.ts` (new)
- `applyFocusedNotebookSettings()`: on activation, if a workspace is open, read
  `.vscode/settings.json` (via `vscode.workspace.getConfiguration` scoped to the
  Workspace target), and set — only if not already set to the desired value —
  - `notebook.globalToolbar` → `false`
  - `notebook.insertToolbarLocation` → `"hidden"`
  Use `config.update(key, value, ConfigurationTarget.Workspace)`. Merge semantics
  are handled by the settings API (it won't clobber unrelated keys).
- Guard: only when at least one `myst.yml` workspace / a MyST notebook is present,
  to avoid touching unrelated projects. (Activation is already gated on
  `workspaceContains:**/myst.yml`, so plain activation implies MyST context — safe.)
- Register in `extension.ts`.
- **Tests**: logic is thin VS Code-API glue; assert via a small pure helper
  `desiredChromeSettings()` returning the key/value map, unit-tested. Live update
  behavior → F5 checklist.

**Checkpoint:** F5 in a MyST workspace → `.vscode/settings.json` gains the two
keys; the global toolbar (Generate/+Code/+Markdown/Run All/Clear) and the between-
cell insert toolbar are gone. Reopening the notebook stays clean.

---

## Final verification

- `npm test` green (unit: serializer options round-trip, tag→collapse derivation,
  templates, shorthand matcher, chrome settings map).
- F5 manual checklist (append to `ManualSteps.md`):
  1. Tagged `{code-cell}` opens collapsed; untagged opens expanded.
  2. Saving preserves `:tags:` verbatim; code body has no `:tags:` line.
  3. Running a hide-input cell sends clean code (no `:tags:` error from Python).
  4. ` ```run `/` ```show ` + Enter expand correctly; `Ctrl+Shift+E/D` insert.
  5. Global + insert toolbars gone; `.vscode/settings.json` written.
- Update `README.md` / `ROADMAP.md` with the two authoring shortcuts and the
  display-vs-executable distinction.

## Risks / notes
- Existing serializer test at line 86 changes meaning (options now leave the body).
  This is intended — update it, don't preserve old behavior.
- Keybinding `ctrl+shift+d` may collide with a global VS Code default; verify in F5
  and fall back to another chord if so (note in ManualSteps).
- `inputCollapse.ts` now expands untagged cells — confirm it doesn't fight a user
  who manually collapses an untagged cell mid-session (skip-if-already-matching
  guard should prevent re-expansion loops; verify).
