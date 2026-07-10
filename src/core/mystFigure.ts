/**
 * Pure parsing helpers for MyST `figure` / `image` directive bodies.
 *
 * A figure/image directive looks like:
 *
 *   :::{figure} path/or/url/to/image.png
 *   :alt: alternative text
 *   :width: 400px
 *
 *   Caption paragraph (figure only).
 *   :::
 *
 * The leading `:key: value` lines are directive OPTIONS (metadata), not caption
 * text. Everything after the options block is the caption (figure only; `image`
 * has no caption). This module is renderer-agnostic and unit-tested; the actual
 * HTML emission lives in renderer/mystRenderer.ts.
 */

export interface FigureBody {
  /** Directive options keyed by name, e.g. { alt: '…', width: '400px' }. */
  options: Record<string, string>;
  /** Remaining body text (caption), with the options block stripped. */
  caption: string;
}

/**
 * Split a figure/image directive body into its leading options block and the
 * trailing caption text.
 *
 * Per MyST, the directive option block is the LEADING run of `:key: value`
 * lines and ends at the FIRST blank line OR the first non-option line,
 * whichever comes first. Everything from that point on — including later
 * `:foo:`-looking lines — is caption, so a caption whose first line starts
 * with a colon-word (e.g. `:ref:\`x\``) is never misparsed as an option.
 */
export function parseFigureBody(body: string): FigureBody {
  const options: Record<string, string> = {};
  const lines = body.split('\n');
  let i = 0;

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      // A blank line before any caption content terminates the option block;
      // everything after it is caption. Consume this blank so it isn't kept.
      i++;
      break;
    }
    const m = line.match(/^\s*:([\w-]+):\s*(.*)$/);
    if (!m) break; // first non-option, non-blank line is the first caption line
    options[m[1]] = m[2].trim();
  }

  return { options, caption: lines.slice(i).join('\n').trim() };
}
