import { describe, it, expect } from 'vitest';
import {
  isHtmlComment,
  escapeHtml,
  renderCommentInline,
  renderCommentBlock,
} from './mystComment';

describe('isHtmlComment', () => {
  it('detects a simple comment', () => {
    expect(isHtmlComment('<!-- hi -->')).toBe(true);
  });

  it('rejects non-comment HTML', () => {
    expect(isHtmlComment('<div>hi</div>')).toBe(false);
  });

  it('rejects an unclosed comment', () => {
    expect(isHtmlComment('<!-- not closed')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isHtmlComment('')).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('escapes &, <, >', () => {
    expect(escapeHtml('<!-- a & b -->')).toBe('&lt;!-- a &amp; b --&gt;');
  });
});

describe('renderCommentInline', () => {
  it('wraps in a span with myst-comment class and escaped content', () => {
    const html = renderCommentInline('<!-- hi -->');
    expect(html).toContain('<span');
    expect(html).toContain('class="myst-comment"');
    expect(html).toContain('&lt;!-- hi --&gt;');
  });
});

describe('renderCommentBlock', () => {
  it('wraps in a div with myst-comment class and escaped content', () => {
    const html = renderCommentBlock('<!-- hi -->');
    expect(html).toContain('<div');
    expect(html).toContain('class="myst-comment"');
    expect(html).toContain('&lt;!-- hi --&gt;');
  });
});
