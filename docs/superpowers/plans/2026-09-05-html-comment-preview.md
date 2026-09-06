# HTML Comment Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render markdown HTML comments (`<!-- ... -->`) visibly in the notebook preview, showing the full `<!-- -->` markers, instead of being swallowed as invisible HTML comment nodes.

**Architecture:** A pure `src/core/mystComment.ts` module (no VS Code / markdown-it imports) provides comment detection, escaping, and markup helpers. The notebook renderer (`renderer/mystRenderer.ts`) overrides markdown-it's `html_block` / `html_inline` renderer rules: comment tokens render via the helpers; all other HTML delegates to the previous default rule. The renderer bundle already resolves relative imports (esbuild), so importing `../src/core/mystComment` works.

**Tech Stack:** TypeScript, markdown-it (via VS Code's built-in notebook renderer), vitest.

**Spec:** Approved in-chat design (bounded task — no separate spec file). Key decisions captured in Global Constraints below.

## Global Constraints

- VS Code ≥ 1.85.
- Only HTML comments (`<!-- ... -->`) are handled; no other comment syntax.
- Rendered output must show the full `<!-- ... -->` markers (escape `<`/`&`/`>` so the browser displays them literally rather than re-hiding them).
- Style: gray italic (`color:#999999;font-style:italic;opacity:0.75`). Inline comments → `<span>`; block comments (own line) → `<div>`. Both carry `class="myst-comment"`.
- Non-comment HTML (e.g. `<div>`) must pass through to the previous renderer rule unchanged.
- Pure logic lives in `src/core/mystComment.ts` (no imports). Renderer wiring lives in `renderer/mystRenderer.ts`.
- Renderer is browser-bundled by `esbuild.js`; `npm run build` must succeed before F5 or integration tests (it also regenerates `renderer/generated/katexCss.ts`).

---

### Task 1: Pure comment-rendering helpers

**Files:**
- Create: `src/core/mystComment.ts`
- Test: `src/core/mystComment.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exported from `src/core/mystComment.ts`):
  - `isHtmlComment(content: string): boolean`
  - `escapeHtml(s: string): string`
  - `renderCommentInline(content: string): string`
  - `renderCommentBlock(content: string): string`

- [ ] **Step 1: Write the failing test**

Create `src/core/mystComment.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/mystComment.test.ts`
Expected: FAIL — `Cannot find module './mystComment'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/core/mystComment.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/mystComment.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/mystComment.ts src/core/mystComment.test.ts
git commit -m "feat: pure HTML-comment rendering helpers with tests"
```

---

### Task 2: Wire into the notebook renderer

**Files:**
- Modify: `renderer/mystRenderer.ts` (one import + two renderer-rule overrides)

**Interfaces:**
- Consumes (from Task 1, `src/core/mystComment.ts`): `isHtmlComment`, `renderCommentInline`, `renderCommentBlock`.

- [ ] **Step 1: Add the import**

At the top of `renderer/mystRenderer.ts`, after `import { KATEX_CSS } from './generated/katexCss';`:

```ts
import { isHtmlComment, renderCommentInline, renderCommentBlock } from '../src/core/mystComment';
```

- [ ] **Step 2: Add the renderer-rule overrides**

Inside `extendMarkdownIt((md) => { ... })`, add the following just before the `return md;` line (after the existing fence-handling block):

```ts
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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS — no type errors.

> Note: the renderer is bundled separately by esbuild for the browser; `tsc` covers both `src/` and `renderer/` via the project `tsconfig.json`. If `tsconfig.json` does not include `renderer/`, skip this step — the `npm run build` step below is the authoritative check for the renderer bundle.

- [ ] **Step 4: Build + unit tests**

Run: `npm run build` then `npm test`
Expected: PASS — esbuild bundles the renderer (resolving `../src/core/mystComment`); all tests green including `src/core/mystComment.test.ts` (6 tests).

- [ ] **Step 5: F5 smoke check (Extension Development Host)**

Expected behavior:
1. Open a `.md` as a MyST Notebook containing:
   ```markdown
   Some text <!-- an inline note --> continues here.

   <!-- a standalone note -->

   Regular paragraph with <strong>raw HTML</strong>.
   ```
2. In preview: `<!-- an inline note -->` and `<!-- a standalone note -->` both appear in gray italic, with their `<!-- -->` markers visible.
3. `<strong>raw HTML</strong>` renders as bold (non-comment HTML unaffected).
4. Editing the cell (enter edit mode) still shows the raw source; the visible comment is only in the preview state.

- [ ] **Step 6: Commit**

```bash
git add renderer/mystRenderer.ts
git commit -m "feat: render HTML comments visibly in notebook preview"
```
