/**
 * Pure, VS Code-free kernel spec ranking and labeling.
 *
 * This module owns two concerns that belong together: the shared data shape
 * (`KernelSpecInfo`) and the picker ordering logic (`rankKernelSpecs`/`labelFor`).
 * Keeping them VS Code-free lets the full ranking algorithm be unit-tested without
 * an extension host, and makes the shape safe to import from both Option-B
 * (Jupyter extension API) and Option-A (raw REST) backends without coupling.
 *
 * Ranking philosophy
 * ------------------
 * A workspace-local `.venv` is the most project-relevant choice — it matches the
 * environment the project's tooling (pytest, mypy, etc.) already uses.  Conda envs
 * are next because they are project-scoped even if shared.  Everything else is
 * sorted alphabetically so the list is predictable.
 *
 * Within each tier, specs that already have ipykernel installed (hasIpykernel=true)
 * float above ones that need it — we want the friction-free choice at the top, but we
 * never hide kernels that could work after a one-line install.
 */

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/**
 * Normalized kernel spec — a plain data shape with no backend-specific fields.
 * Later tasks (kernelService, kernelResolution, kernelPicker) import this from here
 * so that swapping Option A ↔ Option B only requires changing the producer, not all
 * consumers.
 */
export interface KernelSpecInfo {
  /** Stable spec id returned by the Jupyter kernel spec API. */
  id: string;
  /** Human-readable label from the kernel spec (shown in picker). */
  displayName: string;
  /** Primary language this kernel executes, e.g. 'python'. */
  language: string;
  /**
   * Absolute path to the Python interpreter backing this spec, if the Jupyter
   * backend exposes it.  May be undefined when information is not available
   * (e.g. remote kernels, non-Python kernels).
   */
  interpreterPath?: string;
  /**
   * True when ipykernel is already installed in the interpreter's environment, so
   * the kernel can be started without any extra setup step.
   */
  hasIpykernel: boolean;
}

// ---------------------------------------------------------------------------
// Internal tiering
// ---------------------------------------------------------------------------

/**
 * Tier 0 — workspace-local interpreter.
 *
 * Heuristic: interpreterPath is defined AND starts with `workspaceRoot + "/"`.
 * We require the "/" suffix so that `/home/user/myproject_other` is NOT treated
 * as a child of `/home/user/myproject`.  Any interpreter path strictly under the
 * workspace root qualifies — this covers `.venv`, `venv`, `.env`, and any other
 * project-local environment name.
 */
function isUnderWorkspaceRoot(interpreterPath: string, workspaceRoot: string): boolean {
  // Normalise: ensure workspaceRoot has no trailing slash before appending "/"
  const prefix = workspaceRoot.endsWith('/') ? workspaceRoot : workspaceRoot + '/';
  return interpreterPath.startsWith(prefix);
}

/**
 * Tier 1 — conda environment.
 *
 * Heuristic: interpreterPath contains `/envs/` as a path segment.  This covers
 * the standard conda layout (`<conda-root>/envs/<name>/bin/python`) regardless
 * of whether the conda root is in `/opt`, the user's home, or elsewhere.
 * We do NOT try to detect the conda root itself because that would require
 * probing the filesystem; the `/envs/` segment is reliable enough and keeps
 * the module pure.
 */
function isCondaEnv(interpreterPath: string): boolean {
  return interpreterPath.includes('/envs/');
}

type Tier = 0 | 1 | 2;

function tierOf(spec: KernelSpecInfo, workspaceRoot: string): Tier {
  if (spec.interpreterPath === undefined) {
    return 2; // No path info → treat as "other"
  }
  if (isUnderWorkspaceRoot(spec.interpreterPath, workspaceRoot)) {
    return 0;
  }
  if (isCondaEnv(spec.interpreterPath)) {
    return 1;
  }
  return 2;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return a stable-sorted copy of `specs` ordered by:
 *   1. Tier (0=workspace-venv, 1=conda, 2=other).
 *   2. ipykernel readiness within each tier (ready first).
 *   3. displayName alphabetically within each (tier, readiness) bucket.
 *   4. Original input order for genuine ties (Array.prototype.sort is stable
 *      in V8/Node ≥ 11, and we return 0 for true ties, so order is preserved).
 *
 * Specs with `hasIpykernel === false` are still included — they appear after
 * ready specs within their tier so users can still select them after installing
 * ipykernel.
 *
 * Never mutates the input array.
 */
export function rankKernelSpecs(specs: KernelSpecInfo[], workspaceRoot: string): KernelSpecInfo[] {
  return [...specs].sort((a, b) => {
    const tierA = tierOf(a, workspaceRoot);
    const tierB = tierOf(b, workspaceRoot);

    // 1. Tier
    if (tierA !== tierB) {
      return tierA - tierB;
    }

    // 2. Readiness (ready=true → 0, not-ready=false → 1 so ready comes first)
    const readyA = a.hasIpykernel ? 0 : 1;
    const readyB = b.hasIpykernel ? 0 : 1;
    if (readyA !== readyB) {
      return readyA - readyB;
    }

    // 3. Alphabetical by displayName
    if (a.displayName < b.displayName) return -1;
    if (a.displayName > b.displayName) return 1;

    // 4. Genuine tie — return 0 to preserve stable input order
    return 0;
  });
}

/**
 * Produce a human-friendly label for a kernel spec suitable for a quick-pick item.
 *
 * Format:
 *   "<displayName>  [<filename>]"           — when interpreterPath is known
 *   "<displayName>"                          — when interpreterPath is unknown
 * Either form gains a trailing "  (needs ipykernel)" when !hasIpykernel.
 *
 * The path hint uses only the last path segment (basename equivalent) to keep
 * the label short — the full path would overflow most picker widths.
 */
export function labelFor(spec: KernelSpecInfo): string {
  let label = spec.displayName;

  if (spec.interpreterPath !== undefined) {
    // Derive the last path segment without importing Node's `path` module.
    const basename = spec.interpreterPath.split('/').at(-1) ?? '';
    if (basename) {
      label += `  [${basename}]`;
    }
  }

  if (!spec.hasIpykernel) {
    label += '  (needs ipykernel)';
  }

  return label;
}
