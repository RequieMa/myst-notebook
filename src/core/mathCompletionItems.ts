/** Custom saved-LaTeX completion entries. Pure module — no VS Code imports. */

export interface CustomCompletionEntry {
  latex: string;
  count: number;
  sortText: string;
}

/**
 * Build the completion entries for custom (user-saved) LaTeX snippets.
 *
 * A snippet is included only when it is NOT already in the built-in symbol
 * list AND has a positive usage count (i.e. was explicitly saved via
 * `myst-notebook.saveSelectedLatex`, not merely markSeen'd by the linter).
 * Entries sort in the used-symbol tier (`0_…`), by count descending.
 */
export function buildCustomCompletionEntries(
  stored: string[],
  builtInKeys: { has(latex: string): boolean },
  getCount: (latex: string) => number,
): CustomCompletionEntry[] {
  const entries: CustomCompletionEntry[] = [];
  stored.forEach((latex, i) => {
    if (builtInKeys.has(latex)) return;
    const count = getCount(latex);
    if (count <= 0) return;
    const countKey = String(9999 - Math.min(count, 9999)).padStart(4, '0');
    entries.push({
      latex,
      count,
      sortText: `0_${countKey}_c${String(i).padStart(4, '0')}`,
    });
  });
  entries.sort((a, b) => a.sortText.localeCompare(b.sortText));
  return entries;
}
