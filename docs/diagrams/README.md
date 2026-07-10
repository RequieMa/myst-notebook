# Architecture diagrams (C4)

[C4-model](https://c4model.com/) views of the **MyST Notebook** extension, at three
zoom levels. Open the SVGs directly, or load the `.dsl` in
[Structurizr Lite](https://structurizr.com/help/lite) for an interactive, all-views
workspace.

| File | Level | Shows |
| --- | --- | --- |
| `c4-1-context.svg` | System context | The author, MyST Notebook, and the external systems it talks to (VS Code, ms-python, the Python env / Jupyter server, Zotero). KaTeX is now vendored offline (no CDN dependency). |
| `c4-2-container.svg` | Container | The two shipped bundles (`dist/extension.js`, `dist/renderer/mystRenderer.js`) plus the pure `src/core` library, and how they wire to the externals. |
| `c4-3-components.svg` | Component | Inside the extension-host bundle: activation, serializer, and the `discover → rank → pick → ensure-deps → start` kernel stack (`pythonEnvService`, `kernelPicker`, `envSetup`, `kernelSession`, `MystController`). |
| `myst-notebook-c4.dsl` | — | Structurizr DSL source containing **all** views (the SVGs are single-view renders of it). |

## How execution works (component view, in one line)

`MystController` lists environments via `pythonEnvService` (ms-python), applies the pure
`kernelResolution` decision, prompts through `kernelPicker` when needed, has `envSetup`
ensure `ipykernel` + `jupyter-server`, then `kernelSession` launches a Jupyter server in
that environment and streams the kernel's output over WebSocket (`@jupyterlab/services`).
No dependency on the Jupyter extension's kernel API. See `docs/RESEARCH.md` for why.

## Regenerating

These were produced with the `pystructurizr` MCP server. To refresh after an
architecture change: update the model, then re-render each view to its SVG (and the
DSL master). The `.dsl` file is the source of truth — keep it in sync with the code.
