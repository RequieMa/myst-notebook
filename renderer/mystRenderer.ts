import type MarkdownIt from 'markdown-it';
import katex from 'katex';
import { KATEX_CSS } from './generated/katexCss';
import { isHtmlComment, renderCommentInline, renderCommentBlock } from '../src/core/mystComment';

/** Minimal subset of VS Code's RendererContext — what we actually use. */
interface RendererContext {
  getRenderer(id: string): Promise<{ extendMarkdownIt(fn: (md: MarkdownIt) => MarkdownIt): void } | undefined>;
}

/**
 * Notebook markup-cell renderer. Extends VS Code's built-in markdown-it with:
 *  - inline `$...$` and block `$$...$$` math (KaTeX)
 *  - MyST `:::{type}` colon-fence directives (admonitions, callouts)
 *  - MyST fence handling: `{code-cell}` shown as plain code; other fences default.
 *
 * Uses the markdown-math pattern: ctx.getRenderer('vscode.markdown-it-renderer')
 * then calls parent.extendMarkdownIt() to hook into the live markdown-it instance.
 * Returning { extendMarkdownIt } from activate() does NOT work — the parent
 * renderer never calls the child's extendMarkdownIt.
 *
 * Bundled for the notebook webview (browser/ESM) → dist/renderer/mystRenderer.js.
 */
export async function activate(ctx: RendererContext) {
  const markdownItRenderer = (await ctx.getRenderer('vscode.markdown-it-renderer')) as
    | { extendMarkdownIt(fn: (md: MarkdownIt) => MarkdownIt): void }
    | undefined;
  if (!markdownItRenderer) {
    throw new Error(`Could not load 'vscode.markdown-it-renderer'`);
  }

  ensureKatexCss();

  markdownItRenderer.extendMarkdownIt((md: MarkdownIt) => {
    // Source normalization: markdown-it's paragraph rule greedily consumes
    // consecutive non-blank lines, so a `:::` closer immediately after a
    // text line would be swallowed as paragraph content and never reach our
    // block rule.  Insert a blank line before every `:::$` so the closer
    // always lands on its own line after a paragraph break.
    const origParse = md.parse.bind(md);
    (md as any).parse = (src: string, env?: any) => {
      const normalized = src.replace(/([^\n])\n(:::[\s]*)$/gm, '$1\n\n$2');
      return origParse(normalized, env);
    };

    // Inline math: $...$  (single-dollar, no surrounding space inside the delims)
    md.inline.ruler.after('escape', 'myst_math_inline', (state, silent) => {
      const start = state.pos;
      if (state.src[start] !== '$') return false;
      const end = state.src.indexOf('$', start + 1);
      if (end < 0) return false;
      if (end === start + 1) return false; // empty $$ — not inline math
      if (state.src[start + 1] === ' ') return false;
      const afterClose = state.src[end + 1];
      if (afterClose !== undefined && /\d/.test(afterClose)) return false;
      if (!silent) {
        const token = state.push('myst_math_inline', 'span', 0);
        token.content = state.src.slice(start + 1, end);
      }
      state.pos = end + 1;
      return true;
    });
    md.renderer.rules['myst_math_inline'] = (tokens, idx) =>
      renderMath(tokens[idx].content, false);

    // Block math: $$ ... $$ on their own line(s)
    md.block.ruler.before('fence', 'myst_math_block', (state, startLine, endLine, silent) => {
      const startPos = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      const line = state.src.slice(startPos, max).trim();
      if (!line.startsWith('$$')) return false;

      const singleLine = line.length > 4 && line.endsWith('$$');
      let nextLine = startLine;
      let content = '';
      if (singleLine) {
        content = line.slice(2, -2).trim();
      } else {
        nextLine = startLine + 1;
        const buf: string[] = [];
        for (; nextLine < endLine; nextLine++) {
          const p = state.bMarks[nextLine] + state.tShift[nextLine];
          const m = state.eMarks[nextLine];
          const l = state.src.slice(p, m);
          if (l.trim().endsWith('$$')) {
            buf.push(l.slice(0, l.lastIndexOf('$$')));
            break;
          }
          buf.push(l);
        }
        content = buf.join('\n').trim();
      }
      if (silent) return true;
      state.line = singleLine ? startLine + 1 : Math.min(nextLine + 1, endLine);
      const token = state.push('myst_math_block', 'div', 0);
      token.content = content;
      token.map = [startLine, state.line];
      return true;
    });
    md.renderer.rules['myst_math_block'] = (tokens, idx) =>
      renderMath(tokens[idx].content, true) + '\n';

    // ::: colon-fence directives (admonitions, callouts, etc.)
    //
    // Uses an open/close TOKEN-PAIR pattern (like markdown-it-container).
    // The inner content between :::{type} and ::: is processed NATIVELY by
    // markdown-it's block parser — headings, code fences, tables, math
    // blocks all get their standard tokens and renderer rules. No nested
    // md.render() call needed.
    //
    // Depth is tracked in state.env._mystAdmonDepth so a bare ::: closer
    // only matches when we're actually inside an admonition.
    md.block.ruler.before('fence', 'myst_colon_fence', (state, startLine, endLine, silent) => {
      const startPos = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      const line = state.src.slice(startPos, max).trim();

      const isOpener = /^:{3,}\s*\{/.test(line);
      const isCloser = /^:{3,}$/.test(line);

      if (!isOpener && !isCloser) return false;

      // A bare ::: is only a closer if we're inside at least one admonition.
      // Otherwise it's just text (e.g. in a code example about MyST).
      if (isCloser) {
        const depth: number = (state.env as any)._mystAdmonDepth ?? 0;
        if (depth <= 0) return false;
      }

      if (silent) return true;

      if (isOpener) {
        const depth: number = (state.env as any)._mystAdmonDepth ?? 0;
        (state.env as any)._mystAdmonDepth = depth + 1;

        const typeMatch = /^:{3,}\s*\{(.+?)\}/.exec(line);
        const admonType = typeMatch ? typeMatch[1] : 'note';
        const token = state.push('myst_admonition_open', 'div', 1);
        token.attrs = [['class', `myst-admonition myst-admonition-${admonType}`]];
        token.block = true;
        token.map = [startLine, startLine + 1];
      } else {
        const depth: number = (state.env as any)._mystAdmonDepth ?? 0;
        (state.env as any)._mystAdmonDepth = Math.max(0, depth - 1);

        const token = state.push('myst_admonition_close', 'div', -1);
        token.block = true;
        token.map = [startLine, startLine + 1];
      }

      state.line = startLine + 1;
      return true;
    });

    // Renderer rules for the open/close token pair.
    // Inner content between them is rendered by markdown-it's standard
    // block/inline rules — no need for us to call md.render() at all.

    md.renderer.rules['myst_admonition_open'] = (tokens, idx) => {
      const token = tokens[idx];
      const typeClass = token.attrs?.[0]?.[1] ?? '';
      const typeName = typeClass.replace('myst-admonition myst-admonition-', '');
      const icon = ADMONITION_ICONS[typeName] ?? ADMONITION_ICONS.note;
      const colors = ADMONITION_COLORS[typeName] ?? ADMONITION_COLORS.note;
      return `<div class="myst-admonition myst-admonition-${md.utils.escapeHtml(typeName)}" style="border-left: 4px solid ${colors.border}; background: ${colors.bg}; padding: 8px 16px; margin: 8px 0; border-radius: 0 4px 4px 0;">
<div style="font-weight: 600; color: ${colors.title}; margin-bottom: 4px;">${icon} ${md.utils.escapeHtml(typeName.toUpperCase())}</div>
<div class="myst-admonition-body">`;
    };

    md.renderer.rules['myst_admonition_close'] = () => {
      return '</div></div>\n';
    };

    // Fence handling: show {code-cell} blocks as plain code; default otherwise.
    const defaultFence =
      md.renderer.rules.fence ||
      ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const info = (tokens[idx].info || '').trim();
      if (info.startsWith('{code-cell}')) {
        return `<pre class="myst-code-cell"><code>${md.utils.escapeHtml(
          tokens[idx].content
        )}</code></pre>`;
      }
      return defaultFence(tokens, idx, options, env, self);
    };

    // HTML comments: render `<!-- ... -->` visibly with their markers.
    // (By default the browser treats them as invisible HTML comment nodes.)
    const defaultHtmlBlock =
      md.renderer.rules.html_block ||
      ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
    const defaultHtmlInline =
      md.renderer.rules.html_inline ||
      ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

    md.renderer.rules.html_block = (tokens, idx, options, env, self) => {
      const content = (tokens[idx].content || '').trim();
      if (isHtmlComment(content)) return renderCommentBlock(content);
      return defaultHtmlBlock(tokens, idx, options, env, self);
    };

    md.renderer.rules.html_inline = (tokens, idx, options, env, self) => {
      const content = (tokens[idx].content || '').trim();
      if (isHtmlComment(content)) return renderCommentInline(content);
      return defaultHtmlInline(tokens, idx, options, env, self);
    };

    return md;
  });
}

