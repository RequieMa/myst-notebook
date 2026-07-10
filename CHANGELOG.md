# Changelog

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
