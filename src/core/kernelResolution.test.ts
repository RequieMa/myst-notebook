import { describe, it, expect } from 'vitest';
import { resolveKernel } from './kernelResolution';
import type { KernelSpecInfo } from './kernelRanking';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VENV: KernelSpecInfo = {
  id: 'python-venv',
  displayName: 'Python (.venv)',
  language: 'python',
  interpreterPath: '/home/user/project/.venv/bin/python',
  hasIpykernel: true,
};

const CONDA: KernelSpecInfo = {
  id: 'python-conda',
  displayName: 'Python (conda)',
  language: 'python',
  interpreterPath: '/opt/conda/envs/myenv/bin/python',
  hasIpykernel: false,
};

const SYSTEM: KernelSpecInfo = {
  id: 'python-system',
  displayName: 'Python (system)',
  language: 'python',
  interpreterPath: '/usr/bin/python3',
  hasIpykernel: true,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveKernel', () => {
  // Bullet 1: default id present AND still in availableSpecs AND hasIpykernel → use
  it('returns { kind: "use", specId } when default id is present and hasIpykernel is true', () => {
    const result = resolveKernel({
      workspaceDefaultId: 'python-venv',
      availableSpecs: [VENV, CONDA, SYSTEM],
    });
    expect(result).toEqual({ kind: 'use', specId: 'python-venv' });
  });

  // Bullet 1 — also verify the specId is correctly forwarded for a different spec
  it('carries the correct specId on a "use" result when the default is the system spec', () => {
    const result = resolveKernel({
      workspaceDefaultId: 'python-system',
      availableSpecs: [VENV, SYSTEM],
    });
    expect(result).toEqual({ kind: 'use', specId: 'python-system' });
  });

  // Bullet 2: default id present, spec found, but hasIpykernel === false → needsIpykernel
  it('returns { kind: "needsIpykernel", specId } when default is present but lacks ipykernel', () => {
    const result = resolveKernel({
      workspaceDefaultId: 'python-conda',
      availableSpecs: [VENV, CONDA],
    });
    expect(result).toEqual({ kind: 'needsIpykernel', specId: 'python-conda' });
  });

  // Bullet 2 — verify the specId is correctly forwarded on needsIpykernel
  it('carries the correct specId on a "needsIpykernel" result', () => {
    const noIpy: KernelSpecInfo = { id: 'special', displayName: 'Special', language: 'python', hasIpykernel: false };
    const result = resolveKernel({
      workspaceDefaultId: 'special',
      availableSpecs: [noIpy],
    });
    expect(result).toEqual({ kind: 'needsIpykernel', specId: 'special' });
  });

  // Bullet 3: default id present but NOT in availableSpecs → pick with reason 'default-missing'
  it('returns { kind: "pick", reason: "default-missing" } when default id is absent from availableSpecs', () => {
    const result = resolveKernel({
      workspaceDefaultId: 'python-deleted',
      availableSpecs: [VENV, SYSTEM],
    });
    expect(result).toEqual({ kind: 'pick', reason: 'default-missing' });
  });

  // Bullet 4: no default id → pick with reason 'no-default'
  it('returns { kind: "pick", reason: "no-default" } when workspaceDefaultId is undefined', () => {
    const result = resolveKernel({
      workspaceDefaultId: undefined,
      availableSpecs: [VENV, CONDA, SYSTEM],
    });
    expect(result).toEqual({ kind: 'pick', reason: 'no-default' });
  });

  // Bullet 5: availableSpecs empty → none
  it('returns { kind: "none" } when availableSpecs is empty and there is no default', () => {
    const result = resolveKernel({
      workspaceDefaultId: undefined,
      availableSpecs: [],
    });
    expect(result).toEqual({ kind: 'none' });
  });

  // Empty + stale default pin: empty specs always wins over everything
  it('returns { kind: "none" } when availableSpecs is empty even if a stale default id is provided', () => {
    const result = resolveKernel({
      workspaceDefaultId: 'python-venv',
      availableSpecs: [],
    });
    expect(result).toEqual({ kind: 'none' });
  });
});
