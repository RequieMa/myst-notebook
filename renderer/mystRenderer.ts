import type MarkdownIt from 'markdown-it';
import katex from 'katex';
import { KATEX_CSS } from './generated/katexCss';
import { parseFigureBody } from '../src/core/mystFigure';

/**
 * Notebook markup-cell renderer. Extends VS Code's built-in markdown-it with:
 *  - inline `$...$` and block `$$...$$` math (KaTeX)
 *  - MyST fence handling: `{code-cell}` shown as plain code; other fences default.
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
      // Guard against prose false-positives:
      // - a space right after the opening `$` (the comment promises we won't match it)
      // - a digit right after the closing `$` (currency like "$5 and $10")
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

      // single-line $$ ... $$
      const singleLine = line.length > 4 && line.endsWith('$$');
      let nextLine = startLine;
      let content = '';
      if (singleLine) {
        content = line.slice(2, -2).trim();
      } else {
        // multi-line: scan until a line ending with $$
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

    // MyST colon-fence directives: `:::{name}` ... `:::`.
    // VS Code's notebook renderer uses md.renderInline() for markup cells,
    // which skips BOTH block.ruler AND core.ruler. The only viable hook is
    // to monkey-patch md.renderInline itself — pre-process the source text
    // before it enters markdown-it's inline parser. Rewrite colon fences
    // into blockquotes, which VS Code's built-in renderer handles natively.
    const origRenderInline = md.renderInline.bind(md);
    md.renderInline = function (src: string, env?: any) {
      const preprocessed = src.replace(
        /^:{3,}\{(\w+)\}\s*?\n([\s\S]*?)^:{3,}\s*$/gm,
        (_: string, name: string, body: string) => {
          const label = ADMONITION_LABELS[name] ?? name;
          const prefix = '> **' + label + ':** ';
          return prefix + body.trimEnd().replace(/\n/g, '\n> ') + '\n';
        }
      );
      return origRenderInline(preprocessed, env);
    };
    // Dead code — block rules are unreachable in notebook renderer.
    // biome-ignore: dead code kept for reference
    /* obsoleted: md.block.ruler before + myst_directive renderer
    md.block.ruler.before('fence', 'myst_colon_fence', (state, startLine, endLine, silent) => {
      const startPos = state.bMarks[startLine] + state.tShift[startLine];
      const lineText = state.src.slice(startPos, state.eMarks[startLine]).trimEnd();
      console.warn('[myst_colon_fence] called line=' + startLine + ' text=' + JSON.stringify(lineText.slice(0, 80)));
      if (!/^:{3,}\s*\{/.test(lineText)) return false;

      const openColons = (lineText.match(/^(:+)/) ?? [':::'])[0];
      const directiveMatch = lineText.match(/^\s*:{3,}\s*\{([^}]+)\}(.*)$/);
      const directiveName = directiveMatch ? directiveMatch[1].trim() : 'note';
      // Text after the `}` on the opener line is the directive ARGUMENT
      // (e.g. the image src for {figure}/{image}). Admonitions have none.
      const directiveArg = directiveMatch ? directiveMatch[2].trim() : '';

      let closeLine = startLine + 1;
      for (; closeLine < endLine; closeLine++) {
        const p = state.bMarks[closeLine] + state.tShift[closeLine];
        const cl = state.src.slice(p, state.eMarks[closeLine]).trimEnd();
        if (new RegExp(`^:{${openColons.length},}\\s*$`).test(cl)) break;
      }
      if (closeLine >= endLine) return false;
      if (silent) return true;

      const bodyLines: string[] = [];
      for (let i = startLine + 1; i < closeLine; i++) {
        const p = state.bMarks[i];
        bodyLines.push(state.src.slice(p, state.eMarks[i]));
      }

      const token = state.push('myst_directive', 'div', 0);
      token.info = directiveName;
      token.content = bodyLines.join('\n');
      token.meta = { arg: directiveArg };
      token.map = [startLine, closeLine + 1];
      state.line = closeLine + 1;
      return true;
    });

    md.renderer.rules['myst_directive'] = (tokens, idx) => {
      const name = tokens[idx].info;
      const body = tokens[idx].content;
      const arg = (tokens[idx].meta as { arg?: string } | undefined)?.arg ?? '';

      // figure/image: render a real <figure>/<img> using the opener-line
      // argument as the src. NOTE (sandbox caveat): the notebook-renderer
      // webview generally can't resolve RELATIVE local image paths (same
      // limitation that forced KaTeX fonts to be inlined). Absolute http(s)://
      // URLs and data: URIs load fine; relative paths will show the browser's
      // broken-image state. We deliberately do NOT rewrite/resolve or inline
      // paths (webview base URI isn't reliably available) — out of scope.
      if (name === 'figure' || name === 'image') {
        const { options, caption } = parseFigureBody(body);
        const src = md.utils.escapeHtml(arg);
        const alt = md.utils.escapeHtml(options.alt ?? '');
        const widthStyle =
          options.width && WIDTH_RE.test(options.width)
            ? `width:${md.utils.escapeHtml(options.width)};`
            : '';
        const img = `<img src="${src}" alt="${alt}" style="${IMG_STYLE}${widthStyle}">`;
        const figcaption =
          name === 'figure' && caption
            ? `<figcaption style="${FIGCAPTION_STYLE}">`
              + renderInlineLines(md, caption)
              + `</figcaption>`
            : '';
        return `<figure class="myst-figure" style="${FIGURE_STYLE}">${img}${figcaption}</figure>\n`;
      }

      const label = ADMONITION_LABELS[name] ?? name;
      const style = ADMONITION_STYLES[name] ?? ADMONITION_STYLES['_generic'];
      const paragraphs = body.split(/\n\n+/).filter(p => p.trim());
      const renderedBody = paragraphs
        .map(p => '<p>' + renderInlineLines(md, p) + '</p>')
        .join('');
      return `<div class="myst-admonition" style="${style}">`
        + `<div class="myst-admonition-title" style="${TITLE_STYLE}">${label}</div>`
        + `<div class="myst-admonition-body">${renderedBody}</div>`
        + `</div>\n`;
    };
    */

    return md;
  },
});

