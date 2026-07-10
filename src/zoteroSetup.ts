import * as vscode from 'vscode';
import {
  caywUrlForRole,
  isMystCiteUrl,
  CiteRole,
  ZOTERO_EXTENSION_ID,
  ZOTERO_SETTING,
} from './zoteroConfig';

const PROMPT_DISMISSED_KEY = 'myst.zoteroPromptDismissed';

/**
 * Registers the "Configure Zotero Citations" command and runs the one-time
 * activation prompt that offers to wire `mblode.zotero` up for MyST `{cite}`.
 */
export function registerZoteroSetup(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'myst-notebook.configureZoteroCitations',
      () => configureZotero(context)
    )
  );

  void maybePromptZoteroConfig(context);
}

/**
 * Point `mblode.zotero`'s setting at a MyST CAYW template URL (Workspace scope).
 * Handles the extension being absent (offer to install) or inactive (activate
 * first, so the setting is registered — update() throws otherwise).
 */
async function configureZotero(
  context: vscode.ExtensionContext,
  role?: CiteRole
): Promise<void> {
  const ext = vscode.extensions.getExtension(ZOTERO_EXTENSION_ID);
  if (!ext) {
    const choice = await vscode.window.showInformationMessage(
      'The "Citation Picker for Zotero" (mblode.zotero) extension is required for MyST citations. Install it now?',
      'Install',
      'Cancel'
    );
    if (choice === 'Install') {
      await vscode.commands.executeCommand(
        'workbench.extensions.installExtension',
        ZOTERO_EXTENSION_ID
      );
      void vscode.window.showInformationMessage(
        'Citation Picker for Zotero installed. Run "MyST: Configure Zotero Citations" again to finish setup.'
      );
    }
    return;
  }
  if (!ext.isActive) {
    // The setting is only registered once its owning extension activates;
    // getConfiguration().update() throws on an unregistered configuration.
    await ext.activate();
  }

  if (!vscode.workspace.workspaceFolders?.length) {
    void vscode.window.showWarningMessage(
      'Open your MyST / Jupyter Book folder first, then run "MyST: Configure Zotero Citations".'
    );
    return;
  }

  const chosen = role ?? (await pickRole());
  if (!chosen) return;

  await vscode.workspace
    .getConfiguration()
    .update(ZOTERO_SETTING, caywUrlForRole(chosen), vscode.ConfigurationTarget.Workspace);

  void vscode.window.showInformationMessage(
    `MyST citations configured for this workspace (role: {${chosen}}). Press Alt+Shift+Z in a Markdown file to cite.`
  );
}

async function pickRole(): Promise<CiteRole | undefined> {
  const pick = await vscode.window.showQuickPick(
    [
      { label: '{cite}', description: 'basic citation', role: 'cite' as CiteRole },
      { label: '{cite:p}', description: 'parenthetical', role: 'cite:p' as CiteRole },
      { label: '{cite:t}', description: 'textual / narrative', role: 'cite:t' as CiteRole },
    ],
    { placeHolder: 'Which MyST citation role should the Zotero picker insert?' }
  );
  return pick?.role;
}

/**
 * One-time, non-intrusive offer to configure Zotero for MyST. Fires only when it
 * can actually succeed and hasn't been declined before.
 */
async function maybePromptZoteroConfig(
  context: vscode.ExtensionContext
): Promise<void> {
  if (context.globalState.get<boolean>(PROMPT_DISMISSED_KEY)) return;
  // Silent when the picker isn't installed — don't nag users who don't cite.
  if (!vscode.extensions.getExtension(ZOTERO_EXTENSION_ID)) return;
  if (!vscode.workspace.workspaceFolders?.length) return;
  // Already configured for MyST — nothing to do.
  const current = vscode.workspace
    .getConfiguration()
    .get<string>(ZOTERO_SETTING);
  if (isMystCiteUrl(current)) return;

  const choice = await vscode.window.showInformationMessage(
    'Configure the Zotero picker to insert MyST `{cite}` citations in this workspace?',
    'Configure',
    'Not now',
    "Don't ask again"
  );
  if (choice === 'Configure') {
    await configureZotero(context, 'cite');
  } else if (choice === "Don't ask again") {
    await context.globalState.update(PROMPT_DISMISSED_KEY, true);
  }
}
