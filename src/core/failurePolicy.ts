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

/** A single install command with its arguments. */
export interface InstallCommand {
  command: string;
  args: string[];
}

/** Cross-platform conda env path pattern: `/envs/<name>/` or `\envs\<name>\`. */
const CONDA_ENV_RE = /[/\\]envs[/\\]([^/\\]+)[/\\]/;

/**
 * Extract a conda env name from an interpreter path. Returns undefined when the
 * path doesn't match a conda env layout (base conda, or non-conda altogether).
 */
function condaEnvName(interpreterPath: string): string | undefined {
  const match = CONDA_ENV_RE.exec(interpreterPath);
  return match?.[1];
}

/**
 * Build the ordered list of install commands to try.
 *
 * The chain encodes the fallback priority:
 *   1. conda install  — if the path looks like a conda env
 *   2. pip install    — always included (<interpreter> -m pip install)
 *   3. uv pip install — last resort; caller bootstraps uv if missing
 *
 * Precondition: pkgs is non-empty (the caller skips install when nothing is missing).
 */
export function buildInstallCommands(
  interpreterPath: string,
  pkgs: string[]
): InstallCommand[] {
  const commands: InstallCommand[] = [];

  const envName = condaEnvName(interpreterPath);
  if (envName) {
    commands.push({
      command: 'conda',
      args: ['install', '-n', envName, '-y', ...pkgs],
    });
  }

  commands.push({
    command: interpreterPath,
    args: ['-m', 'pip', 'install', ...pkgs],
  });

  commands.push({
    command: 'uv',
    args: ['pip', 'install', '--python', interpreterPath, ...pkgs],
  });

  return commands;
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
  | 'installFailed'
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
  'installFailed',
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
  installFailed:
    'MyST Notebook: failed to install ipykernel and jupyter-server. Check the "MyST Notebook" output channel for details.',
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
