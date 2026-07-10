import { describe, it, expect } from 'vitest';
import { splitBlocks, hasOpenConstruct } from './blockSplitter';

describe('splitBlocks — prose and blank lines', () => {
  it('splits two paragraphs separated by a blank line into two prose blocks', () => {
    const text = 'First para.\n\nSecond para.\n';
    const blocks = splitBlocks(text);
    expect(blocks.map((b) => b.kind)).toEqual(['prose', 'prose']);
    expect(blocks[0].text).toBe('First para.');
    expect(blocks[1].text).toBe('Second para.');
  });

  it('keeps a single paragraph as one block', () => {
    const blocks = splitBlocks('Just one line.\n');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('Just one line.');
  });

  it('does NOT split inside a ::: directive that contains a blank line', () => {
    const text = ':::{note}\nLine one.\n\nLine two.\n:::\n';
    const blocks = splitBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('prose');
    expect(blocks[0].text).toBe(':::{note}\nLine one.\n\nLine two.\n:::');
  });

  it('collapses multiple consecutive blank lines into a single split', () => {
    const blocks = splitBlocks('A.\n\n\n\nB.\n');
    expect(blocks.map((b) => b.text)).toEqual(['A.', 'B.']);
  });
});

describe('splitBlocks — edge cases', () => {
  it('returns an empty array for empty input', () => {
    expect(splitBlocks('')).toEqual([]);
  });

  it('keeps an unclosed directive as a single block (trailing newline retained for malformed input)', () => {
    // An unclosed `:::` directive is malformed MyST; inside an open fence a trailing
    // blank line is retained rather than flushed. We lock in this graceful-degradation
    // behavior. Well-formed input is unaffected.
    const text = ':::{note}\nUnterminated.\n';
    const blocks = splitBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe(':::{note}\nUnterminated.\n');
  });
});

describe('splitBlocks — code-cell fences', () => {
  it('captures a {code-cell} fence as one code block with language', () => {
    const text = 'Intro.\n\n```{code-cell} python\nx = 1\n\nprint(x)\n```\n\nDone.\n';
    const blocks = splitBlocks(text);
    expect(blocks.map((b) => b.kind)).toEqual(['prose', 'code', 'prose']);
    expect(blocks[1].text).toBe('```{code-cell} python\nx = 1\n\nprint(x)\n```');
    expect(blocks[1].meta?.language).toBe('python');
  });

  it('does not treat a plain ``` code fence as a code-cell (stays prose, unsplit)', () => {
    const text = '```\nplain block\n\nstill in fence\n```\n';
    const blocks = splitBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('prose');
  });

  it('captures a {code-cell} with no language as language=""', () => {
    const blocks = splitBlocks('```{code-cell}\nx = 1\n```\n');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('code');
    expect(blocks[0].meta?.language).toBe('');
  });

  it('a 4-backtick code-cell is not closed by an inner bare 3-backtick line', () => {
    // The inner ``` is a bare triple-backtick fence on its own line; with a 4-backtick
    // opener it must NOT close the cell. Old logic (close on any 3+ backticks) breaks this.
    const text = '````{code-cell} python\na = 1\n```\nb = 2\n````\n';
    const blocks = splitBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('code');
    expect(blocks[0].text).toBe('````{code-cell} python\na = 1\n```\nb = 2\n````');
    expect(blocks[0].meta?.language).toBe('python');
  });

  it('keeps an unterminated backtick fence as a single block (graceful degradation)', () => {
    const text = '```{code-cell} python\nx = 1\n';
    const blocks = splitBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('code');
  });
});

describe('splitBlocks — $$ display math', () => {
  it('does NOT split a $$ block that contains a blank line', () => {
    const text = '$$\na = 1\n\nb = 2\n$$';
    const blocks = splitBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('prose');
    expect(blocks[0].text).toBe('$$\na = 1\n\nb = 2\n$$');
  });

  it('keeps prose, a $$ block, and trailing prose as three blocks', () => {
    const text = 'Before.\n\n$$\nx^2\n$$\n\nAfter.';
    const blocks = splitBlocks(text);
    expect(blocks.map((b) => b.text)).toEqual(['Before.', '$$\nx^2\n$$', 'After.']);
  });
});

