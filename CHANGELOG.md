# Changelog

## [0.1.4] - 2026-07-21

### Added
- **▶ Run button on code cells** — every code cell now shows a `▶ Run` button in the cell toolbar. Click to execute that cell; the button shows `⏳ Running...` while the cell is in flight and disables itself to prevent duplicate runs.
- **Single-click cell edit** — switching to a different markup cell auto-enters edit mode (no double-click needed). For re-clicking the same cell, use the built-in cell toolbar's Edit action.

### Known limitations
- **Clicking an already-selected markup cell** does not enter edit mode. VS Code's `onDidChangeNotebookEditorSelection` event only fires on selection CHANGE, and VS Code has no public API to detect clicks on rendered markup webview content (microsoft/vscode-discussions#1839). Use the cell toolbar Edit button or press Enter.

### Fixed
- **LaTeX backslash duplication in math autocomplete** — typing `\` inside `$...$` and selecting a symbol (e.g. `\alpha`) from the completion list no longer produces `\\alpha`. The completion provider now sets an explicit replace-range that includes the trigger backslash.

## [0.1.3] - 2026-07-15

### Fixed
- **Empty file opens with zero cells** — brand-new `.md` files now auto-inject a starter markup cell so the user has somewhere to type. Previously `textToCells('')` returned an empty array, producing a notebook with no editable surface.
- **Overly aggressive `uv` heuristic removed** — `~/.local/bin/` and `.venv/bin/` Pythons were falsely assumed to be uv-managed, causing `uv pip install` to fail for pyenv, standard-library venv, and other non-uv environments. These now default to the correct `<interpreter> -m pip install`.
- **Math picker stores linted symbols**: `\mathbf R` is now corrected to `\mathbf{R}` before storage via a dedicated `collectMathPaletteItems` pipeline (extract → lint → tokenize).

### Changed
- **Kernel install fallback chain: conda → pip → uv**. The extension now tries each approach in order — conda first (for conda env paths), then `<interpreter> -m pip install`, then `uv pip install` as last resort. Each step falls through to the next on failure.
- **Cross-platform conda env detection** — Windows conda paths (`\envs\<name>\`) are now recognized alongside Unix paths (`/envs/<name>/`).
- **uv auto-bootstrapped** — when pip fails and `uv` is not on PATH, the extension silently installs uv via the official install script and retries with it.
- **Removed `--break-system-packages` special case** — Homebrew Python now follows the standard chain (pip → uv fallback) instead of a hardcoded flag.
- **Ctrl+Shift+E** now toggles the current cell to a Code cell (instead of inserting a new cell). Consistent with **Ctrl+Shift+R** which toggles to Markdown.
- **Math Palette** panel is now always visible (removed the overly strict `when: "notebookType"` clause).

### Added
- **MyST: Reinstall Runtime** command — clears the saved default kernel so the Python environment picker re-appears on next code execution.
- **MyST: Convert Cell to Markdown** (`Ctrl+Shift+R`) — toggle a code cell back to Markdown.
- **MyST: Convert Cell to Code** (`Ctrl+Shift+E`) — toggle a Markdown cell to an executable Code cell.
- **Progress notification** during `ipykernel`/`jupyter-server` install — a VS Code progress bar now shows while packages are downloading.

### Known limitations (documented, not fixed)
- **MyST colon-fence directives** (`:::{note}`, `:::{warning}`, etc.) are NOT rendered inline. VS Code's notebook renderer uses `md.renderInline()` which fundamentally cannot process block-level or core-level markdown-it rules. The directives remain as plain source text — `jupyter-book build` handles final rendering. Documented in README § Limitations.

## [0.1.2] - 2026-07-15

### Fixed
- **Marketplace README links**: all relative paths (images, cross-references, language switcher) changed to absolute GitHub URLs so they resolve on the VS Code Marketplace.
- **Absolute URLs use correct branch name** — changed `main` → `Master` in all `github.com` and `raw.githubusercontent.com` URLs to match the repo's actual default branch.
- **Demo GIFs committed to repo** — `demo.gif`, `demo-run.gif`, `demo-graph.gif`, `demo-render.gif`, `demo-math.gif` are now tracked so Marketplace can display them.

## [0.1.1] - 2026-07-12

### Changed
- **Notebook priority changed from `option` to `default`** — `.md` files now automatically open as MyST Notebook without needing "Reopen With" each time.
- **Publisher ID** updated to match Marketplace publisher.
- **Icon** updated to RequieMa logomark (dark).

## [0.1.0] - 2026-07-06

### Added

- Code cell execution against a self-owned Jupyter server (no Jupyter extension required). MyST discovers Python environments via the Python extension, launches a `jupyter-server` in the chosen environment, and communicates over the Jupyter protocol via `@jupyterlab/services`.
- Kernel lifecycle commands: **MyST: Restart Kernel** and **MyST: Interrupt Kernel** (Command Palette + toolbar stop button).
- Automatic recovery when a kernel dies — next cell run starts a fresh kernel without a window reload.
- Incremental (streaming) cell output — output lines appear as they are produced, not all at once on completion.
- Vendored KaTeX CSS with fonts inlined as data URIs — math renders correctly with no network connection.
- `figure` and `image` directive rendering — `:::{figure}` and `:::{image}` blocks render as `<figure>/<img>` with caption support.
- Deterministic cursor landing at offset 0 after the common single-paragraph auto-split.
- **Alt+Enter** — insert a literal newline inside a markup cell without splitting it.
- **Ctrl+D** — delete the selected cell when not in edit mode.
- Shorthand fences: type ` ```run ` or ` ```show ` in a prose cell and press Enter to auto-expand into an executable or display-only code cell.
- Auto-install of `ipykernel` and `jupyter-server` into the chosen environment when they are missing.
- Getting-started walkthrough shown on install.
- One-click **Open as MyST Notebook** editor toolbar button and command.
- One-time first-open prompt offering to open a `.md` in a MyST workspace as a MyST Notebook (dismissible with "Don't ask again").
- Continuous integration: typecheck, unit tests, headless integration smoke test, and `.vsix` packaging run on every push/PR; tagged `v*` releases publish to the Marketplace automatically.

### Changed

- Removed `ms-toolsai.jupyter` extension dependency — MyST manages its own kernel and no longer uses the Jupyter extension API.
