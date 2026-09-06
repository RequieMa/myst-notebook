/** Math-completion behavior helpers. Pure module — no VS Code imports. */

/**
 * True when the line prefix ends with an even number (> 0) of backslashes —
 * i.e. the user just typed a LaTeX `\\` line break. Completion should be
 * suppressed so Tab/Enter doesn't swallow the line break.
 */
export function shouldSuppressMathCompletion(linePrefix: string): boolean {
  const m = /\\+$/.exec(linePrefix);
  const count = m ? m[0].length : 0;
  return count > 0 && count % 2 === 0;
}
