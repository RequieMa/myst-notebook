import * as vscode from 'vscode';
import { rankKernelSpecs, labelFor, type KernelSpecInfo } from './core/kernelRanking';
import { log } from './log';

// ---------------------------------------------------------------------------
// Kernel quick-pick
// ---------------------------------------------------------------------------

type KernelQuickPickItem = vscode.QuickPickItem & { spec: KernelSpecInfo };

/**
 * Show a quick-pick populated with ranked Python environments.
 * Returns the chosen `KernelSpecInfo`, or `undefined` if the user dismissed.
 *
 * Ranking/labeling is delegated to the pure `core/kernelRanking` helpers so the
 * ordering logic stays unit-tested; this module is only the VS Code presentation.
 * Ensuring the chosen environment is runnable (ipykernel + jupyter-server) is a
 * separate concern handled by `envSetup.ensureRuntime`, not here.
 */
export async function pickKernel(
  specs: KernelSpecInfo[],
  workspaceRoot: string
): Promise<KernelSpecInfo | undefined> {
  log('[kernelPicker] pickKernel called with ' + specs.length + ' specs, workspaceRoot=' + workspaceRoot);

  const ranked = rankKernelSpecs(specs, workspaceRoot);
  log('[kernelPicker] ranked order: ' + ranked.map(s => s.id).join(', '));

  const items: KernelQuickPickItem[] = ranked.map(spec => ({
    label: labelFor(spec),
    // Show the full interpreter path as detail if available — keeps label short
    // while letting power users identify the exact environment.
    detail: spec.interpreterPath,
    spec,
  }));

  const chosen = await vscode.window.showQuickPick<KernelQuickPickItem>(items, {
    placeHolder: 'Select a Python environment to run this MyST notebook',
    matchOnDetail: true,
  });

  if (chosen === undefined) {
    log('[kernelPicker] pickKernel: dismissed (no selection)');
    return undefined;
  }

  log('[kernelPicker] pickKernel: chose spec id=' + chosen.spec.id);
  return chosen.spec;
}
