/**
 * Pure matcher for the two authoring shorthands the Enter handler auto-expands.
 *
 * Both shorthands are DEFERRED: nothing happens while the fence is open. The writer
 * types a keyword fence, fills in the body, closes it with a bare ```, and only then
 * (Enter pressed with the cursor past the closer) does the whole block convert:
 *
 *   ```run          →  an executable, collapsed {code-cell} python cell
 *   <code>              whose value is <code>.
 *   ```
 *
 *   ```show         →  a display-only markup cell holding a ```python fence
 *   <code>              wrapping <code> (highlighted, never executed).
 *   ```
 *
 * VS Code-free so it's fully unit-testable under vitest (mirrors `blockSplitter.ts`).
 */

export type ShorthandKeyword = 'run' | 'show';

export interface ClosedShorthand {
  keyword: ShorthandKeyword;
  /** Body text between opener and closer (may be empty string). */
  body: string;
}

/**
 * Matches a CLOSED ```run…``` or ```show…``` fence: opener with keyword, optional
 * body lines, then a bare closer (```` ``` ```` of equal-or-greater length, only
 * trailing whitespace). Returns the keyword + body, or null if not a closed shorthand.
 *
 * The Enter handler passes textBeforeCursor here so that VS Code's auto-inserted
 * closing ``` does NOT trigger premature expansion — the closer must sit BEFORE the
 * cursor for a match, i.e. the writer has finished the body and moved past the final
 * ```. Leading/trailing whitespace around the whole slice is tolerated via `.trim()`.
 */
const CLOSED_SHORTHAND_RE = /^(`{3,})(run|show)[ \t]*\n([\s\S]*?)\n\1`*\s*$/;

export function matchClosedShorthandFence(cellText: string): ClosedShorthand | null {
  const m = CLOSED_SHORTHAND_RE.exec(cellText.trim());
  return m ? { keyword: m[2] as ShorthandKeyword, body: m[3] } : null;
}
