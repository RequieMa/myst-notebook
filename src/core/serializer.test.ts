import { describe, it, expect } from 'vitest';
import { textToCells, cellsToText, RawCell } from './serializer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('textToCells', () => {
  it('maps prose blocks to markup cells and code-cells to code cells', () => {
    const text = 'Hello.\n\n```{code-cell} python\nx = 1\n```\n';
    const cells = textToCells(text);
    expect(cells).toEqual<RawCell[]>([
      { kind: 'markup', language: 'markdown', value: 'Hello.', metadata: {} },
      {
        kind: 'code',
        language: 'python',
        value: 'x = 1',
        metadata: { myst: { fence: '```{code-cell} python', closeFence: '```' } },
      },
    ]);
  });

  it('defaults missing language to python but the fence is preserved verbatim', () => {
    const cells = textToCells('```{code-cell}\nx = 1\n```\n');
    expect(cells).toHaveLength(1);
    expect(cells[0].kind).toBe('code');
    expect(cells[0].language).toBe('python'); // semantic default
    expect((cells[0].metadata as any).myst.fence).toBe('```{code-cell}'); // true original
    expect((cells[0].metadata as any).myst.closeFence).toBe('```');
  });

  it('handles a single-line unterminated code-cell without duplicating the fence', () => {
    const cells = textToCells('```{code-cell} python\n'); // unterminated, EOF
    expect(cells).toHaveLength(1);
    expect(cells[0].kind).toBe('code');
    expect(cells[0].value).toBe('');
    expect((cells[0].metadata as any).myst.fence).toBe('```{code-cell} python');
    expect((cells[0].metadata as any).myst.closeFence).toBe(''); // no closing fence existed
  });
});

describe('cellsToText round-trip', () => {
  it('rejoins cells into MyST text with one blank line between blocks', () => {
    const text = 'Hello.\n\n```{code-cell} python\nx = 1\n```';
    expect(cellsToText(textToCells(text))).toBe(text);
  });

  it('round-trips the real sample chapter byte-for-byte', () => {
    // Use an in-memory canonical string so live editing of the fixture file
    // during F5 testing does not break this test.
    const canonical = [
      '# Chapter One',
      '',
      'This is an intro paragraph with $a^2 + b^2 = c^2$ inline math.',
      '',
      ':::{note}',
      'An admonition.',
      '',
      'With a blank line inside it.',
      ':::',
      '',
      '```{code-cell} python',
      'import numpy as np',
      '',
      'print(np.pi)',
      '```',
      '',
      'A closing paragraph.',
    ].join('\n');
    expect(cellsToText(textToCells(canonical))).toBe(canonical);
  });

  it('preserves an unknown construct verbatim (passthrough invariant)', () => {
    const text = '::::{unknown-weird-directive}\nwhatever\n::::';
    expect(cellsToText(textToCells(text))).toBe(text);
  });

  it('round-trips a markup-only document', () => {
    const text = '# Title\n\nA paragraph.\n\nAnother one.';
    expect(cellsToText(textToCells(text))).toBe(text);
  });

  it('round-trips two consecutive code cells', () => {
    const text = '```{code-cell} python\na = 1\n```\n\n```{code-cell} python\nb = 2\n```';
    expect(cellsToText(textToCells(text))).toBe(text);
  });

  it('round-trips a code cell with MyST options (tags) verbatim', () => {
    const text = '```{code-cell} python\n:tags: [hide-input]\nx = 1\n```';
    expect(cellsToText(textToCells(text))).toBe(text);
  });

  it('lifts leading directive options out of value into metadata.myst.options', () => {
    const text = '```{code-cell} python\n:tags: [hide-input]\nx = 1\n```';
    const cells = textToCells(text);
    const code = cells.find((c) => c.kind === 'code')!;
    // The :tags: line is a directive option, NOT code — it must not be in value.
    expect(code.value).toBe('x = 1');
    expect((code.metadata as any).myst.options).toEqual([':tags: [hide-input]']);
  });

  it('preserves multiple leading option lines in order and round-trips', () => {
    const text = '```{code-cell} python\n:tags: [hide-input]\n:name: foo\nx = 1\n```';
    const cells = textToCells(text);
    const code = cells.find((c) => c.kind === 'code')!;
    expect(code.value).toBe('x = 1');
    expect((code.metadata as any).myst.options).toEqual([':tags: [hide-input]', ':name: foo']);
    expect(cellsToText(cells)).toBe(text);
  });

  it('keeps an option-like line that is NOT in the leading run inside value', () => {
    const text = '```{code-cell} python\nx = 1\n:not-an-option: y\n```';
    const cells = textToCells(text);
    const code = cells.find((c) => c.kind === 'code')!;
    // The :not-an-option: line follows real code, so it is code, not a directive option.
    expect(code.value).toBe('x = 1\n:not-an-option: y');
    // textToCells omits the options key entirely when there are none — assert it is absent.
    expect((code.metadata as any).myst.options).toBeUndefined();
    expect(cellsToText(cells)).toBe(text);
  });

  it('round-trips an options-only code cell with an empty body byte-for-byte', () => {
    // Covers the empty-value + options branch: the cell has directive options but no code.
    const text = '```{code-cell} python\n:tags: [hide-input]\n```';
    const cells = textToCells(text);
    const code = cells.find((c) => c.kind === 'code')!;
    expect(code.value).toBe('');
    expect((code.metadata as any).myst.options).toEqual([':tags: [hide-input]']);
    expect(cellsToText(cells)).toBe(text);
  });

  it('lifts options so the kernel receives clean code with no directive-option line', () => {
    // Guard-rail for WS1.4: mystController sends cell.document.getText() (== value)
    // to the kernel. A hide-input tag must NOT leak into that code as a `:key:` line.
    const text = '```{code-cell} python\n:tags: [hide-input]\nx = 1\nprint(x)\n```';
    const cells = textToCells(text);
    const code = cells.find((c) => c.kind === 'code')!;
    // No line in the code value may look like a directive option (`:key:` / `:key-name:`).
    expect(code.value.split('\n').some((line) => /^:[\w-]+:/.test(line))).toBe(false);
    expect(code.value).toBe('x = 1\nprint(x)');
  });
});