/** Icon/emoji for each admonition type. */
const ADMONITION_ICONS: Record<string, string> = {
  note: '📝',
  warning: '⚠️',
  danger: '🚨',
  error: '❌',
  important: '🔔',
  hint: '💡',
  tip: '💡',
  attention: '👀',
  caution: '⚠️',
  seealso: '🔗',
  admonition: '📝',
};

/** Color scheme for each admonition type. */
const ADMONITION_COLORS: Record<string, { border: string; bg: string; title: string }> = {
  note: { border: '#6c5ce7', bg: 'rgba(108,92,231,0.08)', title: '#5b4cc4' },
  warning: { border: '#fdcb6e', bg: 'rgba(253,203,110,0.12)', title: '#c7a041' },
  danger: { border: '#e17055', bg: 'rgba(225,112,85,0.10)', title: '#c0392b' },
  error: { border: '#e17055', bg: 'rgba(225,112,85,0.10)', title: '#c0392b' },
  important: { border: '#0984e3', bg: 'rgba(9,132,227,0.08)', title: '#0870c4' },
  hint: { border: '#00b894', bg: 'rgba(0,184,148,0.08)', title: '#009b7d' },
  tip: { border: '#00b894', bg: 'rgba(0,184,148,0.08)', title: '#009b7d' },
  attention: { border: '#e17055', bg: 'rgba(225,112,85,0.08)', title: '#c0392b' },
  caution: { border: '#fdcb6e', bg: 'rgba(253,203,110,0.12)', title: '#c7a041' },
  seealso: { border: '#74b9ff', bg: 'rgba(116,185,255,0.08)', title: '#5e9fd4' },
  admonition: { border: '#b2bec3', bg: 'rgba(178,190,195,0.10)', title: '#636e72' },
};

function renderMath(expr: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expr, { throwOnError: false, displayMode });
  } catch {
    return displayMode ? `<pre>$$${expr}$$</pre>` : `<code>$${expr}$</code>`;
  }
}

function ensureKatexCss(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('katex-css')) return;
  const style = document.createElement('style');
  style.id = 'katex-css';
  style.textContent = KATEX_CSS;
  document.head.appendChild(style);
}
