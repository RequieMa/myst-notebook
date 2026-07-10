import { describe, it, expect } from 'vitest';
import { rankKernelSpecs, labelFor } from './kernelRanking';
import type { KernelSpecInfo } from './kernelRanking';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function spec(overrides: Partial<KernelSpecInfo> & Pick<KernelSpecInfo, 'id'>): KernelSpecInfo {
  return {
    displayName: overrides.id,
    language: 'python',
    hasIpykernel: true,
    ...overrides,
  };
}

const WORKSPACE = '/home/user/myproject';

// ---------------------------------------------------------------------------
// rankKernelSpecs — tier ordering
// ---------------------------------------------------------------------------

describe('rankKernelSpecs — tier ordering', () => {
  it('places a .venv interpreter under workspaceRoot in tier 0 (first)', () => {
    const venv = spec({ id: 'venv', interpreterPath: `${WORKSPACE}/.venv/bin/python` });
    const other = spec({ id: 'other', interpreterPath: '/usr/bin/python3' });
    const ranked = rankKernelSpecs([other, venv], WORKSPACE);
    expect(ranked[0].id).toBe('venv');
    expect(ranked[1].id).toBe('other');
  });

  it('places a conda env (path contains /envs/) in tier 1, after venv, before other', () => {
    const conda = spec({ id: 'conda', interpreterPath: '/opt/miniconda3/envs/myenv/bin/python' });
    const other = spec({ id: 'other', interpreterPath: '/usr/bin/python3' });
    const venv = spec({ id: 'venv', interpreterPath: `${WORKSPACE}/.venv/bin/python` });
    const ranked = rankKernelSpecs([other, conda, venv], WORKSPACE);
    expect(ranked[0].id).toBe('venv');
    expect(ranked[1].id).toBe('conda');
    expect(ranked[2].id).toBe('other');
  });

  it('places a conda env (interpreterPath under conda prefix via /conda/) in tier 1, before other', () => {
    // Some conda installations use a path like /home/user/miniconda3/envs/...
    // or paths containing 'conda' as a segment before /envs/ — the /envs/ substring
    // is the most reliable heuristic; this test confirms that by checking relative ordering.
    const conda = spec({ id: 'conda', interpreterPath: '/home/user/miniconda3/envs/ds/bin/python' });
    const other = spec({ id: 'other', interpreterPath: '/usr/bin/python3' });
    const ranked = rankKernelSpecs([other, conda], WORKSPACE);
    expect(ranked[0].id).toBe('conda');
    expect(ranked[1].id).toBe('other');
  });

  it('all three tiers: venv (tier 0) → conda (tier 1) → other (tier 2)', () => {
    const venv = spec({ id: 'venv', interpreterPath: `${WORKSPACE}/.venv/bin/python` });
    const conda = spec({ id: 'conda', interpreterPath: '/opt/conda/envs/base/bin/python' });
    const other = spec({ id: 'other' });
    const ranked = rankKernelSpecs([other, conda, venv], WORKSPACE);
    expect(ranked.map(s => s.id)).toEqual(['venv', 'conda', 'other']);
  });

  it('within tier 2 (other), sorts stably by displayName', () => {
    const b = spec({ id: 'b', displayName: 'Beta Kernel' });
    const a = spec({ id: 'a', displayName: 'Alpha Kernel' });
    const c = spec({ id: 'c', displayName: 'Gamma Kernel' });
    const ranked = rankKernelSpecs([b, a, c], WORKSPACE);
    expect(ranked.map(s => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('within tier 1 (conda), sorts stably by displayName', () => {
    const z = spec({ id: 'z', displayName: 'Z env', interpreterPath: '/opt/conda/envs/z/bin/python' });
    const a = spec({ id: 'a', displayName: 'A env', interpreterPath: '/opt/conda/envs/a/bin/python' });
    const ranked = rankKernelSpecs([z, a], WORKSPACE);
    expect(ranked.map(s => s.id)).toEqual(['a', 'z']);
  });
});

// ---------------------------------------------------------------------------
// rankKernelSpecs — hasIpykernel readiness ordering within tiers
// ---------------------------------------------------------------------------

describe('rankKernelSpecs — ipykernel readiness within tiers', () => {
  it('ready specs sort before not-ready ones within the same tier', () => {
    const notReady = spec({ id: 'notReady', hasIpykernel: false });
    const ready = spec({ id: 'ready', hasIpykernel: true });
    const ranked = rankKernelSpecs([notReady, ready], WORKSPACE);
    expect(ranked[0].id).toBe('ready');
    expect(ranked[1].id).toBe('notReady');
  });

  it('not-ready venv still outranks a ready conda (tier beats readiness)', () => {
    const venvNotReady = spec({
      id: 'venvNotReady',
      hasIpykernel: false,
      interpreterPath: `${WORKSPACE}/.venv/bin/python`,
    });
    const condaReady = spec({
      id: 'condaReady',
      hasIpykernel: true,
      interpreterPath: '/opt/conda/envs/myenv/bin/python',
    });
    const ranked = rankKernelSpecs([condaReady, venvNotReady], WORKSPACE);
    expect(ranked[0].id).toBe('venvNotReady');
    expect(ranked[1].id).toBe('condaReady');
  });

  it('within same tier and same readiness, preserves stable input order for same displayName', () => {
    const first = spec({ id: 'first', displayName: 'Same Name' });
    const second = spec({ id: 'second', displayName: 'Same Name' });
    const ranked = rankKernelSpecs([first, second], WORKSPACE);
    expect(ranked[0].id).toBe('first');
    expect(ranked[1].id).toBe('second');
  });
});

// ---------------------------------------------------------------------------
// rankKernelSpecs — graceful degradation
// ---------------------------------------------------------------------------

describe('rankKernelSpecs — graceful degradation', () => {
  it('specs with undefined interpreterPath do not throw and land in tier 2 (other)', () => {
    const noPath = spec({ id: 'noPath' }); // interpreterPath omitted by fixture default
    expect(() => rankKernelSpecs([noPath], WORKSPACE)).not.toThrow();
    const ranked = rankKernelSpecs([noPath], WORKSPACE);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe('noPath');
  });

  it('spec with undefined interpreterPath lands after a venv spec', () => {
    const noPath = spec({ id: 'noPath' });
    const venv = spec({ id: 'venv', interpreterPath: `${WORKSPACE}/.venv/bin/python` });
    const ranked = rankKernelSpecs([noPath, venv], WORKSPACE);
    expect(ranked[0].id).toBe('venv');
    expect(ranked[1].id).toBe('noPath');
  });

  it('empty input returns empty output without throwing', () => {
    expect(rankKernelSpecs([], WORKSPACE)).toEqual([]);
  });

  it('single spec returns unchanged without throwing', () => {
    const s = spec({ id: 'solo' });
    expect(rankKernelSpecs([s], WORKSPACE)).toEqual([s]);
  });
});

// ---------------------------------------------------------------------------
// rankKernelSpecs — workspaceRoot boundary (venv detection)
// ---------------------------------------------------------------------------

describe('rankKernelSpecs — venv-in-workspace boundary cases', () => {
  it('interpreter exactly matching workspaceRoot prefix is treated as workspace-local (before other)', () => {
    // e.g. a .venv folder at the root — assert it beats a non-workspace-local spec
    const venv = spec({ id: 'venv', interpreterPath: `${WORKSPACE}/.venv/bin/python` });
    const other = spec({ id: 'other', interpreterPath: '/usr/bin/python3' });
    const ranked = rankKernelSpecs([other, venv], WORKSPACE);
    expect(ranked[0].id).toBe('venv');
    expect(ranked[1].id).toBe('other');
  });

  it('interpreter NOT under workspaceRoot is NOT treated as workspace-local (ranks after real workspace-local spec)', () => {
    const notVenv = spec({
      id: 'notVenv',
      interpreterPath: '/home/other/project/.venv/bin/python',
    });
    const venv = spec({ id: 'venv', interpreterPath: `${WORKSPACE}/.venv/bin/python` });
    const ranked = rankKernelSpecs([notVenv, venv], WORKSPACE);
    expect(ranked[0].id).toBe('venv');
    expect(ranked[1].id).toBe('notVenv');
  });

  it('interpreter path that merely contains workspaceRoot as a substring but is not under it does not qualify as venv tier', () => {
    // /home/user/myproject_other is NOT under /home/user/myproject
    const tricky = spec({
      id: 'tricky',
      interpreterPath: `${WORKSPACE}_other/.venv/bin/python`,
    });
    const venv = spec({ id: 'venv', interpreterPath: `${WORKSPACE}/.venv/bin/python` });
    const ranked = rankKernelSpecs([tricky, venv], WORKSPACE);
    // tricky is not under workspaceRoot so it's tier 2; venv is tier 0
    expect(ranked[0].id).toBe('venv');
    expect(ranked[1].id).toBe('tricky');
  });
});

// ---------------------------------------------------------------------------
// labelFor — friendly display string
// ---------------------------------------------------------------------------

describe('labelFor — friendly display string', () => {
  it('ready spec: shows displayName and a path hint', () => {
    const s = spec({ id: 'py3', displayName: 'Python 3', interpreterPath: '/usr/bin/python3' });
    const label = labelFor(s);
    expect(label).toContain('Python 3');
    expect(label).toContain('python3'); // short path hint
    expect(label).not.toContain('needs ipykernel');
  });

  it('not-ready spec: appends "(needs ipykernel)" suffix', () => {
    const s = spec({ id: 'py3', displayName: 'Python 3', hasIpykernel: false });
    const label = labelFor(s);
    expect(label).toContain('Python 3');
    expect(label).toContain('(needs ipykernel)');
  });

  it('spec with no interpreterPath: shows displayName without a path hint, no throw', () => {
    const s = spec({ id: 'nopath', displayName: 'My Kernel' });
    expect(() => labelFor(s)).not.toThrow();
    const label = labelFor(s);
    expect(label).toContain('My Kernel');
  });

  it('spec with no interpreterPath and not-ready: still appends suffix', () => {
    const s = spec({ id: 'nopath', displayName: 'My Kernel', hasIpykernel: false });
    const label = labelFor(s);
    expect(label).toContain('My Kernel');
    expect(label).toContain('(needs ipykernel)');
  });

  it('path hint is a basename-style shortening (last path segment or filename)', () => {
    const s = spec({
      id: 'py',
      displayName: 'Python 3.11',
      interpreterPath: '/home/user/.venv/bin/python3.11',
    });
    const label = labelFor(s);
    // Should show the filename component as a hint, not the full path
    expect(label).toContain('python3.11');
    expect(label).not.toContain('/home/user/.venv/bin/python3.11');
  });
});
