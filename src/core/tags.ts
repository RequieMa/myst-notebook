/**
 * Whether a code cell's MyST directive options request a hidden (collapsed) input.
 *
 * `options` is the verbatim `:key: ...` option-line array the serializer lifts off a
 * {code-cell} block (see `parseCodeCell` in `serializer.ts`). We scan for a `:tags:`
 * line and treat the presence of `hide-input` or `hide-cell` in its bracketed list as
 * a request to collapse the cell's input — matching Jupyter Book's tag semantics.
 *
 * VS Code-free by design so it can be unit-tested under vitest alongside the rest of
 * the pure core.
 */
export function hasHideInputTag(options: string[] | undefined): boolean {
  if (!options) return false;
  for (const line of options) {
    // Only `:tags: [...]` lines carry hide-input/hide-cell; anything else is ignored.
    const match = /^:tags:\s*\[(.*)\]\s*$/.exec(line);
    if (!match) continue;
    // Split the bracketed list on commas, then strip whitespace and any surrounding
    // quotes so `hide-input`, `"hide-input"` and `'hide-input'` all compare equal.
    const tags = match[1]
      .split(',')
      .map((t) => t.trim().replace(/^['"]|['"]$/g, '').trim());
    if (tags.includes('hide-input') || tags.includes('hide-cell')) return true;
  }
  return false;
}

/**
 * Whether a cell's metadata object requests a hidden (collapsed) input.
 *
 * A thin adapter over `hasHideInputTag`: it digs the verbatim option lines out of
 * `metadata.myst.options` (shape `{ options?: string[] }`) and delegates the tag scan.
 * Centralising the `metadata.myst` shape here keeps the cast in ONE place — callers
 * (cellFactory at load/type time, inputCollapse at open time) pass the whole cell
 * metadata object and never re-derive the shape themselves.
 */
export function hideInputFromCellMetadata(
  metadata: Record<string, unknown> | undefined,
): boolean {
  const myst = metadata?.myst as { options?: string[] } | undefined;
  return hasHideInputTag(myst?.options);
}
