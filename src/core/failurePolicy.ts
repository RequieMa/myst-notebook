/**
 * Pure failure-policy decisions for kernel/runtime handling.
 *
 * NO `vscode` import may ever appear in this file — that is what makes every
 * function here unit-testable under vitest. The VS Code glue (showX, Tasks API,
 * child_process) lives in envSetup.ts and mystController.ts and calls into here.
 *
 * pip package `ipykernel`      <-> import `ipykernel`
 * pip package `jupyter-server` <-> import `jupyter_server`
 */

/** Probe result: does each module import in the chosen interpreter. */
export interface RuntimeProbe {
  ipykernel: boolean;
  jupyterServer: boolean;
}

/** Missing PIP package names, ipykernel before jupyter-server. */
export function classifyRuntime(probe: RuntimeProbe): string[] {
  const missing: string[] = [];
  if (!probe.ipykernel) missing.push('ipykernel');
  if (!probe.jupyterServer) missing.push('jupyter-server');
  return missing;
}

/**
 * Derive a conda env name from an interpreter path containing `/envs/<name>/`.
 * Returns undefined when not confidently parseable (we then fall back to pip).
 */
function condaEnvName(interpreterPath: string): string | undefined {
  const match = interpreterPath.match(/\/envs\/([^/]+)\//);
  return match?.[1];
}

/**
 * Build the install command for the missing pip package subset.
 * - conda env with a parseable name -> `conda install -n <name> -y <pkgs>`
 * - uv-managed Python (detected via path heuristic) -> `<interpreter> -m uv pip install <pkgs>`
 * - everything else                 -> `<interpreter> -m pip install <pkgs>`
 *
 * Precondition: pkgs is non-empty (the caller skips install when nothing is missing).
 */
export function buildInstallCommand(
  interpreterPath: string,
  pkgs: string[]
): { command: string; args: string[] } {
  if (interpreterPath.includes('/envs/')) {
    const envName = condaEnvName(interpreterPath);
    if (envName) {
      return { command: 'conda', args: ['install', '-n', envName, '-y', ...pkgs] };
    }
  }
  // uv-managed Python (pep 668 externally-managed via uv): use `uv pip install`.
  if (isUvManagedPath(interpreterPath)) {
    return { command: 'uv', args: ['pip', 'install', '--python', interpreterPath, ...pkgs] };
  }
  // Homebrew Python: also externally-managed, but uv respects this as well.
  // Fall back to pip with --break-system-packages (what brew's own error suggests).
  if (interpreterPath.includes('/.linuxbrew/') || interpreterPath.includes('/homebrew/')) {
    return { command: interpreterPath, args: ['-m', 'pip', 'install', '--break-system-packages', ...pkgs] };
  }
  return { command: interpreterPath, args: ['-m', 'pip', 'install', ...pkgs] };
}

/** Heuristic: interpreter lives under a path typical of uv-installed Python. */
function isUvManagedPath(interpreterPath: string): boolean {
  return (
    interpreterPath.includes('/.local/bin/') ||
    interpreterPath.includes('/.venv/bin/')
  );
}

export type InstallOutcomeKind = 'ok' | 'nonZeroExit' | 'exitZeroStillMissing';

export interface InstallOutcome { ok: boolean; kind: InstallOutcomeKind }

/**
 * Classify an install attempt. Success requires BOTH exit 0 AND a re-probe
 * showing both packages importable. `undefined` exit (task ended without
 * launching a process) is treated as a non-zero failure.
 */
export function installOutcome(
  exitCode: number | undefined,
  afterProbe: RuntimeProbe
): InstallOutcome {
  if (exitCode !== 0) return { ok: false, kind: 'nonZeroExit' };
  if (afterProbe.ipykernel && afterProbe.jupyterServer) return { ok: true, kind: 'ok' };
  return { ok: false, kind: 'exitZeroStillMissing' };
}

/**
 * A cell succeeded only if no kernel-side error output streamed AND the session
 * is still live (a mid-run kernel death marks the session stale).
 */
export function deriveCellSuccess(args: { sawError: boolean; isStale: boolean }): boolean {
  return !args.sawError && !args.isStale;
}

// Note: installOutcome's InstallOutcomeKind maps to FailureKind here — 'nonZeroExit' -> 'installNonZero', 'exitZeroStillMissing' -> 'installStillMissing'. envSetup.ts performs that mapping.
export type FailureKind =
  | 'noPython'
  | 'noInterpreterPath'
  | 'unknownInterpreter'
  | 'installDeclined'
  | 'installNonZero'
  | 'installStillMissing'
  | 'installTaskError'
  | 'serverStartFailed'
  | 'restartFailed'
  | 'noActiveKernel';

export const FAILURE_KINDS: readonly FailureKind[] = [
  'noPython',
  'noInterpreterPath',
  'unknownInterpreter',
  'installDeclined',
  'installNonZero',
  'installStillMissing',
  'installTaskError',
  'serverStartFailed',
  'restartFailed',
  'noActiveKernel',
];

const MESSAGES: Record<FailureKind, string> = {
  noPython:
    'MyST Notebook: no Python environments found. Install the Python extension and select an interpreter, then try again.',
  noInterpreterPath:
    'MyST Notebook: the selected environment has no interpreter path.',
  unknownInterpreter:
    "MyST Notebook: couldn't determine the interpreter path for the selected environment. Install ipykernel and jupyter-server manually.",
  installDeclined:
    'MyST Notebook: kernel packages were not installed. Run a cell again to retry the install.',
  installNonZero:
    'MyST Notebook: runtime install failed. Check the "MyST Notebook" output channel for details.',
  installStillMissing:
    'MyST Notebook: runtime install completed but ipykernel/jupyter-server are still not importable. Check the "MyST Notebook" output channel.',
  installTaskError:
    'MyST Notebook: runtime install error. Check the "MyST Notebook" output channel for details.',
  serverStartFailed:
    'MyST Notebook: failed to start a Jupyter kernel. See the "MyST Notebook" output for details.',
  restartFailed:
    'MyST Notebook: kernel restart failed. See the "MyST Notebook" output for details.',
  noActiveKernel: 'MyST Notebook: no active kernel.',
};

/** Single source of truth for user-facing failure strings. */
export function messageFor(kind: FailureKind): string {
  return MESSAGES[kind];
}
