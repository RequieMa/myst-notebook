# Design: writer-first code cells + chrome cleanup

## Problem

Two issues, from user screenshots:

1. **Stray notebook chrome.** The `Generate` (Copilot), `+ Code`, `+ Markdown`,
   `Run All`, `Clear All Outputs` global-toolbar buttons and the floating
   between-cell `Generate / +Code / +Markdown` toolbar still appear, cluttering
   what should feel like a focused writing document.
2. **Muddy code-block semantics.** A display-only ` ```python ` fence sits inside
   a markup cell showing raw backticks + confusing hover chrome, while every
   executable ` ```{code-cell} ` is force-collapsed regardless of its MyST tags.
   The editor's state does not reflect what MyST actually builds.

## Guiding principle

**The editor should mirror MyST's build-time semantics, and the writer should
never hand-type fence syntax.** MyST already defines the two behaviors we want —
we surface them, we don't invent a convention.

| Intent | MyST source | Build behavior | Editor cell |
|---|---|---|---|
| **Display only** (show, don't run) | ` ```python ` plain fence | ignored — highlighted, never executed | markup cell, rendered code block |
| **Executable, collapsed-but-expandable** | ` ```{code-cell} python ` + `:tags: [hide-input]` | executed; input hidden, click-to-expand | code cell, input collapsed |
| **Executable, shown** | ` ```{code-cell} python ` (no tag) | executed; input shown | code cell, input expanded |

## Decisions (confirmed with user)

- **Buttons:** hide as much chrome as possible.
- **Executable default:** collapsed input (click to expand) — but driven by the
  tag, not forced.
- **Collapse driver:** `:tags: [hide-input]` (and `hide-cell`) drives collapse
  state. Untagged code cells open **expanded**, because MyST would show them.
  This replaces the current force-collapse-all in `cellFactory.ts` / `inputCollapse.ts`.
- **Writer ergonomics:** author must NOT type `{code-cell} python`, `python`, or
  `:tags: [hide-input]`. Provide **both** a hotkey path and a shorthand-fence path.
- **Tag storage:** lift directive option lines (`:tags: [...]`, other `:key: val`)
  OUT of the editable cell body into cell metadata on load; re-emit on save. The
  writer's code is pure code; the kernel receives clean code (fixes the current
  bug where `:tags:` is sent to Python via `mystController.ts:62`).

## Design

### A. Cell model: option lines → metadata

`parseCodeCell` (core/serializer.ts) gains a step: after the opening fence, peel
leading `:key: value` option lines into a structured `options` map stored in
`metadata.myst.options`; the remaining lines are the pure code `value`.
`cellsToText` re-emits `openFence`, then each option line, then the code, then the
close fence — byte-for-byte round-trip preserved. `hide-input`/`hide-cell` in the
`tags` option determines the collapse flag.

Consequences:
- `cellFactory.ts`: `inputCollapsed` = derived from tags, not hard-coded `true`.
- `inputCollapse.ts`: apply collapse only to cells whose tags request it (or drop
  the module if metadata-on-load proves sufficient).
- `mystController.ts`: already sends `cell.document.getText()`, which is now clean
  code — no change needed, but add a test asserting no `:tags:` reaches the kernel.

### B. Writer ergonomics — both paths

**Hotkeys** (mouse-free insertion; also in Command Palette):
- `MyST: Insert Executable Cell (collapsed)` → new `{code-cell}` cell w/ `hide-input`
  tag in metadata, cursor in body.
- `MyST: Insert Display Code Block` → new markup cell pre-seeded with a plain
  ` ```python ``` ` fence, cursor inside.

**Shorthand fences** (type-time, reuses `enterSplit.ts` infra):
- Typing ` ```run ` on its own line auto-expands to an executable collapsed
  code cell (`{code-cell} python` + `hide-input` tag).
- Typing ` ```show ` auto-expands to a display-only markdown code block
  (plain ` ```python `).
- `run`/`show` chosen over terse `x`/`d` for explicitness and zero collision
  risk with real language identifiers.

### C. Chrome cleanup — honest constraints

The existing `ensureInsertToolbarHidden()` CSS is injected into the **markup
renderer iframe** and cannot reach the notebook editor's parent-DOM toolbars —
this is why the buttons persist. Real levers:

- `notebook.globalToolbar: false` — hides Generate/+Code/+Markdown/Run All/Clear.
- `notebook.insertToolbarLocation: "hidden"` — hides between-cell + toolbar inserts.
- `notebook.cellToolbarLocation` — per-cell toolbar tuning.

An extension cannot silently force user settings. **Decision: write workspace
`.vscode/settings.json` automatically on first activation** — scoped to the
workspace, reversible, and it does not touch the user's global settings. Keys:
`notebook.globalToolbar: false`, `notebook.insertToolbarLocation: "hidden"`.
Merge (don't clobber) any existing workspace settings.

Remove the ineffective iframe CSS hack (or keep only the parts that genuinely
target renderer-owned DOM).

## Out of scope (v1)

- Two-way UI toggle that writes `hide-input` back from a collapse gesture.
- CRLF handling, multi-blank-line preservation (already documented v1 limits).
