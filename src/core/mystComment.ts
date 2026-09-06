/** Markdown HTML-comment rendering helpers. Pure module — no VS Code / markdown-it imports. */

const COMMENT_STYLE =
  'color:#999999;font-style:italic;opacity:0.75;';

/** True when `content` is a whole HTML comment `<!-- ... -->` (already trimmed). */
export function isHtmlComment(content: string): boolean {
  return content.startsWith('<!--') && content.endsWith('-->');
}

/** Escape `&`, `<`, `>` so the browser displays them literally. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Inline comment markup: a styled span showing the full `<!-- ... -->`. */
export function renderCommentInline(content: string): string {
  return `<span class="myst-comment" style="${COMMENT_STYLE}">${escapeHtml(content)}</span>`;
}

/** Block comment markup: a styled div showing the full `<!-- ... -->`. */
export function renderCommentBlock(content: string): string {
  return `<div class="myst-comment" style="${COMMENT_STYLE}margin:4px 0;">${escapeHtml(content)}</div>`;
}
