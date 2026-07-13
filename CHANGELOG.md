# Changelog

## [0.1.1] - 2026-07-12

### Changed
- **Notebook priority changed from `option` to `default`** — `.md` files now automatically open as MyST Notebook without needing "Reopen With" each time.
- **Publisher ID** updated to match Marketplace publisher.
- **Icon** updated to RequieMa logomark (dark).

## [Unreleased] — smoke-test polish

### Known limitations (documented, not fixed)
- **MyST colon-fence directives** (`:::{note}`, `:::{warning}`, etc.) are NOT rendered inline. VS Code's notebook renderer uses `md.renderInline()` which fundamentally cannot process block-level or core-level markdown-it rules. The directives remain as plain source text — `jupyter-book build` handles final rendering. Documented in README § Limitations.

### Fixed
- **Math picker stores linted symbols**: `\mathbf R` is now corrected to `\mathbf{R}` before storage via a dedicated `collectMathPaletteItems` pipeline (extract → lint → tokenize).
- **Homebrew Python detection**: externally-managed Homebrew Python now uses `pip install --break-system-packages` instead of failing.
- **uv-managed Python detection**: `~/.local/bin/` and `.venv/bin/` Pythons now use `uv pip install` instead of `pip install`.

### Changed
- **Ctrl+Shift+E** now toggles the current cell to a Code cell (instead of inserting a new cell). Consistent with **Ctrl+Shift+R** which toggles to Markdown.
- **Math Palette** panel is now always visible (removed the overly strict `when: "notebookType"` clause).

### Added
- **MyST: Reinstall Runtime** command — clears the saved default kernel so the Python environment picker re-appears on next code execution.
- **MyST: Convert Cell to Markdown** (`Ctrl+Shift+R`) — toggle a code cell back to Markdown.
- **MyST: Convert Cell to Code** (`Ctrl+Shift+E`) — toggle a Markdown cell to an executable Code cell.
- **Progress notification** during `ipykernel`/`jupyter-server` install — a VS Code progress bar now shows while packages are downloading.

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
