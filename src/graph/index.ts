/**
 * Graph feature wiring.
 *
 * Bootstraps the Foam workspace/graph against the VS Code workspace and
 * registers all five graph-feature providers (graph webview, backlinks panel,
 * navigation, hover, link completion).
 */

import * as vscode from 'vscode';
import {
  bootstrap,
  createMarkdownParser,
  MarkdownResourceProvider,
  URI,
} from './core';
import { mystCitationPlugin } from './myst-citation-parser';
import { registerGraphWebview } from './features/graph-webview';
import { registerBacklinks } from './features/backlinks';
import { registerNavigation } from './features/navigation/navigation-provider';
import { registerHover } from './features/navigation/hover-provider';
import { registerLinkCompletion } from './features/navigation/link-completion';
import {
  createVsCodeDataStore,
  createVsCodeMatcher,
  createVsCodeWatcher,
} from './vscode-datastore';

export async function registerGraphFeatures(
  context: vscode.ExtensionContext,
  workspaceRoot: vscode.Uri
): Promise<void> {
  // Build parser with the MyST citation plugin so citation references are
  // recognised when parsing markdown resources.
  const parser = createMarkdownParser([mystCitationPlugin]);

  // Include all Markdown files; exclude common noise directories.
  const include = ['**/*.md'];
  const exclude = ['**/node_modules/**', '**/.git/**', '**/dist/**'];

  const matcher = createVsCodeMatcher(workspaceRoot, include, exclude);
  const dataStore = createVsCodeDataStore(workspaceRoot);
  const watcher = createVsCodeWatcher(context, workspaceRoot, matcher);

  // Make sure the matcher's initial file list is populated before bootstrap
  // tries to enumerate resources.
  await matcher.refresh();

  // Determine workspace root URI in Foam's format.
  const rootUri = new URI({
    scheme: workspaceRoot.scheme,
    authority: workspaceRoot.authority,
    path: workspaceRoot.path,
    query: workspaceRoot.query,
    fragment: workspaceRoot.fragment,
  });

  const provider = new MarkdownResourceProvider(dataStore, parser);

  // bootstrap() signature:
  //   (roots, matcher, watcher, dataStore, parser, initialProviders,
  //    defaultExtension?, timingLogLevel?, fetchConcurrency?)
  const foamPromise = bootstrap(
    [rootUri],
    matcher,
    watcher,
    dataStore,
    parser,
    [provider]
  );

  // registerGraphWebview takes a Promise<Foam> so it can lazily open the panel.
  registerGraphWebview(context, foamPromise);

  // The remaining features need the resolved Foam instance.
  const foam = await foamPromise;

  context.subscriptions.push({ dispose: () => foam.dispose() });

  registerBacklinks(context, foam);
  registerNavigation(context, foam);
  registerHover(context, foam);
  registerLinkCompletion(context, foam);
}
