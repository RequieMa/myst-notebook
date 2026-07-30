import { describe, it, expect } from 'vitest';
import { MATH_SYMBOLS, MathSymbol } from './mathSymbols';

describe('MATH_SYMBOLS', () => {
  it('has no duplicate latex values', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const sym of MATH_SYMBOLS) {
      if (seen.has(sym.latex)) {
        dupes.push(sym.latex);
      }
      seen.add(sym.latex);
    }
    expect(dupes).toEqual([]);
  });

  it('every symbol has non-empty latex and description', () => {
    for (const sym of MATH_SYMBOLS) {
      expect(sym.latex).toBeTruthy();
      expect(sym.latex.startsWith('\\') || sym.latex.startsWith('{') || sym.latex.startsWith('\\!') || sym.latex.startsWith('\\,') || sym.latex.startsWith('\\:') || sym.latex.startsWith('\\;') || sym.latex.startsWith('\\quad') || sym.latex.startsWith('\\qquad'), `"${sym.latex}" should start with \\ or {`).toBe(true);
      expect(sym.description).toBeTruthy();
    }
  });

  it('all snippet symbols have matching $1 placeholder', () => {
    for (const sym of MATH_SYMBOLS) {
      if (sym.snippet) {
        expect(
          sym.snippet.includes('$1'),
          `Snippet for "${sym.latex}" must contain $1`
        ).toBe(true);
      }
    }
  });

  it('all snippet symbols have consecutive $N placeholders (no gaps)', () => {
    for (const sym of MATH_SYMBOLS) {
      if (sym.snippet) {
        const placeholders = sym.snippet.match(/\$(\d+)/g) ?? [];
        const nums = placeholders.map(p => parseInt(p.slice(1), 10)).sort((a, b) => a - b);
        expect(nums[0]).toBe(1); // must start at $1
        for (let i = 1; i < nums.length; i++) {
          expect(nums[i]).toBe(nums[i - 1] + 1); // no gaps
        }
      }
    }
  });

  it('has at least 400 symbols (expanded from original 113)', () => {
    expect(MATH_SYMBOLS.length).toBeGreaterThanOrEqual(400);
  });
});
