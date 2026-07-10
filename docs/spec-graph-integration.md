# Spec: Graph Features Integration (Foam subset)

**Date:** 2026-07-03  
**Status:** Approved

## Goal

Embed a focused subset of Foam's knowledge-graph stack directly into `myst-notebook` — no separate extension, no publisher friction. The writer sees the graph, backlinks, hover previews, and link completion without installing anything extra.

## Features included

| Feature | What it does |
|---------|-------------|
| Knowledge graph | Force-directed graph panel showing notes as nodes, `[name](link)` and `{cite}` as edges, dashed boundary around note nodes, citation nodes floating outside |
| Backlinks panel | Explorer sidebar panel listing all notes that link to the currently open file |
| Navigation provider | Ctrl+Click on `[name](link)` in a markup cell navigates to the target file |
| Hover provider | Hover over `[name](link)` shows first paragraph of the target note as a tooltip |
| Link completion | Typing `[` or `](` autocompletes with known `.md` file paths in the workspace |

## Features excluded

Everything else from Foam: wikilinks, daily notes, tags, smart folders, AI/embeddings, templates, lint, rename/refactor, link sync, preview rendering.

## Source layout

```
myst-notebook/
  src/
    graph/                         ← all new code lives here, isolated
      core/                        ← foam-core subset (copied, stripped, MIT-attributed)
        model/
          uri.ts
          range.ts
          position.ts
          location.ts
          note.ts
          workspace.ts
          graph.ts
          tags.ts
          foam.ts
          provider.ts
        services/
          datastore.ts
          markdown-parser.ts
          markdown-provider.ts
          markdown-link.ts
          graph-data-builder.ts
        common/
          event.ts
          lifecycle.ts
          platform.ts
          cancellation.ts
          errors.ts
        utils/
          (minimal subset: log, cache, core, hashtags, path, slug, string)
      features/
        graph-webview/             ← graph panel (adapted from foam-vscode)
          index.ts
        backlinks/                 ← backlinks sidebar panel
          index.ts
        navigation/                ← hover + go-to-definition + completion
          hover-provider.ts
          navigation-provider.ts
          link-completion.ts
      myst-citation-parser.ts      ← copied from foam fork
      index.ts                     ← registerGraphFeatures(context, workspaceRoot)
  renderer/                        ← existing, untouched
  src/core/                        ← existing, untouched
  src/extension.ts                 ← +1 line: registerGraphFeatures(context, workspaceRoot)
```

The graph webview bundle (`foam-graph`) is copied as source into `src/graph/webview-src/` and compiled by esbuild into `dist/graph/`.

## Build changes

`esbuild.js` gains a third entry point:

```js
// Graph webview bundle (browser context, no Node/vscode externals)
{
  entryPoints: ['src/graph/webview-src/main.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  outfile: 'dist/graph/webview.js',
  sourcemap: !production,
  minify: production,
}
```

The existing two entry points (extension host + renderer) are untouched.

## New dependencies (package.json)

```json
"remark-parse": "^8.0.2",
"remark-frontmatter": "^2.0.0",
"remark-wiki-link": "^0.0.4",
"unified": "^9.0.0",
"unist-util-visit": "^2.0.2",
"lru-cache": "^11.0.0",
"gray-matter": "^4.0.2",
"github-slugger": "^1.4.0",
"mnemonist": "^0.39.8"
```

No conflict with existing deps (`markdown-it`, `@jupyterlab/services`, `katex` — different pipelines).

## package.json contributions

All new settings and commands use the `myst-notebook.graph.*` namespace. No `foam.*` strings visible to users. New contributions:

- `myst-notebook.graph.show` command (Command Palette + keybinding `Ctrl+Shift+G`)
- `myst-notebook.graph.titleMaxLength` setting (default 24)
- `myst-notebook.graph` view container (Explorer sidebar panel for backlinks)
- `myst-notebook.backlinks` view (inside the graph container)

## VS Code engine floor

Stays at `^1.85.0`. The 1.110 requirement in the Foam fork was for Smart Folders and AI embeddings, both dropped.

## Activation

Graph features activate lazily on `myst-notebook.graph.show` command or when a `.md` file is opened in a `myst.yml` workspace. No change to the existing `workspaceContains:**/myst.yml` activation event.

## Attribution

A `NOTICE` file at the repo root records the MIT copyright:

```
Portions of this software (src/graph/) are adapted from Foam
(https://github.com/foambubble/foam), Copyright 2020-present Jani Eväkallio,
licensed under the MIT License.
```

## Conflicts / risks

| Area | Status |
|------|--------|
| `engines.vscode` | No change — stays `^1.85.0` |
| `markdown-it` vs `remark` | No conflict — separate bundles |
| `[[wikilinks]]` in remark pipeline | Parsed silently, never shown in UI |
| Activation breadth | Graph activates lazily, no change to main activation |
| Bundle size | foam-graph webview adds ~200–300 KB compressed |
