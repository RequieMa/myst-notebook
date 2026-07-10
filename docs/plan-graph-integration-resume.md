# Graph Integration — Resume Plan

> **For agentic workers:** Pick up from Task 6. Tasks 1–5 are done and committed.
> Use superpowers:subagent-driven-development. Two-stage review per task.

**Goal:** Complete the graph feature integration and ship a working `.vsix`.

**Spec:** `docs/spec-graph-integration.md`  
**Full plan:** `docs/plan-graph-integration.md`

---

## Status at session start

| Task | Status |
|------|--------|
| Task 1: deps + build scaffolding | ✅ done |
| Task 2: foam-core subset → `src/graph/core/` | ✅ done |
| Task 3: myst-citation-parser + webview source | ✅ done |
| Task 4: graph-webview extension-host feature | ✅ done |
| Task 5: backlinks, navigation, hover, completion | ✅ done |
| **Task 6: wire up index.ts + extension.ts + package.json** | ✅ done (79c3c94, ef96a01, 4a1b86a) |
| **Task 7: build, package, verify** | ✅ done (08238e6, 55ba1e6) |

`tsc` is clean on `main`. All 187 tests pass. `.vsix` built at 672 KB (includes `dist/graph/webview.js`).

---

## Task 6: Wire up — vscode-datastore, index.ts, extension.ts, package.json

**Files to create/modify:**
- Create: `src/graph/vscode-datastore.ts`
- Create: `src/graph/index.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`

### Step 1: Read before writing

Before writing any code, read:
- `src/graph/core/model/foam.ts` — exact `bootstrap()` signature
- `src/graph/core/services/datastore.ts` — `IDataStore`, `IMatcher`, `IWatcher` interfaces
- `/home/zengma/vs_extensions/foam/packages/foam-vscode/src/services/datastore.ts` — VS Code implementation reference
- `/home/zengma/vs_extensions/foam/packages/foam-vscode/src/services/watcher.ts` — VS Code watcher reference
- `src/graph/features/graph-webview/index.ts` — exact export signature of `registerGraphWebview`
- `src/graph/features/backlinks/index.ts` — exact export signature of `registerBacklinks`
- `src/graph/features/navigation/navigation-provider.ts` — exact export of `registerNavigation`
- `src/graph/features/navigation/hover-provider.ts` — exact export of `registerHover`
- `src/graph/features/navigation/link-completion.ts` — exact export of `registerLinkCompletion`

### Step 2: Create `src/graph/vscode-datastore.ts`

Adapt from `/home/zengma/vs_extensions/foam/packages/foam-vscode/src/services/datastore.ts` and `watcher.ts`. Export:

```typescript
export function createVsCodeDataStore(workspaceRoot: vscode.Uri): IDataStore
export function createVsCodeMatcher(workspaceRoot: vscode.Uri, include: string[], exclude: string[]): IMatcher
export function createVsCodeWatcher(context: vscode.ExtensionContext, workspaceRoot: vscode.Uri, matcher: IMatcher): IWatcher
```

### Step 3: Create `src/graph/index.ts`

```typescript
import * as vscode from 'vscode';
import { bootstrap, createMarkdownParser, MarkdownResourceProvider, URI } from './core';
import { mystCitationPlugin } from './myst-citation-parser';
import { registerGraphWebview } from './features/graph-webview';
import { registerBacklinks } from './features/backlinks';
import { registerNavigation } from './features/navigation/navigation-provider';
import { registerHover } from './features/navigation/hover-provider';
import { registerLinkCompletion } from './features/navigation/link-completion';
import { createVsCodeDataStore, createVsCodeMatcher, createVsCodeWatcher } from './vscode-datastore';

export async function registerGraphFeatures(
  context: vscode.ExtensionContext,
  workspaceRoot: vscode.Uri
): Promise<void> {
  const parser = createMarkdownParser([mystCitationPlugin]);
  const matcher = createVsCodeMatcher(workspaceRoot, ['**/*.md'], ['**/node_modules/**', '**/_build/**']);
  const datastore = createVsCodeDataStore(workspaceRoot);
  const watcher = createVsCodeWatcher(context, workspaceRoot, matcher);

  // Adjust bootstrap() call to match actual signature from src/graph/core/model/foam.ts
  const foamPromise = bootstrap(/* ... */);

  registerGraphWebview(context, foamPromise);
  const foam = await foamPromise;
  registerBacklinks(context, foam);
  registerNavigation(context, foam);
  registerHover(context, foam);
  registerLinkCompletion(context, foam);
}
```