describe('splitBlocks — $$ display math, corner cases', () => {
  it('does NOT split an EMPTY $$ block that wraps a blank line', () => {
    // The exact shape the user hit: `$$\n\n$$` must stay one cell, not shatter.
    const blocks = splitBlocks('$$\n\n$$');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('$$\n\n$$');
  });

  it('SPLITS two separate $$ blocks that are divided by a blank line', () => {
    const blocks = splitBlocks('$$\nx\n$$\n\n$$\ny\n$$');
    expect(blocks.map((b) => b.text)).toEqual(['$$\nx\n$$', '$$\ny\n$$']);
  });

  it('merges two adjacent $$ blocks with NO blank line between them (documented quirk)', () => {
    // `$$` toggles math mode, so a closing `$$` immediately followed by an opening
    // `$$` re-enters math and the two blocks fuse. This is an unusual input (two
    // display-math blocks with no separating blank line); we lock in the behavior.
    const blocks = splitBlocks('$$\nx\n$$\n$$\ny\n$$');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('$$\nx\n$$\n$$\ny\n$$');
  });

  it('treats a single-line $$x$$ as ordinary content, not a protected fence', () => {
    // `$$x$$` is not a bare `$$` fence line, so a following blank line splits normally.
    const blocks = splitBlocks('$$x$$\n\nafter');
    expect(blocks.map((b) => b.text)).toEqual(['$$x$$', 'after']);
  });

  it('treats a $$ fence line with trailing whitespace as a fence', () => {
    const blocks = splitBlocks('$$  \nx\n\ny\n$$  ');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('$$  \nx\n\ny\n$$  ');
  });

  it('keeps an unterminated $$ block as a single block (graceful degradation)', () => {
    const blocks = splitBlocks('$$\na = 1\n\nb = 2\n');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('$$\na = 1\n\nb = 2\n');
  });
});

describe('splitBlocks — construct interactions / precedence', () => {
  it('does not split a $$ block nested inside a ::: directive', () => {
    const text = ':::{note}\n$$\nx\n\ny\n$$\n:::';
    const blocks = splitBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe(text);
  });

  it('does not split a ::: directive nested inside a $$ block', () => {
    const text = '$$\n:::{note}\nx\n\ny\n$$';
    const blocks = splitBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe(text);
  });

  it('does not split $$ lines that live inside a {code-cell} fence', () => {
    const text = '```{code-cell} python\n$$\nx\n\ny\n$$\n```';
    const blocks = splitBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('code');
    expect(blocks[0].text).toBe(text);
  });

  it('does not split backtick-fence lines that live inside a $$ block', () => {
    const text = '$$\n```\nx\n\ny\n```\n$$';
    const blocks = splitBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('prose');
    expect(blocks[0].text).toBe(text);
  });

  it('does not split nested ::: directives of different fence widths', () => {
    const text = '::::{tab-set}\n:::{tab-item}\nx\n\ny\n:::\n::::';
    const blocks = splitBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe(text);
  });

  it('does not treat a directive option line (:class:) as a fence', () => {
    // `:class:` has only one leading colon, so it is body content, not a `:::` fence.
    const text = ':::{note}\n:class: tip\n\nbody\n:::';
    const blocks = splitBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe(text);
  });

  it('splits prose that follows a closed directive', () => {
    const text = ':::{note}\nx\n\ny\n:::\n\nAfter.';
    const blocks = splitBlocks(text);
    expect(blocks.map((b) => b.text)).toEqual([':::{note}\nx\n\ny\n:::', 'After.']);
  });
});

describe('splitBlocks — whitespace handling', () => {
  it('drops leading blank lines', () => {
    expect(splitBlocks('\n\nHello').map((b) => b.text)).toEqual(['Hello']);
  });

  it('drops trailing blank lines', () => {
    expect(splitBlocks('Hello\n\n').map((b) => b.text)).toEqual(['Hello']);
  });

  it('treats a whitespace-only line as a blank-line split', () => {
    expect(splitBlocks('A\n   \nB').map((b) => b.text)).toEqual(['A', 'B']);
  });

  it('returns no blocks for input that is only blank lines', () => {
    expect(splitBlocks('\n\n   \n\n')).toEqual([]);
  });
});

