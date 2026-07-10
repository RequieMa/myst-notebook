import * as vscode from 'vscode';

const DISMISS_KEY = 'myst-notebook.firstOpen.dismissed';
export const NOTEBOOK_TYPE = 'myst-notebook';

/** Pure predicate: should we offer to open this document as a MyST Notebook? */
export function shouldOfferNotebook(ctx: {
  isMarkdown: boolean;
  inMystWorkspace: boolean;
  alreadyNotebook: boolean;
  dismissed: boolean;
}): boolean {
  return ctx.isMarkdown && ctx.inMystWorkspace && !ctx.alreadyNotebook && !ctx.dismissed;
}

/** Open the given .md uri in the MyST Notebook editor. */
export async function openAsNotebook(uri?: vscode.Uri): Promise<void> {
  const target = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!target) return;
  await vscode.commands.executeCommand('vscode.openWith', target, NOTEBOOK_TYPE);
}

/** True if the workspace contains a myst.yml (MyST/Jupyter Book project). */
async function inMystWorkspace(): Promise<boolean> {
  const hits = await vscode.workspace.findFiles('**/myst.yml', '**/node_modules/**', 1);
  return hits.length > 0;
}

/**
 * Register the open-as-notebook command and the one-time first-open toast.
 * The toast fires when a .md text document is opened in a MyST workspace and
 * the user has not previously dismissed it.
 */
export function registerOnboarding(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('myst-notebook.openAsNotebook', (uri?: vscode.Uri) =>
      openAsNotebook(uri)
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async (doc) => {
      // Cheap synchronous guards first — skip the workspace scan when they fail.
      const isMarkdown = doc.languageId === 'markdown';
      // Notebook cells use the 'vscode-notebook-cell' scheme; only those indicate the
      // doc is already open inside a notebook editor. Checking this exact scheme (rather
      // than "not file") keeps the toast working for remote/WSL/virtual file schemes.
      const alreadyNotebook = doc.uri.scheme === 'vscode-notebook-cell';
      const dismissed = context.globalState.get<boolean>(DISMISS_KEY, false);
      if (!isMarkdown || alreadyNotebook || dismissed) return;

      if (!(await inMystWorkspace())) return;

      const choice = await vscode.window.showInformationMessage(
        'This looks like a MyST document. Open it as a MyST Notebook?',
        'Open',
        "Don't ask again"
      );
      if (choice === 'Open') {
        await context.globalState.update(DISMISS_KEY, true);
        await openAsNotebook(doc.uri);
      } else if (choice === "Don't ask again") {
        await context.globalState.update(DISMISS_KEY, true);
      }
    })
  );
}
