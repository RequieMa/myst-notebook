/**
 * Returns true if the character position `charIndex` in `line` is inside
 * a LaTeX math context ($...$ or $$...$$).
 *
 * Tokenizes the substring left of `charIndex` into math delimiters ($$, $),
 * treating $$ as a single token so that display math is handled correctly.
 * An odd token count means the cursor is inside an open math span.
 */
export function isInsideMathContext(line: string, charIndex: number): boolean {
  const left = line.slice(0, charIndex);
  // Mask escaped \$ so they don't count as math delimiters
  const sanitized = left.replace(/\\\$/g, '  ');
  // Greedily match $$ before $ so display-math openers count as one token
  const tokens = sanitized.match(/\$\$|\$/g) ?? [];
  return tokens.length % 2 === 1;
}