describe('hasOpenConstruct — corner cases', () => {
  it('is true inside an EMPTY unclosed $$ block', () => {
    expect(hasOpenConstruct('$$\n')).toBe(true);
  });

  it('is false for a single-line $$x$$ (never enters math mode)', () => {
    expect(hasOpenConstruct('$$x$$')).toBe(false);
  });

  it('is true when two ::: directives are open (nested)', () => {
    expect(hasOpenConstruct('::::{tab}\n:::{note}\nx')).toBe(true);
  });

  it('is false when nested ::: directives are both closed', () => {
    expect(hasOpenConstruct('::::{tab}\n:::{note}\nx\n:::\n::::')).toBe(false);
  });

  it('is true inside an open backtick fence even when a $$ appears inside it', () => {
    expect(hasOpenConstruct('```\n$$')).toBe(true);
  });

  it('does not let $$ lines inside a code fence toggle math state', () => {
    // The closing ``` ends the code fence; the $$ within it must be inert.
    expect(hasOpenConstruct('```{code-cell} python\n$$\nx\n$$\n```')).toBe(false);
  });

  it('is false for trailing prose after all constructs close', () => {
    expect(hasOpenConstruct(':::{note}\nx\n:::\n\nmore prose')).toBe(false);
  });
});

describe('hasOpenConstruct', () => {
  it('is false for plain prose', () => {
    expect(hasOpenConstruct('Just a sentence.')).toBe(false);
  });

  it('is true inside an unclosed $$ block', () => {
    expect(hasOpenConstruct('$$\na = 1')).toBe(true);
  });

  it('is false after a $$ block is closed', () => {
    expect(hasOpenConstruct('$$\na = 1\n$$')).toBe(false);
  });

  it('is true inside an unclosed ::: directive', () => {
    expect(hasOpenConstruct(':::{note}\nhello')).toBe(true);
  });

  it('is false after a ::: directive is closed', () => {
    expect(hasOpenConstruct(':::{note}\nhello\n:::')).toBe(false);
  });

  it('is true inside an unclosed code fence', () => {
    expect(hasOpenConstruct('```{code-cell} python\nx = 1')).toBe(true);
  });

  it('is false after a code fence is closed', () => {
    expect(hasOpenConstruct('```{code-cell} python\nx = 1\n```')).toBe(false);
  });
});

describe('hasOpenConstruct — Enter-split gate contract', () => {
  // enterSplit.ts checks hasOpenConstruct(textBeforeCursor) as PATH A:
  // if true → plain newline (do NOT split, do NOT create a new cell).
  // This prevents shattering multi-line constructs while the user is still typing them.
  //
  // MUST return true (block the split) for these cases:
  // MUST return false (allow the split) when the construct is complete.

  it('blocks split inside an unclosed $$ math block', () => {
    expect(hasOpenConstruct('$$')).toBe(true);             // just the opener
    expect(hasOpenConstruct('$$\n\\alpha + \\beta')).toBe(true); // mid-content
  });

  it('allows split after a complete $$ block', () => {
    expect(hasOpenConstruct('$$\n\\alpha\n$$')).toBe(false);
    expect(hasOpenConstruct('Some text\n$$\nx\n$$')).toBe(false);
  });

  it('blocks split inside an unclosed ::: directive', () => {
    expect(hasOpenConstruct(':::{note}')).toBe(true);
    expect(hasOpenConstruct(':::{note}\nsome content')).toBe(true);
    expect(hasOpenConstruct('::::{tab-set}\n:::{tab-item}\ncontent')).toBe(true);
  });

  it('allows split after a closed ::: directive', () => {
    expect(hasOpenConstruct(':::{note}\ncontent\n:::')).toBe(false);
    expect(hasOpenConstruct('::::{tab-set}\n:::{tab-item}\nx\n:::\n::::')).toBe(false);
  });

  it('blocks split inside an unclosed backtick fence (plain or code-cell)', () => {
    expect(hasOpenConstruct('```python\nsome code')).toBe(true);
    expect(hasOpenConstruct('```{code-cell} python\nx = 1')).toBe(true);
    expect(hasOpenConstruct('````{code-cell} python\nhas inner ```\nstill open')).toBe(true);
  });

  it('allows split after a closed backtick fence', () => {
    expect(hasOpenConstruct('```python\ncode\n```')).toBe(false);
    expect(hasOpenConstruct('```{code-cell} python\nx = 1\n```')).toBe(false);
  });

  it('allows split for plain prose (no constructs)', () => {
    expect(hasOpenConstruct('Hello world')).toBe(false);
    expect(hasOpenConstruct('# Chapter title')).toBe(false);
    expect(hasOpenConstruct('Inline $x^2$ math is fine')).toBe(false);
  });

  it('allows split for empty text (the fullText.trim() guard fires first anyway)', () => {
    expect(hasOpenConstruct('')).toBe(false);
  });
});
