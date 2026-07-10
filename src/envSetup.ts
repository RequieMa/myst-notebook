/**
 * Runtime environment setup for the raw-REST (Option A) kernel transport.
 *
 * The transport needs two Python packages in the chosen interpreter's environment:
 *   - `ipykernel`     (import name: `ipykernel`)     — the kernel itself
 *   - `jupyter-server` (import name: `jupyter_server`) — the server we drive over REST
 *
 * This module has one responsibility: probe whether those two packages import in a
 * given interpreter, and — when either is missing — prompt the user and install the
 * missing subset. Two exports, stateless.
 *
 * Note the pip-package-name vs import-name mismatch, kept explicit throughout:
 *   pip package `ipykernel`      ↔ import `ipykernel`
 *   pip package `jupyter-server` ↔ import `jupyter_server`
 */

import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { log } from './log';
import type { KernelSpecInfo } from './core/kernelRanking';
import {
  classifyRuntime,
  buildInstallCommand,
  installOutcome,
  messageFor,
} from './core/failurePolicy';

// ---------------------------------------------------------------------------
// Step 1: silent probe (execFile, NOT a Task)
// ---------------------------------------------------------------------------

/**
 * Run `<interpreterPath> -c "import <module>"` and resolve whether it exited 0.
 *
 * Never throws: a non-zero exit (module missing) OR a spawn failure (bad path)
 * both resolve `false`. This is a silent background probe — no terminal, no user
 * interaction — so we use `child_process.execFile` rather than the Tasks API.
 */
function importSucceeds(interpreterPath: string, moduleName: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    execFile(interpreterPath, ['-c', `import ${moduleName}`], (err) => {
      // err is set on non-zero exit AND on spawn failure (ENOENT etc.); both mean
      // the module is not importable in this interpreter as far as we care.
      resolve(err === null);
    });
  });
}

/**
 * Probe whether ipykernel and jupyter_server import successfully in the given
 * interpreter. Two SEPARATE checks so we know which package is missing.
 */
export async function probeRuntime(
  interpreterPath: string
): Promise<{ ipykernel: boolean; jupyterServer: boolean }> {
  const [ipykernel, jupyterServer] = await Promise.all([
    importSucceeds(interpreterPath, 'ipykernel'),
    importSucceeds(interpreterPath, 'jupyter_server'),
  ]);

  log(
    `[envSetup] probe ${interpreterPath}: ipykernel=${ipykernel} jupyterServer=${jupyterServer}`
  );

  return { ipykernel, jupyterServer };
}

// ---------------------------------------------------------------------------
// Step 2: ensure both packages present (prompt + install missing subset)
// ---------------------------------------------------------------------------

/**
 * Ensure both ipykernel + jupyter-server are present in the env backing `spec`.
 *
 * - Unknown interpreter path → warn + return false.
 * - Probe; if nothing missing → return true.
 * - Otherwise modal-confirm, install the missing subset via the Tasks API
 *   (visible terminal, real exit code), then re-probe.
 * - Returns true ONLY IF the install exited 0 AND a fresh probe reports BOTH present.
 */
export async function ensureRuntime(spec: KernelSpecInfo): Promise<boolean> {
  log('[envSetup] ensureRuntime called for spec id=' + spec.id);

  // Guard: unknown interpreter path — we cannot probe or install without it.
  if (spec.interpreterPath === undefined) {
    log('[envSetup] ensureRuntime: interpreterPath is undefined, cannot proceed');
    await vscode.window.showWarningMessage(messageFor('unknownInterpreter'));
    return false;
  }

  const interpreterPath = spec.interpreterPath;
  const probe = await probeRuntime(interpreterPath);
  const missing = classifyRuntime(probe);

  if (missing.length === 0) {
    log('[envSetup] ensureRuntime: runtime ok (both packages present)');
    return true;
  }

  log('[envSetup] ensureRuntime: missing set = ' + missing.join(', '));

  // Modal confirm before touching the user's environment.
  const answer = await vscode.window.showInformationMessage(
    `MyST needs ${missing.join(' and ')} in "${spec.displayName}". Install now?`,
    { modal: true },
    'Install'
  );

  if (answer !== 'Install') {
    log('[envSetup] ensureRuntime: user declined install');
    return false;
  }

  // Build + run the install command.
  const { command, args } = buildInstallCommand(interpreterPath, missing);
  log('[envSetup] ensureRuntime: chosen command = ' + [command, ...args].join(' '));

  let exitCode: number | undefined;
  try {
    const shellExec = new vscode.ShellExecution(
      { value: command, quoting: vscode.ShellQuoting.Strong },
      args.map((a) => ({ value: a, quoting: vscode.ShellQuoting.Strong }))
    );

    const task = new vscode.Task(
      { type: 'shell' },
      vscode.TaskScope.Workspace,
      'Install MyST runtime',
      'MyST Notebook',
      shellExec
    );

    const exe = await vscode.tasks.executeTask(task);

    // Await a REAL exit code. onDidEndTaskProcess fires only when a process was
    // actually launched (gives e.exitCode). If the task ends WITHOUT launching a
    // process (bad command, missing shell, spawn failure) VS Code fires
    // onDidEndTask but NOT onDidEndTaskProcess — without that fallback the await
    // would never settle and the listener would leak. We register BOTH and dispose
    // ALL listeners through a SINGLE cleanup path (`done`).
    exitCode = await new Promise<number | undefined>((resolve) => {
      const disposables: vscode.Disposable[] = [];
      const done = (code: number | undefined) => {
        disposables.forEach((d) => d.dispose());
        resolve(code);
      };
      disposables.push(
        vscode.tasks.onDidEndTaskProcess((e) => {
          if (e.execution === exe) {
            done(e.exitCode);
          }
        })
      );
      disposables.push(
        vscode.tasks.onDidEndTask((e) => {
          if (e.execution === exe) {
            log('[envSetup] ensureRuntime: task ended without launching a process');
            done(undefined);
          }
        })
      );
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('[envSetup] ensureRuntime: error running install task: ' + message);
    await vscode.window.showWarningMessage(messageFor('installTaskError'));
    return false;
  }

  log('[envSetup] ensureRuntime: install process exited with code=' + String(exitCode));

  if (exitCode !== 0) {
    log('[envSetup] ensureRuntime: install failed (non-zero exit ' + String(exitCode) + ')');
    await vscode.window.showWarningMessage(messageFor('installNonZero'));
    return false;
  }

  const after = await probeRuntime(interpreterPath);
  const outcome = installOutcome(exitCode, after);
  if (outcome.ok) {
    log('[envSetup] ensureRuntime: install succeeded, both packages now present');
    return true;
  }
  log(
    '[envSetup] ensureRuntime: install exited 0 but re-probe still missing: ' +
      `ipykernel=${after.ipykernel} jupyterServer=${after.jupyterServer}`
  );
  await vscode.window.showWarningMessage(messageFor('installStillMissing'));
  return false;
}
