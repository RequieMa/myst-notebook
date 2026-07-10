import { describe, it, expect } from 'vitest';
import {
  runLinter,
  lintCellText,
  extractMathBlocks,
  DEFAULT_RULES,
  type LintRule,
} from './mathLinter';

describe('runLinter — pluggability', () => {
  it('applies rules in order and chains results', () => {
    const rules: LintRule[] = [
      { name: 'addA', apply: s => s + 'A' },
      { name: 'addB', apply: s => s + 'B' },
    ];
    expect(runLinter('x', rules)).toBe('xAB');
  });

  it('returns input unchanged when rules array is empty', () => {
    expect(runLinter('\\mathbf R', [])).toBe('\\mathbf R');
  });
});

describe('DEFAULT_RULES — braceSingleArgMacro', () => {
  it('braces a single uppercase letter after \\mathbf', () => {
    expect(runLinter('\\mathbf R', DEFAULT_RULES)).toContain('\\mathbf{R}');
  });

  it('braces a single lowercase letter after \\mathit', () => {
    expect(runLinter('\\mathit x', DEFAULT_RULES)).toContain('\\mathit{x}');
  });

  it('does not double-brace \\mathbf{R} that is already correct', () => {
    expect(runLinter('\\mathbf{R}', DEFAULT_RULES)).toBe('\\mathbf{R}');
  });

  it('braces \\text followed by a single word', () => {
    expect(runLinter('\\text hello', DEFAULT_RULES)).toContain('\\text{hello}');
  });
});

describe('DEFAULT_RULES — spaceBinaryOp', () => {
  it('adds spaces around \\times when missing', () => {
    expect(runLinter('3\\times3', DEFAULT_RULES)).toContain('3 \\times 3');
  });

  it('does not double-space \\times that already has spaces', () => {
    expect(runLinter('3 \\times 3', DEFAULT_RULES)).toBe('3 \\times 3');
  });

  it('adds spaces around \\cdot', () => {
    expect(runLinter('a\\cdot b', DEFAULT_RULES)).toContain('a \\cdot b');
  });

  it('adds spaces around \\pm', () => {
    expect(runLinter('x\\pm y', DEFAULT_RULES)).toContain('x \\pm y');
  });

  it('does not strip surrounding newlines in display math content', () => {
    expect(runLinter('\n\\frac12\n\\times 3\n', DEFAULT_RULES)).toMatch(/^\n/);
  });

  it('does not corrupt \\cdots (operator name is a prefix of a longer macro)', () => {
    expect(runLinter('a_1 \\cdots a_n', DEFAULT_RULES)).toContain('\\cdots');
    expect(runLinter('a_1 \\cdots a_n', DEFAULT_RULES)).not.toContain('\\cdot ');
  });

  it('does not corrupt \\times inside a longer name-like sequence', () => {
    // \\div must not match inside \\divideontimes
    expect(runLinter('a \\divideontimes b', DEFAULT_RULES)).toContain('\\divideontimes');
  });
});

describe('DEFAULT_RULES — braceFrac', () => {
  it('braces single-digit numerator and denominator of \\frac', () => {
    expect(runLinter('\\frac12', DEFAULT_RULES)).toContain('\\frac{1}{2}');
  });

  it('does not modify \\frac{a}{b} that is already correct', () => {
    expect(runLinter('\\frac{a}{b}', DEFAULT_RULES)).toBe('\\frac{a}{b}');
  });

  it('braces \\frac inside LaTeX grouping', () => {
    expect(runLinter('{\\frac12}', DEFAULT_RULES)).toContain('\\frac{1}{2}');
  });
});

describe('lintCellText — math extraction', () => {
  it('lints content inside $...$ but not surrounding prose', () => {
    const text = 'The matrix $\\mathbf R_{3\\times3}$ is square.';
    const result = lintCellText(text, DEFAULT_RULES);
    expect(result).toContain('\\mathbf{R}');
    expect(result).toContain('3 \\times 3');
    expect(result).toContain('The matrix');
    expect(result).toContain('is square.');
  });

  it('lints content inside $$...$$ blocks', () => {
    const text = '$$\n\\frac12\n$$';
    const result = lintCellText(text, DEFAULT_RULES);
    expect(result).toContain('\\frac{1}{2}');
  });

  it('does not modify prose outside math delimiters', () => {
    const text = 'Use \\mathbf outside math — unchanged.';
    expect(lintCellText(text, DEFAULT_RULES)).toBe(text);
  });

  it('returns the original string unchanged when no rules match', () => {
    const text = '$x + y$';
    expect(lintCellText(text, DEFAULT_RULES)).toBe(text);
  });
});

describe('extractMathBlocks', () => {
  it('extracts inner content of inline $...$ math', () => {
    expect(extractMathBlocks('prose $x + y$ more')).toEqual(['x + y']);
  });

  it('extracts inner content of display $$...$$ math, trimmed', () => {
    expect(extractMathBlocks('$$\n\\frac12\n$$')).toEqual(['\\frac12']);
  });

  it('extracts multiple blocks in document order', () => {
    expect(extractMathBlocks('$a$ and $$b$$ and $c$')).toEqual(['a', 'b', 'c']);
  });

  it('omits empty/whitespace-only blocks', () => {
    expect(extractMathBlocks('$$   $$ and $x$')).toEqual(['x']);
  });

  it('returns an empty array when there is no math', () => {
    expect(extractMathBlocks('just prose, no math here')).toEqual([]);
  });
});
