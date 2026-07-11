import type MarkdownIt from 'markdown-it';
import katex from 'katex';
import { KATEX_CSS } from './generated/katexCss';

/**
 * Notebook markup-cell renderer. Extends VS Code's built-in markdown-it with:
 *  - inline `$...$` and block `$$...$$` math (KaTeX)
 *  - MyST fence handling: `{code-cell}` shown as plain code; other fences default.
 *
 * MyST colon-fence directives (`:::{note}`, `:::{warning}`, etc.) are NOT rendered
 * inline — VS Code's notebook renderer uses md.renderInline() for markup cells,
 * which skips both block.ruler and core.ruler processing. The directives remain as
 * plain source text in the editor and are correctly rendered by `jupyter-book build`.
 * See README § Limitations.
 *
 * Bundled for the notebook webview (browser/ESM) → dist/renderer/mystRenderer.js.
 */
export const activate = () => ({
  extendMarkdownIt(md: MarkdownIt) {
    ensureKatexCss();

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

    return md;
  },
});

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
