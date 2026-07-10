import { splitBlocks } from './blockSplitter';

export interface RawCell {
  kind: 'markup' | 'code';
  language: string;
  value: string;
  metadata: Record<string, unknown>;
}

/** A leading `:key: ...` directive-option line (MyST metadata, not code). */
const OPTION_LINE_RE = /^:[\w-]+:.*$/;

/**
 * Extract the inner code of a {code-cell} block and remember its fences for round-trip.
 * Leading `:key:` directive-option lines (MyST metadata such as `:tags:`/`:name:`) are
 * peeled off into `optionLines` verbatim so they don't pollute the editable code value.
 */
function parseCodeCell(text: string): { value: string; openFence: string; closeFence: string; optionLines: string[] } {
  const lines = text.split('\n');
  if (lines.length === 1) {
    // Unterminated fence (emitted by blockSplitter's EOF path): opener only, no closer.
    return { value: '', openFence: lines[0], closeFence: '', optionLines: [] };
  }
  const openFence = lines[0];
  const closeFence = lines[lines.length - 1];
  const inner = lines.slice(1, -1);
  // Consume the contiguous leading run of `:key:` option lines; the first non-option
  // line ends the run (option-like lines after real code stay in the code value).
  let i = 0;
  const optionLines: string[] = [];
  while (i < inner.length && OPTION_LINE_RE.test(inner[i])) {
    optionLines.push(inner[i]);
    i++;
  }
  const value = inner.slice(i).join('\n');
  return { value, openFence, closeFence, optionLines };
}

export function textToCells(text: string): RawCell[] {
  return splitBlocks(text).map((b): RawCell => {
    if (b.kind === 'code') {
      const { value, openFence, closeFence, optionLines } = parseCodeCell(b.text);
      const myst: { fence: string; closeFence: string; options?: string[] } = {
        fence: openFence,
        closeFence,
      };
      if (optionLines.length > 0) myst.options = optionLines;
      return {
        kind: 'code',
        language: String(b.meta?.language || 'python'),
        value,
        metadata: { myst },
      };
    }
    return { kind: 'markup', language: 'markdown', value: b.text, metadata: {} };
  });
}

/**
 * Serialize cells back to MyST text. Blocks are joined with exactly one blank
 * line (`\n\n`); the result has NO trailing newline.
 *
 * Trailing-newline contract: this pure core operates on newline-stripped canonical
 * text. The VS Code NotebookSerializer adapter owns the file's trailing newline —
 * it appends one on save and strips one on load — so do NOT add a trailing newline
 * here (that would double it at the adapter boundary).
 *
 * Known v1 limitation: inter-block separation is canonicalized to a single blank
 * line. Source with multiple consecutive blank lines between blocks is collapsed to
 * one on first save. This is within the documented "supported subset"; files that
 * are canonical Jupyter Book output or were created by this editor round-trip exactly.
 */
export function cellsToText(cells: RawCell[]): string {
  const parts = cells.map((c) => {
    if (c.kind === 'code') {
      const myst = (c.metadata.myst ?? {}) as { fence?: string; closeFence?: string; options?: string[] };
      const open = myst.fence ?? '```{code-cell} ' + c.language;
      const close = myst.closeFence ?? '```';
      const lines = [open];
      // Directive-option lines are re-emitted verbatim, in order, before the code.
      if (myst.options) lines.push(...myst.options);
      if (c.value !== '') lines.push(c.value);
      if (close !== '') lines.push(close);
      return lines.join('\n');
    }
    return c.value;
  });
  return parts.join('\n\n');
}
