# Graph Features Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Embed Foam's graph, backlinks, hover, navigation, and link-completion features into `myst-notebook` as an isolated `src/graph/` subtree.

**Architecture:** Copy foam-core subset + foam-vscode feature code into `src/graph/`. Build the graph webview as a third esbuild entry point. Wire into `extension.ts` via a single `registerGraphFeatures()` call.

**Tech Stack:** TypeScript, VS Code API, remark pipeline (foam-core), Lit + force-graph (foam-graph webview), esbuild.

**Source references:**
- Foam fork: `/home/zengma/vs_extensions/foam/packages/foam-vscode/`
- Foam core: `/home/zengma/vs_extensions/foam/packages/foam-core/`
- Foam graph webview: `/home/zengma/vs_extensions/foam/packages/foam-graph/`
- Target extension: `/home/zengma/vs_extensions/myst-notebook/`

---

### Task 1: Add dependencies and build scaffolding

**Files:**
- Modify: `package.json`
- Modify: `esbuild.js`
- Modify: `tsconfig.json`

- [x] **Step 1:** Add new runtime deps to `package.json` `dependencies`:

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

- [x] **Step 2:** Add the graph webview entry point to `esbuild.js`, inside the `build()` function after the existing renderer context:

```js
// Graph webview bundle (browser context — Lit + force-graph)
const graphWebview = await esbuild.context({
  entryPoints: ['src/graph/webview-src/main.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  outfile: 'dist/graph/webview.js',
  sourcemap: !production,
  minify: production,
});
```

Add `graphWebview` to the watch/dispose logic alongside the existing `ext` and `renderer` contexts.

- [x] **Step 3:** Add path alias to `tsconfig.json` so `@foam/core` imports inside `src/graph/` resolve to `src/graph/core`:

```json
"paths": {
  "@foam/core": ["./src/graph/core/index.ts"],
  "@foam/core/*": ["./src/graph/core/*"]
}
```

- [x] **Step 4:** Run `npm install` to install new deps.

