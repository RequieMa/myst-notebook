import type { RawCell } from './serializer';

/**
 * Factory functions for the two authoring cell kinds this editor inserts — the single
 * source of truth so command handlers, menus and tests all mint identical cells.
 *
 * Both return plain `RawCell` objects (the pure-core cell shape from `serializer.ts`),
 * so this module is VS Code-free and fully unit-testable under vitest. The cells are
 * designed to serialize — via `cellsToText` — to canonical MyST that round-trips.
 */

/**
 * An executable, collapsed-by-default {code-cell}.
 *
 * We leave `fence`/`closeFence` unset so `cellsToText` supplies the canonical defaults
 * (```` ```{code-cell} python ```` / ```` ``` ````); the lone `:tags: [hide-input]`
 * option line makes it collapse per the hide-input model (see `hasHideInputTag`), and
 * serializing yields `` ```{code-cell} python\n:tags: [hide-input]\n``` ``.
 */
export function makeExecutableCell(): RawCell {
  return {
    kind: 'code',
    language: 'python',
    value: '',
    metadata: { myst: { options: [':tags: [hide-input]'] } },
  };
}

/**
 * A display-only python block that lives in a MARKUP cell.
 *
 * The value is a plain ```` ```python ```` fence (opener, `body`, closer) — which MyST
 * renders as highlighted source but NEVER executes, unlike `{code-cell}`. `body`
 * defaults to a single empty line. As markup, `cellsToText` emits `value` verbatim, so
 * it round-trips exactly.
 */
export function makeDisplayCodeCell(body: string = ''): RawCell {
  return {
    kind: 'markup',
    language: 'markdown',
    value: '```python\n' + body + '\n```',
    metadata: {},
  };
}