describe('autoSplit seam — typed code fence round-trips', () => {
  it('a prose+code-fence buffer converts to cells and serializes back identically', () => {
    // Simulates what autoSplit feeds: the full text of an edited cell containing a
    // typed {code-cell} fence. Going through textToCells then cellsToText must be lossless.
    const typed = 'Some intro.\n\n```{code-cell} python\nx = 1\n```';
    const cells = textToCells(typed);
    // The code cell must hold INNER code only (not the fences) — the contract autoSplit relies on.
    const code = cells.find((c) => c.kind === 'code')!;
    expect(code.value).toBe('x = 1');
    expect((code.metadata as any).myst.fence).toBe('```{code-cell} python');
    // And the whole thing round-trips with no doubled fences.
    expect(cellsToText(cells)).toBe(typed);
  });
});

describe('Enter-split decision contract — prevents focus-regression', () => {
  // ─── BACKGROUND (read before editing these tests) ─────────────────────────
  // enterSplit.ts has THREE paths based on cell text at the moment Enter is pressed:
  //
  //   PATH A — guard (insertNewline):
  //     fullText.trim() === '' OR hasOpenConstruct(textBeforeCursor)
  //     → plain newline. No cell operation. No focus change.
  //
  //   PATH B — common path (quitEdit + insertCells, additive):
  //     textToCells(fullText).length === 1
  //     → quitEdit + NotebookEdit.insertCells (additive, does NOT touch focus pointer)
  //       + nbEditor.selection + notebook.cell.edit
  //     → new cell created and focused correctly. ✓
  //
  //   PATH C — edge-case path (replaceCells, best-effort focus):
  //     textToCells(fullText).length > 1
  //     → NotebookEdit.replaceCells — best-effort focus (user may need to click).
  //
  // ─── THE REGRESSION ───────────────────────────────────────────────────────
  // replaceCells resets VS Code's internal focused-cell pointer to cell 0.
  // notebook.cell.edit / notebook.focusNextEditor / showNotebookDocument all
  // read that pointer, NOT nbEditor.selection. So they ALL jump to cell 0.
  //
  // Previous failed fixes (do not re-introduce):
  //   notebook.focusNextEditor      → reads reset pointer → cell 0
  //   showNotebookDocument(selections) → reads reset pointer → cell 0
  //   showTextDocument(cell.document)  → throws; notebook-cell URIs not standalone
  //   notebook.cell.edit after replaceCells → reads reset pointer → cell 0
  //   notebook.insertMarkdownCellBelow  → command does not exist in VS Code
  //
  // The fix is that PATH B never calls replaceCells at all.
  // These tests lock the invariants that keep PATH B valid.
  // ──────────────────────────────────────────────────────────────────────────

  // ── PATH B invariants ─────────────────────────────────────────────────────
  // These assert that textToCells(x).length === 1 for all text a user can type
  // before pressing Enter (no blank lines yet). If any of these start returning
  // length > 1, enterSplit will silently fall through to PATH C (replaceCells),
  // reintroducing the cell-0 regression.

  it('single prose line → 1 cell (normal typing before Enter)', () => {
    expect(textToCells('Hello world').length).toBe(1);
  });

  it('multi-line prose with no blank line → 1 cell', () => {
    // Enter inserts a single \n; the user hasn't pressed Enter twice.
    expect(textToCells('Line one\nLine two\nLine three').length).toBe(1);
  });

  it('heading → 1 cell', () => {
    expect(textToCells('# Chapter One').length).toBe(1);
  });

  it('prose with inline math → 1 cell', () => {
    expect(textToCells('A sentence with $x^2$ math.').length).toBe(1);
  });

  it('prose with a ::: directive on one line (no blank inside) → 1 cell', () => {
    // A directive whose body has no blank lines is one unsplit prose block.
    expect(textToCells(':::{note}\nhello\n:::').length).toBe(1);
  });

  it('a {code-cell} block → 1 cell (of kind code)', () => {
    // A code-cell is produced as a single code cell, not split.
    const cells = textToCells('```{code-cell} python\nx = 1\n```');
    expect(cells.length).toBe(1);
    expect(cells[0].kind).toBe('code');
  });

  // ── PATH C trigger ─────────────────────────────────────────────────────────
  // Only when there IS a blank line (unusual for normal Enter usage) does
  // textToCells return > 1, triggering PATH C. These should be rare in practice.

  it('text with a blank line → >1 cell (triggers replaceCells path)', () => {
    expect(textToCells('Block one.\n\nBlock two.').length).toBe(2);
    expect(textToCells('A.\n\nB.\n\nC.').length).toBe(3);
  });

  // ── PATH A guard (whitespace) ──────────────────────────────────────────────
  // Empty/whitespace triggers the fullText.trim()==='' guard BEFORE textToCells,
  // so textToCells is never reached. Verify it returns 0 — no hidden edge case.

  it('empty input → 0 cells (guard catches it before textToCells reaches PATH B/C)', () => {
    expect(textToCells('').length).toBe(0);
    expect(textToCells('   \n  ').length).toBe(0);
  });
});
