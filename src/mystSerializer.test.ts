import { describe, it, expect } from 'vitest';
import { convertColonFencesToBlockquote } from './mystSerializer';

describe('convertColonFencesToBlockquote', () => {
  it('converts a note admonition to a blockquote', () => {
    const input = ':::{note}\nsomething here\n:::\n';
    const result = convertColonFencesToBlockquote(input);
    expect(result).toBe('> **Note:** something here\n');
  });

  it('converts a warning admonition', () => {
    const input = ':::{warning}\nbe careful\n:::\n';
    const result = convertColonFencesToBlockquote(input);
    expect(result).toBe('> **Warning:** be careful\n');
  });

  it('preserves multi-line body content', () => {
    const input = ':::{note}\nline one\nline two\n:::\n';
    const result = convertColonFencesToBlockquote(input);
    expect(result).toBe('> **Note:** line one\n> line two\n');
  });

  it('converts multiple admonitions in one text block', () => {
    const input = ':::{note}\nfirst\n:::\n\n:::{tip}\nsecond\n:::\n';
    const result = convertColonFencesToBlockquote(input);
    expect(result).toContain('> **Note:** first\n');
    expect(result).toContain('> **Tip:** second\n');
  });

  it('does not modify prose that lacks colon fences', () => {
    const input = 'Just some prose text here.\n\nAnd another paragraph.';
    const result = convertColonFencesToBlockquote(input);
    expect(result).toBe(input);
  });

  it('handles unknown directive names gracefully', () => {
    const input = ':::{custom}\nsomething\n:::\n';
    const result = convertColonFencesToBlockquote(input);
    expect(result).toBe('> **custom:** something\n');
  });

  it('preserves blank lines inside the admonition body', () => {
    const input = ':::{note}\npara one\n\npara two\n:::\n';
    const result = convertColonFencesToBlockquote(input);
    expect(result).toBe('> **Note:** para one\n> \n> para two\n');
  });

  it('round-trips correctly: convert then re-parse', () => {
    // After conversion, the blockquote should NOT match the original
    // colon-fence pattern (so serialize can tell it's been converted).
    const original = ':::{note}\nhello\n:::\n';
    const converted = convertColonFencesToBlockquote(original);
    // The converted text does NOT start with :::{ anymore
    expect(converted).not.toMatch(/^:{3,}\{/m);
    // But converting again should be idempotent (blockquotes are not matched)
    const twice = convertColonFencesToBlockquote(converted);
    expect(twice).toBe(converted);
  });
});