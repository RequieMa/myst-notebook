import { describe, it, expect } from 'vitest';
import { buildMathQuickPickSections } from './mathQuickPickItems';
import type { MathSymbol } from '../mathSymbols';

const builtInSymbols: MathSymbol[] = [
  { latex: '\\alpha', description: 'alpha', unicode: 'α' },
  { latex: '\\beta', description: 'beta', unicode: 'β' },
];
const getSymbol = (latex: string): MathSymbol | undefined =>
  builtInSymbols.find((s) => s.latex === latex);

function build(overrides: Partial<Parameters<typeof buildMathQuickPickSections>[0]> = {}) {
  return buildMathQuickPickSections({
    stored: [],
    recent: [],
    getSymbol,
    builtInSymbols,
    getCount: () => 0,
    ...overrides,
  });
}

describe('buildMathQuickPickSections', () => {
  it('includes custom saved symbols in a "Saved symbols" section even when outside recency', () => {
    const sections = build({
      stored: ['\\mathbb{R}'],
      recent: [],
      getCount: (l) => ({ '\\mathbb{R}': 2 })[l] ?? 0,
    });

    const saved = sections.find((s) => s.title === 'Saved symbols');
    expect(saved).toBeDefined();
    expect(saved!.items.map((i) => i.latex)).toContain('\\mathbb{R}');
  });

  it('labels custom saved symbols with "saved"', () => {
    const sections = build({
      stored: ['\\mathbb{R}'],
      recent: [],
      getCount: (l) => ({ '\\mathbb{R}': 2 })[l] ?? 0,
    });

    const saved = sections.find((s) => s.title === 'Saved symbols')!;
    expect(saved.items.find((i) => i.latex === '\\mathbb{R}')!.description).toBe('saved');
  });

  it('does not duplicate a custom symbol that is already in the recent section', () => {
    const sections = build({
      stored: ['\\mathbb{R}'],
      recent: ['\\mathbb{R}'],
      getCount: (l) => ({ '\\mathbb{R}': 2 })[l] ?? 0,
    });

    const recent = sections.find((s) => s.title === 'Recently used')!;
    expect(recent.items.map((i) => i.latex)).toContain('\\mathbb{R}');
    expect(sections.find((s) => s.title === 'Saved symbols')).toBeUndefined();
  });

  it('excludes zero-count (markSeen) custom symbols from the saved section', () => {
    const sections = build({
      stored: ['\\mathbf{R}'],
      recent: [],
      getCount: () => 0,
    });

    expect(sections.find((s) => s.title === 'Saved symbols')).toBeUndefined();
  });

  it('lists remaining built-in symbols under "All symbols", excluding recent', () => {
    const sections = build({
      stored: [],
      recent: ['\\alpha'],
    });

    const all = sections.find((s) => s.title === 'All symbols')!;
    expect(all.items.map((i) => i.latex)).toEqual(['\\beta']);
  });

  it('describes recent built-in symbols with unicode and recent custom symbols as saved', () => {
    const sections = build({
      stored: ['\\mathbb{R}'],
      recent: ['\\alpha', '\\mathbb{R}'],
      getCount: (l) => ({ '\\mathbb{R}': 1 })[l] ?? 0,
    });

    const recent = sections.find((s) => s.title === 'Recently used')!;
    const alpha = recent.items.find((i) => i.latex === '\\alpha')!;
    const custom = recent.items.find((i) => i.latex === '\\mathbb{R}')!;
    expect(alpha.description).toContain('α');
    expect(custom.description).toBe('saved');
  });

  it('omits empty sections', () => {
    const sections = build({ stored: [], recent: [], builtInSymbols: [] });
    expect(sections).toEqual([]);
  });
});