- [x] **Step 5:** Run `npx tsc --noEmit` — expect no new errors (graph source doesn't exist yet, so no imports to fail).

- [x] **Step 6:** Commit.

```bash
git add package.json package-lock.json esbuild.js tsconfig.json
git commit -m "chore(myst-notebook): add graph integration deps and build scaffolding"
```

---

### Task 2: Copy and adapt foam-core subset

**Files:**
- Create: `src/graph/core/` (full subtree — ~25 files)

Copy the following files verbatim from `/home/zengma/vs_extensions/foam/packages/foam-core/src/` to `src/graph/core/`, preserving sub-paths. Then make the two adaptations described below.

Files to copy:
```
model/uri.ts
model/range.ts
model/position.ts
model/location.ts
model/note.ts
model/workspace.ts
model/graph.ts
model/tags.ts
model/foam.ts
model/provider.ts
services/datastore.ts
services/markdown-parser.ts
services/markdown-provider.ts
services/markdown-link.ts
services/graph-data-builder.ts
services/progress.ts
common/event.ts
common/lifecycle.ts
common/platform.ts
common/cancellation.ts
common/errors.ts
utils/log.ts
utils/cache.ts
utils/core.ts
utils/hashtags.ts
utils/path.ts
utils/slug.ts
utils/string.ts
utils/index.ts
utils/task-deduplicator.ts
```

- [x] **Step 1:** Copy all files above, replacing `@foam/core` self-imports with relative paths where they occur (they occur in `model/foam.ts` and `services/markdown-provider.ts` — change to `../model/...` etc.).

- [x] **Step 2:** Create `src/graph/core/index.ts` re-exporting everything needed by the features (copy the relevant export lines from `/home/zengma/vs_extensions/foam/packages/foam-core/src/index.ts`, keeping only: `URI`, `Range`, `Position`, `Location`, `Resource`, `ResourceLink`, `NoteLinkDefinition`, `FoamWorkspace`, `FoamGraph`, `Connection`, `FoamTags`, `ResourceProvider`, `Foam`, `Services`, `bootstrap`, `IDataStore`, `IWatcher`, `IMatcher`, `createMarkdownParser`, `ParserPlugin`, `MarkdownResourceProvider`, `buildGraphData`, `GraphDataOptions`, `MarkdownLink`, `Logger`, `IDisposable`, `Emitter`, `Event`).

- [x] **Step 3:** Run `npx tsc --noEmit` from `myst-notebook/`. Expect errors only about missing `src/graph/features/` (not yet created). Fix any import path errors in the core files.

- [x] **Step 4:** Commit.

```bash
git add src/graph/core/
git commit -m "feat(myst-notebook): copy foam-core subset into src/graph/core"
```

---

### Task 3: Copy myst-citation-parser and graph webview source

**Files:**
- Create: `src/graph/myst-citation-parser.ts`
- Create: `src/graph/webview-src/` (foam-graph subset)

- [x] **Step 1:** Copy `/home/zengma/vs_extensions/foam/packages/foam-vscode/src/vscode/features/notes/myst-citation-parser.ts` to `src/graph/myst-citation-parser.ts`. Update its import `from '@foam/core'` to `from './core'`.

- [x] **Step 2:** Copy the foam-graph webview source. Source: `/home/zengma/vs_extensions/foam/packages/foam-graph/src/`. Destination: `src/graph/webview-src/`. Copy these files:

```
main.ts
protocol.ts
foam-graph.ts
foam-graph.test.ts  (skip — tests not needed in bundle)
components/graph-canvas.ts
components/autocomplete-input.ts
components/control-panel.ts
components/color-legend.ts  (if exists)
lib/colors.ts
lib/defaults.ts
lib/graph-utils.ts
lib/graph-view-model.ts
lib/groups.ts
lib/painter.ts
lib/style.ts
lib/types.ts
main.css
```

- [x] **Step 3:** In `src/graph/webview-src/`, update any `@foam/graph-view/protocol` imports to `./protocol` (relative). Add `force-graph`, `d3-force`, `d3-scale`, `d3-color`, `lit` to `package.json` devDependencies (these are needed at bundle time only).

- [x] **Step 4:** Run `npm install`.

- [x] **Step 5:** Build just the webview entry: `node esbuild.js` (expect it to fail on missing `src/graph/features/` imports from extension host — that's fine; check only that the webview bundle path is reached without import errors from `src/graph/webview-src/`).

- [x] **Step 6:** Commit.

```bash
git add src/graph/
git commit -m "feat(myst-notebook): add myst-citation-parser and graph webview source"
```

---

### Task 4: Copy and adapt graph-webview feature (extension host side)

**Files:**
- Create: `src/graph/features/graph-webview/index.ts`

- [x] **Step 1:** Copy `/home/zengma/vs_extensions/foam/packages/foam-vscode/src/vscode/features/graph-webview/index.ts` to `src/graph/features/graph-webview/index.ts`.

- [x] **Step 2:** Adapt imports:
  - `from '@foam/core'` → `from '../../core'`
  - `from '@foam/graph-view/protocol'` → `from '../../webview-src/protocol'`
  - Remove any imports of dropped Foam features (telemetry, settings helpers not in our core).

- [x] **Step 3:** Update the webview HTML template inside the file: change the script `src` to point at `dist/graph/webview.js` (the esbuild output path). The existing Foam code uses `webview.asWebviewUri(...)` with a path to `static/dataviz/` — replace that path with `vscode.Uri.joinPath(context.extensionUri, 'dist', 'graph', 'webview.js')`.

- [x] **Step 4:** Rename the command from `foam-vscode.showGraph` to `myst-notebook.graph.show` throughout the file.

- [x] **Step 5:** Register the `mystCitationPlugin` from `../../myst-citation-parser` in the `createMarkdownParser` call (add it to the `extraPlugins` array).

- [x] **Step 6:** Run `npx tsc --noEmit`. Fix any type errors in this file.

- [x] **Step 7:** Commit.

```bash
git add src/graph/features/graph-webview/
git commit -m "feat(myst-notebook): graph-webview feature (adapted from foam-vscode)"
```

---

### Task 5: Copy and adapt backlinks, navigation, and completion features

**Files:**
- Create: `src/graph/features/backlinks/index.ts`
- Create: `src/graph/features/navigation/hover-provider.ts`
- Create: `src/graph/features/navigation/navigation-provider.ts`
- Create: `src/graph/features/navigation/link-completion.ts`

- [x] **Step 1:** Copy backlinks: source is `/home/zengma/vs_extensions/foam/packages/foam-vscode/src/vscode/features/notes/connections.ts` → `src/graph/features/backlinks/index.ts`. Update imports (`@foam/core` → `../../core`). Remove any dependency on Foam's VS Code services (editor.ts, etc.) — inline the small bits needed or stub them.

- [x] **Step 2:** Copy hover provider: `/home/zengma/vs_extensions/foam/packages/foam-vscode/src/vscode/features/navigation/hover-provider.ts` → `src/graph/features/navigation/hover-provider.ts`. Update `@foam/core` → `../../core`.

- [x] **Step 3:** Copy navigation provider: `navigation-provider.ts` → `src/graph/features/navigation/navigation-provider.ts`. Update `@foam/core` → `../../core`.

- [x] **Step 4:** Copy link completion: `link-completion.ts` → `src/graph/features/navigation/link-completion.ts`. Update `@foam/core` → `../../core`. Keep only `[name](link)` completion (the completion providers for `[[` wikilink syntax can be left in — they will never trigger in MyST files since users don't type `[[`).

- [x] **Step 5:** Check each file for imports of Foam VS Code services (`src/vscode/services/`, `src/vscode/utils/`). For each:
  - `editor.ts` utilities (getting current file URI, document text) — replace with direct `vscode.window.activeTextEditor` / `vscode.window.activeNotebookEditor` calls inline.
  - Any other service imports: inline the 2–3 lines needed rather than copying entire service files.

- [x] **Step 6:** Run `npx tsc --noEmit`. Fix errors.

- [x] **Step 7:** Commit.

```bash
git add src/graph/features/
git commit -m "feat(myst-notebook): backlinks, navigation, hover, and link-completion features"
```

---

### Task 6: Wire up — index.ts + extension.ts + package.json contributions

**Files:**
- Create: `src/graph/index.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`

- [x] **Step 1:** Create `src/graph/index.ts`:

```typescript
import * as vscode from 'vscode';
import { bootstrap } from './core';
import { createMarkdownParser } from './core';
import { MarkdownResourceProvider } from './core';
import { registerGraphWebview } from './features/graph-webview';
import { registerBacklinks } from './features/backlinks';
import { registerNavigation } from './features/navigation/navigation-provider';
import { registerHover } from './features/navigation/hover-provider';
import { registerLinkCompletion } from './features/navigation/link-completion';
import { mystCitationPlugin } from './myst-citation-parser';

export async function registerGraphFeatures(
  context: vscode.ExtensionContext,
  workspaceRoot: vscode.Uri
): Promise<void> {
  const parser = createMarkdownParser([mystCitationPlugin]);
  const watcher = /* VS Code file watcher for *.md */ null as any; // see step 2
  const datastore = /* VsCodeDataStore */ null as any;             // see step 2
  const foam = await bootstrap({ workspaceRoot, datastore, parser, watcher });

  registerGraphWebview(context, foam);
  registerBacklinks(context, foam);
  registerNavigation(context, foam);
  registerHover(context, foam);
  registerLinkCompletion(context, foam);
}
```

- [x] **Step 2:** Implement a minimal `VsCodeDataStore` and file watcher inline in `index.ts` (or a small `src/graph/vscode-datastore.ts`). This is adapted from Foam's `foam-vscode/src/services/` — it wraps `vscode.workspace.fs` for file reads and `vscode.workspace.createFileSystemWatcher('**/*.md')` for watching. Copy the relevant ~80 lines from `/home/zengma/vs_extensions/foam/packages/foam-vscode/src/services/`.

- [x] **Step 3:** Add to `src/extension.ts`:

```typescript
import { registerGraphFeatures } from './graph';
```

And inside `activate()`, after all existing registrations:

```typescript
// Graph features (async, non-blocking)
const workspaceFolders = vscode.workspace.workspaceFolders;
if (workspaceFolders && workspaceFolders.length > 0) {
  void registerGraphFeatures(context, workspaceFolders[0].uri);
}
```

- [x] **Step 4:** Add to `package.json` `contributes`:

**Commands:**
```json
{ "command": "myst-notebook.graph.show", "title": "MyST: Show Knowledge Graph" }
```

**Keybindings:**
```json
{
  "command": "myst-notebook.graph.show",
  "key": "ctrl+shift+g",
  "when": "notebookType == 'myst-notebook'"
}
```

**Views (backlinks panel in Explorer):**
```json
"views": {
  "explorer": [
    {
      "id": "myst-notebook.backlinks",
      "name": "Backlinks",
      "when": "workspaceContains:**/myst.yml"
    }
  ]
}
```

**Configuration:**
```json
"myst-notebook.graph.titleMaxLength": {
  "type": "number",
  "default": 24,
  "description": "Maximum title length shown on graph nodes (0 = unlimited)."
}
```

- [x] **Step 5:** Add `NOTICE` file at repo root:

```
Portions of src/graph/ are adapted from Foam (https://github.com/foambubble/foam)
Copyright 2020-present Jani Eväkallio, licensed under the MIT License.
```

- [x] **Step 6:** Run `npx tsc --noEmit`. Fix errors.

- [x] **Step 7:** Run `npm test` — expect all 187 existing tests to pass.

- [x] **Step 8:** Commit.

```bash
git add src/graph/index.ts src/extension.ts package.json NOTICE
git commit -m "feat(myst-notebook): wire graph features into extension activation"
```

---

### Task 7: Build, package, and verify

- [x] **Step 1:** Full build: `node esbuild.js`. Confirm three output files:
  - `dist/extension.js`
  - `dist/renderer/mystRenderer.js`
  - `dist/graph/webview.js`

- [x] **Step 2:** Run `npm test` — all tests pass.

- [x] **Step 3:** Run `npx tsc --noEmit` — clean.

- [x] **Step 4:** Package: `npx @vscode/vsce package`. Confirm `.vsix` produced, `dist/graph/webview.js` is included, `src/` is excluded.

- [x] **Step 5:** Install: `code --install-extension myst-notebook-0.0.1.vsix --force`.

- [x] **Step 6:** Commit if any final fixes were needed, then report final state.

```bash
git commit -m "chore(myst-notebook): graph integration complete — build and package verified"
```
