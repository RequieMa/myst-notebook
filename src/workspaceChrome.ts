import * as vscode from 'vscode';
import { desiredChromeSettings } from './core/chromeSettings';

/**
 * Write the focused-notebook chrome settings (see `desiredChromeSettings`) into the
 * open workspace, so MyST notebooks read like a writing document rather than a code IDE.
 *
 * Called fire-and-forget from `activate`. Activation is gated on `workspaceContains`
 * `**\/myst.yml`, so a workspace folder is expected — but we still guard, because
 * workspace settings cannot be written without one. Each key is only written when its
 * current effective value differs, to avoid needlessly dirtying `.vscode/settings.json`.
 * Failures are logged and swallowed so one bad key can't abort activation.
 */
export async function applyFocusedNotebookSettings(): Promise<void> {
  if (!vscode.workspace.workspaceFolders?.length) return;

  for (const [key, value] of Object.entries(desiredChromeSettings())) {
    const config = vscode.workspace.getConfiguration();
    // Values here are primitives (boolean/string), so `===` is a sufficient equality
    // check — skip the write when we already match to keep settings.json quiet.
    if (config.get(key) === value) continue;
    try {
      await config.update(key, value, vscode.ConfigurationTarget.Workspace);
    } catch (err) {
      console.error(`myst-notebook: failed to set ${key}`, err);
    }
  }
}
