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
import { execFile, exec } from 'child_process';
import { log } from './log';
import type { KernelSpecInfo } from './core/kernelRanking';
import {
  classifyRuntime,
  buildInstallCommands,
  type InstallCommand,
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
// Step 2: install helpers
// ---------------------------------------------------------------------------

/**
 * Run a single install command as a VS Code shell task. Returns the exit code,
 * or `undefined` if the task never launched a process.
 */
async function runShellTask(cmd: InstallCommand): Promise<number | undefined> {
  try {
    const shellExec = new vscode.ShellExecution(
      { value: cmd.command, quoting: vscode.ShellQuoting.Strong },
      cmd.args.map((a) => ({ value: a, quoting: vscode.ShellQuoting.Strong }))
    );

    const task = new vscode.Task(
      { type: 'shell' },
      vscode.TaskScope.Workspace,
      'Install MyST runtime',
      'MyST Notebook',
      shellExec
    );

    const exe = await vscode.tasks.executeTask(task);

    return await new Promise<number | undefined>((resolve) => {
      const disposables: vscode.Disposable[] = [];
      const done = (code: number | undefined) => {
        disposables.forEach((d) => d.dispose());
        resolve(code);
      };
      disposables.push(
        vscode.tasks.onDidEndTaskProcess((e) => {
          if (e.execution === exe) done(e.exitCode);
        })
      );
      disposables.push(
        vscode.tasks.onDidEndTask((e) => {
          if (e.execution === exe) {
            log('[envSetup] task ended without launching a process');
            done(undefined);
          }
        })
      );
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('[envSetup] error running install task: ' + message);
    return undefined;
  }
}

/** Human-readable label for an install command (for logging and progress). */
function commandLabel(cmd: InstallCommand, interpreterPath: string): string {
  if (cmd.command === interpreterPath) return 'pip';
  return cmd.command;
}

/**
 * Ensure `uv` is available on PATH. If not found, bootstrap it via the
 * official install script. Returns true if uv is ready to use afterwards.
 *
 * Bootstrapping is silent (within the progress notification) — the user
 * already opted into "install what's needed".
 */
async function ensureUvAvailable(): Promise<boolean> {
  // Fast path: uv already on PATH.
  try {
    await execFileAsync('uv', ['--version']);
    return true;
  } catch {
    /* not found — bootstrap below */
  }

  log('[envSetup] uv not found on PATH, bootstrapping…');

  try {
    // On Linux/macOS, use the curl install script. On Windows this path
    // will fail, but pip is usually available there so we rarely reach uv.
    await execAsync('curl -LsSf https://astral.sh/uv/install.sh | sh');
    // Verify the install succeeded.
    await execFileAsync('uv', ['--version']);
    log('[envSetup] uv bootstrap succeeded');
    return true;
  } catch (err) {
    log(`[envSetup] uv bootstrap failed: ${String(err)}`);
    return false;
  }
}

/** Promisified execFile (we only care about success/failure, not stdout). */
function execFileAsync(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err) => (err ? reject(err) : resolve()));
  });
}

/** Promisified exec (for piped shell commands like curl | sh). */
function execAsync(command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => (err ? reject(err) : resolve({ stdout, stderr })));
  });
}

// ---------------------------------------------------------------------------
// Step 3: ensure both packages present (prompt + install missing subset)
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

  const commands = buildInstallCommands(interpreterPath, missing);

  // Try each command in order. First success wins.
  for (const cmd of commands) {
    const label = commandLabel(cmd, interpreterPath);

    // Before trying uv, ensure it's on PATH. Silently bootstrap if missing.
    if (cmd.command === 'uv') {
      const uvReady = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'MyST Notebook: preparing uv…', cancellable: false },
        async () => ensureUvAvailable()
      );
      if (!uvReady) {
        log('[envSetup] ensureRuntime: uv not available, cannot use as fallback');
        continue;
      }
    }

    log(`[envSetup] ensureRuntime: trying ${label}`);
    const exitCode = await vscode.window.withProgress<number | undefined>(
      {
        location: vscode.ProgressLocation.Notification,
        title: `MyST Notebook: installing ${missing.join(', ')} via ${label}…`,
        cancellable: false,
      },
      async () => runShellTask(cmd)
    );

    log(`[envSetup] ensureRuntime: ${label} exited with code=${String(exitCode)}`);

    if (exitCode === 0) {
      const after = await probeRuntime(interpreterPath);
      const outcome = installOutcome(0, after);
      if (outcome.ok) {
        log(`[envSetup] ensureRuntime: ${label} succeeded`);
        return true;
      }
      log(
        `[envSetup] ensureRuntime: ${label} exit 0 but re-probe still missing: ` +
          `ipykernel=${after.ipykernel} jupyterServer=${after.jupyterServer}`
      );
    }
  }

  // None of the commands succeeded.
  log('[envSetup] ensureRuntime: all install methods failed');
  await vscode.window.showWarningMessage(messageFor('installFailed'));
  return false;
}
