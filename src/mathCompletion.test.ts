import { describe, it, expect } from 'vitest';
import { isInsideMathContext } from './mathContextDetector';

describe('isInsideMathContext', () => {
  it('returns true when cursor is after an odd number of $ delimiters', () => {
    // line: "before $x + "   cursor at index 12 (after the space)
    expect(isInsideMathContext('before $x + ', 12)).toBe(true);
  });

  it('returns false when cursor is after a closed inline math span', () => {
    // line: "before $x$ rest"   cursor at index 13 (inside "rest")
    expect(isInsideMathContext('before $x$ rest', 13)).toBe(false);
  });

  it('returns false when no math delimiters present', () => {
    expect(isInsideMathContext('plain prose text', 5)).toBe(false);
  });

  it('returns true inside display math $$', () => {
    // line: "$$E = mc"  cursor at index 7
    expect(isInsideMathContext('$$E = mc', 7)).toBe(true);
  });

  it('returns false at position 0 with no preceding $', () => {
    expect(isInsideMathContext('$alpha', 0)).toBe(false);
  });

  it('returns true immediately after opening $', () => {
    // line: "$"  cursor at index 1
    expect(isInsideMathContext('$', 1)).toBe(true);
  });

  it('ignores escaped \\$', () => {
    // line: "cost is \\$5 and $math"  cursor at 21
    expect(isInsideMathContext('cost is \\$5 and $math', 21)).toBe(true);
  });

  it('handles $$ as two $ chars (each counts)', () => {
    // "$$" followed by content — cursor at index 3: 2 $ seen → even → false for inline counting
    // But $$ is display math and we treat it as "inside" because count >= 1 seen
    // Implementation: count raw unescaped $ left of cursor; odd = inside
    // "$$ x": positions: 0=$, 1=$, 2=space, 3=x — chars 0 and 1 are $
    // count = 2 → even → false? But we ARE inside display math.
    // Resolution: "$$" block: once we see $$, we are inside until we see $$ again.
    // For simplicity the implementation uses raw $ count (2 = even = outside) which is wrong
    // for display math. The smarter approach: count $$ pairs too.
    // This test documents the display math case:
    expect(isInsideMathContext('$$ x + ', 6)).toBe(true);
  });
});