const ADMONITION_LABELS: Record<string, string> = {
  note: 'Note', tip: 'Tip', important: 'Important', hint: 'Hint',
  warning: 'Warning', caution: 'Caution', danger: 'Danger', error: 'Error',
  attention: 'Attention', seealso: 'See Also', todo: 'To Do',
};
const ADMONITION_STYLES: Record<string, string> = {
  note:      'border-left:4px solid #4a9eff;background:#1a2744;padding:10px 14px;margin:8px 0;border-radius:4px',
  tip:       'border-left:4px solid #3fb950;background:#122a1e;padding:10px 14px;margin:8px 0;border-radius:4px',
  hint:      'border-left:4px solid #3fb950;background:#122a1e;padding:10px 14px;margin:8px 0;border-radius:4px',
  important: 'border-left:4px solid #a371f7;background:#1f1735;padding:10px 14px;margin:8px 0;border-radius:4px',
  warning:   'border-left:4px solid #d29922;background:#2d2008;padding:10px 14px;margin:8px 0;border-radius:4px',
  caution:   'border-left:4px solid #d29922;background:#2d2008;padding:10px 14px;margin:8px 0;border-radius:4px',
  danger:    'border-left:4px solid #f85149;background:#2d0c0c;padding:10px 14px;margin:8px 0;border-radius:4px',
  error:     'border-left:4px solid #f85149;background:#2d0c0c;padding:10px 14px;margin:8px 0;border-radius:4px',
  attention: 'border-left:4px solid #f85149;background:#2d0c0c;padding:10px 14px;margin:8px 0;border-radius:4px',
  seealso:   'border-left:4px solid #4a9eff;background:#1a2744;padding:10px 14px;margin:8px 0;border-radius:4px',
  todo:      'border-left:4px solid #d29922;background:#2d2008;padding:10px 14px;margin:8px 0;border-radius:4px',
  _generic:  'border-left:4px solid #6e7681;background:#161b22;padding:10px 14px;margin:8px 0;border-radius:4px',
};
const TITLE_STYLE = 'font-weight:600;font-size:0.9em;margin-bottom:6px;text-transform:capitalize;opacity:0.9';

// figure/image styling — centered figure with a muted italic caption, matching
// the dark palette used by the admonition styles above.
const FIGURE_STYLE = 'margin:12px 0;text-align:center';
const IMG_STYLE = 'max-width:100%;height:auto;border-radius:4px;';
const FIGCAPTION_STYLE = 'margin-top:6px;font-size:0.9em;font-style:italic;opacity:0.75';

// Strict CSS-length whitelist for the figure/image `:width:` option. Real MyST
// widths look like 400px / 50% / 30em; anything else is dropped to avoid CSS
// injection through the interpolated style attribute.
const WIDTH_RE = /^\d+(\.\d+)?(px|%|em|rem|vw|vh)$/;

// Render a block of text where each source line becomes an inline-rendered line
// joined by <br>. Shared by the figcaption and admonition-body paths so they
// stay byte-identical.
const renderInlineLines = (md: MarkdownIt, text: string): string =>
  text.split('\n').map(l => md.renderInline(l)).join('<br>');

function renderMath(expr: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expr, { throwOnError: false, displayMode });
  } catch {
    // On a hard failure, show the raw expression rather than breaking the cell.
    return displayMode ? `<pre>$$${expr}$$</pre>` : `<code>$${expr}$</code>`;
  }
}

function ensureKatexCss(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('katex-css')) return;
  // KaTeX CSS with woff2 fonts inlined as data URIs (see esbuild.js). Injected
  // as a <style> so math renders styled fully offline — the notebook-renderer
  // webview sandbox can't resolve relative font URLs or reach a CDN.
  const style = document.createElement('style');
  style.id = 'katex-css';
  style.textContent = KATEX_CSS;
  document.head.appendChild(style);
}
