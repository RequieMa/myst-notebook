import { describe, it, expect } from 'vitest';
import { tokenizeMathElements } from './mathTokenizer';

describe('tokenizeMathElements', () => {
  it('splits a compound equation into reusable elements, dropping bare atoms', () => {
    const expr = '\\tilde{\\mathbf{x}} = \\begin{bmatrix} x \\\\ y \\\\ z \\\\ 1 \\end{bmatrix}';
    expect(tokenizeMathElements(expr)).toEqual([
      '\\tilde{\\mathbf{x}}',
      '\\begin{bmatrix} x \\\\ y \\\\ z \\\\ 1 \\end{bmatrix}',
    ]);
  });

  it('drops bare atoms (letters, digits, operators) entirely', () => {
    expect(tokenizeMathElements('a + b = c')).toEqual([]);
  });

  it('collects bare commands', () => {
    expect(tokenizeMathElements('\\alpha + \\beta')).toEqual(['\\alpha', '\\beta']);
  });

  it('keeps a command together with its brace arguments', () => {
    expect(tokenizeMathElements('\\frac{1}{2}')).toEqual(['\\frac{1}{2}']);
  });

  it('keeps nested braces as a single element', () => {
    expect(tokenizeMathElements('\\sqrt{\\alpha}')).toEqual(['\\sqrt{\\alpha}']);
  });

  it('does not treat inner commands as separate tokens', () => {
    // \\mathbf{x} lives inside \\tilde{...}; only the outer element is collected
    expect(tokenizeMathElements('\\tilde{\\mathbf{x}}')).toEqual(['\\tilde{\\mathbf{x}}']);
  });

  it('ignores row separators (\\\\) and spacing macros', () => {
    expect(tokenizeMathElements('x \\\\ y')).toEqual([]);
    expect(tokenizeMathElements('a \\, b \\; c')).toEqual([]);
  });

  it('captures a whole environment even with internal row breaks', () => {
    expect(tokenizeMathElements('\\begin{cases} a \\\\ b \\end{cases}')).toEqual([
      '\\begin{cases} a \\\\ b \\end{cases}',
    ]);
  });

  it('handles nested environments as one outer element', () => {
    const expr = '\\begin{matrix} \\begin{matrix} a \\end{matrix} \\end{matrix}';
    expect(tokenizeMathElements(expr)).toEqual([expr]);
  });

  it('returns empty array for empty input', () => {
    expect(tokenizeMathElements('')).toEqual([]);
  });

  it('collects multiple sequential commands with args', () => {
    expect(tokenizeMathElements('\\hat{a} \\vec{b}')).toEqual(['\\hat{a}', '\\vec{b}']);
  });
});
