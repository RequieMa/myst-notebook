import type { KernelSpecInfo } from './kernelRanking';

/**
 * Pure, VS Code-free kernel resolve-order decision.
 *
 * The controller (Task 5) calls `resolveKernel` before touching any VS Code API.
 * It receives a discriminated union that drives a single exhaustive `switch` with
 * no ambiguous cases — no "if we have a kernel AND no default THEN…" scattered
 * across controller code.
 *
 * Precedence (evaluated top to bottom):
 *
 *   1. No available specs at all → `none`.
 *      There is nothing to use or pick from; the controller should surface
 *      "no environments found" guidance regardless of any stored default.
 *
 *   2. A workspace default id is stored AND it resolves to a spec:
 *      a. `hasIpykernel === true`  → `use`           (start immediately)
 *      b. `hasIpykernel === false` → `needsIpykernel` (offer one-click install)
 *
 *   3. A workspace default id is stored but the spec is no longer present
 *      (removed env, renamed kernel) → `pick` with reason `'default-missing'`.
 *
 *   4. No workspace default id → `pick` with reason `'no-default'`.
 *
 * Keeping this function pure lets the full branching logic be unit-tested without
 * an extension host, and makes it trivial to replay recorded scenarios in tests.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The default id exists, the spec is present, and ipykernel is already installed. */
export interface KernelResolutionUse {
  kind: 'use';
  specId: string;
}

/**
 * The default id exists, the spec is present, but ipykernel needs to be
 * installed before the kernel can start.
 */
export interface KernelResolutionNeedsIpykernel {
  kind: 'needsIpykernel';
  specId: string;
}

/**
 * The caller must show a kernel picker.
 *
 * - `'default-missing'`: a stored default was found but its spec no longer exists
 *   (environment removed, spec renamed, etc.).
 * - `'no-default'`: no default has been saved yet for this workspace.
 */
export interface KernelResolutionPick {
  kind: 'pick';
  reason: 'default-missing' | 'no-default';
}

/** No kernel specs are available at all; the controller should surface guidance. */
export interface KernelResolutionNone {
  kind: 'none';
}

/** Discriminated union over all resolution outcomes. */
export type KernelResolution =
  | KernelResolutionUse
  | KernelResolutionNeedsIpykernel
  | KernelResolutionPick
  | KernelResolutionNone;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ResolveKernelInput {
  /** Stored workspace default kernel spec id, or undefined if none has been saved. */
  workspaceDefaultId: string | undefined;
  /** All currently available kernel specs from the Jupyter backend. */
  availableSpecs: KernelSpecInfo[];
}

// ---------------------------------------------------------------------------
// Decision function
// ---------------------------------------------------------------------------

/**
 * Decide how to resolve a kernel without touching any VS Code API.
 *
 * See the module-level doc comment for the full precedence rules.
 */
export function resolveKernel(input: ResolveKernelInput): KernelResolution {
  const { workspaceDefaultId, availableSpecs } = input;

  // Precedence 1: nothing to use or pick from.
  if (availableSpecs.length === 0) {
    return { kind: 'none' };
  }

  // Precedence 2 & 3: a default id is stored — try to find its spec.
  if (workspaceDefaultId !== undefined) {
    const spec = availableSpecs.find((s) => s.id === workspaceDefaultId);

    if (spec !== undefined) {
      // Precedence 2a / 2b: spec found — branch on ipykernel readiness.
      return spec.hasIpykernel
        ? { kind: 'use', specId: spec.id }
        : { kind: 'needsIpykernel', specId: spec.id };
    }

    // Precedence 3: default id stored but spec is gone.
    return { kind: 'pick', reason: 'default-missing' };
  }

  // Precedence 4: no default id at all.
  return { kind: 'pick', reason: 'no-default' };
}
