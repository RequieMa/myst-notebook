import type { ParserPlugin } from './core';
import { Range } from './core';

/**
 * URI-path prefix used to encode MyST citation targets as Foam placeholders.
 * A `{cite}` role for `smith2020` becomes a wikilink to `URI.placeholder('bib:smith2020')`.
 *
 * This is the single source of truth for the convention: every consumer that
 * needs to recognise a citation target (the graph webview, the placeholder
 * decorator, wikilink completion) uses `isCitationTarget` rather than
 * open-coding the `'bib:'` string, so the convention can't drift between sites.
 */
export const CITATION_TARGET_PREFIX = 'bib:';

/**
 * True if a URI path / graph-node id refers to a MyST citation target.
 * Accepts the `path` of a resolved placeholder URI, or a graph-node id
 * (both are the bare `bib:<key>` string).
 */
export function isCitationTarget(pathOrId: string): boolean {
  return pathOrId.startsWith(CITATION_TARGET_PREFIX);
}


/**
 * Foam ParserPlugin that recognises MyST `{cite}` roles and adds them as
 * graph connections to `citation`-typed nodes.
 *
 * A `{cite}` role has the form: {cite}`key` or {cite}`key1,key2`
 * Each citekey produces a wikilink from the current note to a node
 * with target `bib:<citekey>`, so the existing wikilink resolver
 * treats it as a connection in the graph.
 *
 * Implementation: the `visit` hook fires for every AST node with access to
 * the raw `noteSource` string.  On the root node we scan for `{cite}` roles
 * and push synthetic wikilinks directly into `note.links`.
 *
 * Note: `onWillParseMarkdown` return value is currently ignored by the Foam
 * parser (the result is not reassigned), so we cannot use the injection
 * approach from the spec.  Using `visit` on the root node is the correct way
 * to add synthetic links with access to raw source.
 */
export const mystCitationPlugin: ParserPlugin = {
  name: 'myst-citation',
  visit(node, note, noteSource) {
    // Only process once per document — on the root node.
    if (node.type !== 'root') return;

    const keys = extractCiteKeys(noteSource);
    if (keys.length === 0) return;

    // Use an empty range (line 0, col 0) for synthetic links — they have no
    // real position in the rendered AST.
    const syntheticRange = Range.create(0, 0, 0, 0);

    for (const key of keys) {
      // Do NOT set `definition` — for synthetic wikilinks the link target is
      // encoded in `rawText` and resolved by `MarkdownLink.analyzeLink` which
      // reads `rawText` exclusively for wikilinks.  Setting definition to a
      // string would mis-classify the link as an unresolved reference-style
      // link label; leaving it undefined lets it pass through as a regular
      // wikilink so the graph resolver produces a live edge to
      // URI.placeholder('bib:<key>').
      note.links.push({
        type: 'wikilink',
        rawText: `[[${CITATION_TARGET_PREFIX}${key}]]`,
        range: syntheticRange,
        isEmbed: false,
      });
    }
  },
};

/**
 * Extract all citekeys from MyST `{cite}` roles in a markdown string.
 * Handles: {cite}`key`, {cite}`key1,key2`, {cite:p}`key`, {cite:t}`key`
 */
export function extractCiteKeys(markdown: string): string[] {
  const keys: string[] = [];
  const roleRe = /\{cite(?::[^}]*)?\}`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = roleRe.exec(markdown)) !== null) {
    for (const k of m[1].split(',')) {
      const key = k.trim();
      if (key) keys.push(key);
    }
  }
  return [...new Set(keys)];
}