### Step 4: Wire into `src/extension.ts`

Add import at top:
```typescript
import { registerGraphFeatures } from './graph';
```

Add at end of `activate()`, after all existing registrations:
```typescript
// Graph features (knowledge graph, backlinks, navigation, hover, completion)
const workspaceFolders = vscode.workspace.workspaceFolders;
if (workspaceFolders && workspaceFolders.length > 0) {
  void registerGraphFeatures(context, workspaceFolders[0].uri);
}
```

### Step 5: Update `package.json` contributions

**Commands** (add to `contributes.commands`):
```json
{ "command": "myst-notebook.graph.show", "title": "MyST: Show Knowledge Graph" }
```

**Keybindings** (add to `contributes.keybindings`):
```json
{
  "command": "myst-notebook.graph.show",
  "key": "ctrl+shift+g",
  "when": "notebookType == 'myst-notebook'"
}
```

**Views** (add to `contributes.views.explorer`, alongside the existing `myst-notebook.mathPalette`):
```json
{
  "id": "myst-notebook.connections",
  "name": "Backlinks",
  "when": "workspaceContains:**/myst.yml"
}
```

**Configuration** — add these properties (read `package.json` first to see if `contributes.configuration` exists; if not, add the whole block):
```json
"myst-notebook.graph.titleMaxLength": {
  "type": "number",
  "default": 24,
  "description": "Maximum title length shown on graph nodes. Set to 0 for unlimited."
},
"myst-notebook.links.directory.mode": {
  "type": "string",
  "default": "off",
  "enum": ["off", "relative-path", "absolute-path"],
  "description": "How directory is shown in link completion results."
},
"myst-notebook.completion.useAlias": {
  "type": "boolean",
  "default": false,
  "description": "Use note title as alias in link completion."
},
"myst-notebook.completion.linkFormat": {
  "type": "string",
  "default": "wikilink",
  "enum": ["wikilink", "mdlink"],
  "description": "Format used when inserting link completions."
}
```

### Step 6: tsc + tests + commit

```bash
npx tsc --noEmit          # must be clean
npm test                   # must be 187 passed
git add src/graph/index.ts src/graph/vscode-datastore.ts src/extension.ts package.json
git commit -m "feat(myst-notebook): wire graph features into extension activation"
```

---

## Task 7: Build, package, verify

### Step 1: Full build
```bash
node esbuild.js
```
Confirm three output files exist:
- `dist/extension.js`
- `dist/renderer/mystRenderer.js`
- `dist/graph/webview.js`

### Step 2: Run all checks
```bash
npm test                   # 187 passed
npx tsc --noEmit           # clean
```

### Step 3: Package
```bash
npx @vscode/vsce package
```
Confirm `.vsix` produced and `dist/graph/webview.js` is included.

### Step 4: Install and test
```bash
code --install-extension myst-notebook-0.0.1.vsix --force
```

Manual verify (requires VS Code with a MyST workspace open):
- `Ctrl+Shift+G` opens the knowledge graph panel — nodes visible, edges for `[name](link)` and `{cite}` present
- Dashed boundary around note nodes, citation nodes floating outside
- Backlinks panel in Explorer sidebar shows incoming links for the active file
- Ctrl+Click on `[name](link)` in a prose cell navigates to the target file
- Hover over `[name](link)` shows tooltip with first paragraph of target
- Typing `](` in a prose cell offers autocomplete of `.md` file paths

### Step 5: Commit if any final fixes needed
```bash
git commit -m "chore(myst-notebook): graph integration complete — build and package verified"
```

---

## Key context

- **View id conflict check:** `myst-notebook.connections` is the backlinks view id used in `features/backlinks/index.ts` — `package.json` must register it under `contributes.views.explorer` or the panel won't appear
- **No `foam.*` namespace anywhere** — all settings/commands use `myst-notebook.*`
- **No wikilink UI** — wikilink parsing is in the remark pipeline but never surfaced in completions or decorations for MyST files
- **Engine floor stays `^1.85.0`** — do not bump it
- **Attribution:** `NOTICE` file already created at repo root in Task 2
