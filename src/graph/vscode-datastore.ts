/**
 * VS Code adapters for IDataStore, IMatcher, and IWatcher.
 *
 * These bridge the graph core's storage/watch abstractions to VS Code's
 * workspace APIs: findFiles for enumeration, workspace.fs for I/O,
 * createFileSystemWatcher for change events, and micromatch-style glob
 * evaluation via VS Code's built-in RelativePattern.
 */

import * as vscode from 'vscode';
import { URI } from './core/model/uri';
import { Emitter } from './core/common/event';
import type { IDataStore, IMatcher, IWatcher } from './core/services/datastore';

// ---------------------------------------------------------------------------
// URI conversion helpers
// ---------------------------------------------------------------------------

function fromVsCodeUri(u: vscode.Uri): URI {
  return new URI({
    scheme: u.scheme,
    authority: u.authority,
    path: u.path,
    query: u.query,
    fragment: u.fragment,
  });
}

function toVsCodeUri(u: URI): vscode.Uri {
  return vscode.Uri.from(u as Parameters<typeof vscode.Uri.from>[0]);
}

// ---------------------------------------------------------------------------
// IDataStore — backed by vscode.workspace.fs
// ---------------------------------------------------------------------------

/**
 * Create an IDataStore that reads and writes files through vscode.workspace.fs.
 * `list()` uses vscode.workspace.findFiles; optional glob pattern is passed
 * as-is to findFiles.
 */
export function createVsCodeDataStore(workspaceRoot: vscode.Uri): IDataStore {
  return {
    async list(pattern?: string): Promise<URI[]> {
      const include = pattern
        ? new vscode.RelativePattern(workspaceRoot, pattern)
        : new vscode.RelativePattern(workspaceRoot, '**/*');
      const files = await vscode.workspace.findFiles(include);
      return files.map(fromVsCodeUri);
    },

    async read(uri: URI): Promise<string | null> {
      try {
        const bytes = await vscode.workspace.fs.readFile(toVsCodeUri(uri));
        return Buffer.from(bytes).toString('utf8');
      } catch {
        return null;
      }
    },

    async write(uri: URI, content: string): Promise<void> {
      const vsUri = toVsCodeUri(uri);
      // Ensure parent directory exists
      const parent = vscode.Uri.joinPath(vsUri, '..');
      try {
        await vscode.workspace.fs.createDirectory(parent);
      } catch {
        // Directory may already exist
      }
      await vscode.workspace.fs.writeFile(vsUri, Buffer.from(content, 'utf8'));
    },

    async delete(uri: URI): Promise<void> {
      try {
        await vscode.workspace.fs.delete(toVsCodeUri(uri));
      } catch {
        // File may not exist — no-op
      }
    },

    async move(from: URI, to: URI): Promise<void> {
      const toVsUri = toVsCodeUri(to);
      const parent = vscode.Uri.joinPath(toVsUri, '..');
      try {
        await vscode.workspace.fs.createDirectory(parent);
      } catch {
        // Directory may already exist
      }
      await vscode.workspace.fs.rename(toVsCodeUri(from), toVsUri, {
        overwrite: true,
      });
    },

    async exists(uri: URI): Promise<boolean> {
      try {
        await vscode.workspace.fs.stat(toVsCodeUri(uri));
        return true;
      } catch {
        return false;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// IMatcher — glob-based, backed by vscode.workspace.findFiles
// ---------------------------------------------------------------------------

/**
 * Create an IMatcher that uses VS Code's RelativePattern to check whether
 * a URI falls within the include/exclude globs.
 *
 * `match` and `isMatch` check the URI path against each include pattern
 * using a simple substring/glob heuristic via VS Code's relative pattern;
 * `refresh` re-enumerates the matched files list.
 */
export function createVsCodeMatcher(
  workspaceRoot: vscode.Uri,
  include: string[],
  exclude: string[]
): IMatcher {
  // Cache of matched paths for fast isMatch checks
  let matchedPaths: Set<string> = new Set();

  async function fetchMatchedPaths(): Promise<Set<string>> {
    const patterns = include.length > 0 ? include : ['**/*'];
    const excludeGlob =
      exclude.length > 0 ? `{${exclude.join(',')}}` : undefined;

    const allFiles: vscode.Uri[] = [];
    for (const pattern of patterns) {
      const rp = new vscode.RelativePattern(workspaceRoot, pattern);
      const files = await vscode.workspace.findFiles(rp, excludeGlob);
      allFiles.push(...files);
    }
    return new Set(allFiles.map(f => f.path));
  }

  return {
    include: include.length > 0 ? include : ['**/*'],
    exclude,

    match(files: URI[]): URI[] {
      return files.filter(f => matchedPaths.has(f.path));
    },

    isMatch(uri: URI): boolean {
      return matchedPaths.has(uri.path);
    },

    async refresh(): Promise<void> {
      matchedPaths = await fetchMatchedPaths();
    },
  };
}

// ---------------------------------------------------------------------------
// IWatcher — backed by vscode.workspace.createFileSystemWatcher
// ---------------------------------------------------------------------------

/**
 * Create an IWatcher that fires change/create/delete events using VS Code
 * file system watchers, one per include glob.  The watchers are registered
 * on the extension context so they are disposed automatically on deactivation.
 */
export function createVsCodeWatcher(
  context: vscode.ExtensionContext,
  workspaceRoot: vscode.Uri,
  matcher: IMatcher
): IWatcher {
  const changeEmitter = new Emitter<URI>();
  const createEmitter = new Emitter<URI>();
  const deleteEmitter = new Emitter<URI>();

  const patterns = matcher.include.length > 0 ? matcher.include : ['**/*'];

  for (const pattern of patterns) {
    const rp = new vscode.RelativePattern(workspaceRoot, pattern);
    const watcher = vscode.workspace.createFileSystemWatcher(rp);

    context.subscriptions.push(
      watcher,
      watcher.onDidChange(uri => changeEmitter.fire(fromVsCodeUri(uri))),
      watcher.onDidCreate(uri => createEmitter.fire(fromVsCodeUri(uri))),
      watcher.onDidDelete(uri => deleteEmitter.fire(fromVsCodeUri(uri)))
    );
  }

  return {
    onDidChange: changeEmitter.event,
    onDidCreate: createEmitter.event,
    onDidDelete: deleteEmitter.event,
  };
}
