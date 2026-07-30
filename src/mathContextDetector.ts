import * as vscode from 'vscode';

/**
 * Returns true if `position` in `document` is inside a LaTeX math context
 * ($...$ or $$...$$), including multi-line display math.
 *
 * Scans ALL text from document start to the cursor position, tokenizing
 * into math delimiters ($$ greedily first, then $). An odd token count
 * means the cursor is inside an open math span.
 */
export function isInsideMathContext(
  document: vscode.TextDocument,
  position: vscode.Position,
): boolean {
  // Get all text from document start up to (but not including) the cursor
  const range = new vscode.Range(0, 0, position.line, position.character);
  const textBeforeCursor = document.getText(range);
  // Mask escaped \$ so they don't count as math delimiters
  const sanitized = textBeforeCursor.replace(/\\\$/g, '  ');
  // Greedily match $$ before $ so display-math openers count as one token
  const tokens = sanitized.match(/\$\$|\$/g) ?? [];
  return tokens.length % 2 === 1;
}
