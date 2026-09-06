import { describe, it, expect } from 'vitest';
import { buildCustomCompletionEntries } from './mathCompletionItems';

const builtIn = new Set(['\\alpha', '\\beta']);

describe('buildCustomCompletionEntries', () => {
  it('includes custom symbols with positive count', () => {
    const counts: Record<string, number> = { '\\frac{a}{b}': 3 };
    const entries = buildCustomCompletionEntries(['\\frac{a}{b}'], builtIn, (l) => counts[l] ?? 0);
    expect(entries).toHaveLength(1);
    expect(entries[0].latex).toBe('\\frac{a}{b}');
    expect(entries[0].count).toBe(3);
  });

  it('excludes built-in symbols', () => {
    const counts: Record<string, number> = { '\\alpha': 5 };
    const entries = buildCustomCompletionEntries(['\\alpha'], builtIn, (l) => counts[l] ?? 0);
    expect(entries).toHaveLength(0);
  });

  it('excludes zero-count (markSeen) symbols', () => {
    const counts: Record<string, number> = { '\\colon': 0 };
    const entries = buildCustomCompletionEntries(['\\colon'], builtIn, (l) => counts[l] ?? 0);
    expect(entries).toHaveLength(0);
  });

  it('sorts by count descending', () => {
    const counts: Record<string, number> = { '\\a': 1, '\\b': 5, '\\c': 3 };
    const entries = buildCustomCompletionEntries(['\\a', '\\b', '\\c'], builtIn, (l) => counts[l] ?? 0);
    expect(entries.map(e => e.latex)).toEqual(['\\b', '\\c', '\\a']);
  });

  it('emits tier-0 sortText (used-symbol tier)', () => {
    const counts: Record<string, number> = { '\\a': 1 };
    const entries = buildCustomCompletionEntries(['\\a'], builtIn, (l) => counts[l] ?? 0);
    expect(entries[0].sortText).toMatch(/^0_/);
  });

  it('higher count gets earlier sortText', () => {
    const counts: Record<string, number> = { '\\a': 1, '\\b': 100 };
    const entries = buildCustomCompletionEntries(['\\a', '\\b'], builtIn, (l) => counts[l] ?? 0);
    const byLatex = Object.fromEntries(entries.map(e => [e.latex, e.sortText]));
    expect(byLatex['\\b'] < byLatex['\\a']).toBe(true);
  });
});
