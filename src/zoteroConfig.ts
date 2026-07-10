/**
 * Pure logic for configuring the `mblode.zotero` VS Code extension to emit MyST
 * `{cite}` citations. No `vscode` import — unit-tested in isolation.
 *
 * Background: `mblode.zotero`'s only setting, `zotero-citation-picker.port`, is
 * misnamed — it holds a full URL used verbatim as the fetch target. Pointing it
 * at a Better BibTeX CAYW `eta`-template URL makes the picker insert MyST
 * `` {cite}`key` `` directly. See myst-citations/cayw-templates.md.
 */

export type CiteRole = 'cite' | 'cite:p' | 'cite:t';

export const ZOTERO_EXTENSION_ID = 'mblode.zotero';
export const ZOTERO_SETTING = 'zotero-citation-picker.port';

const CAYW_ENDPOINT = 'http://127.0.0.1:23119/better-bibtex/cayw';

/**
 * The Eta template body (before URL-encoding) for a given MyST citation role.
 * The Better BibTeX `eta` formatter exposes picks as `it.items`, each carrying a
 * `citationKey` field (confirmed live 2026-06-29); MyST groups multiple keys in
 * one role: `` {cite}`a,b` ``.
 */
function templateForRole(role: CiteRole): string {
  return '{' + role + '}`<%= it.items.map(i => i.citationKey).join(\',\') %>`';
}

/**
 * The full, URL-encoded CAYW endpoint URL to paste into ZOTERO_SETTING for a
 * given role. This is the single source of truth for the three MyST URLs.
 */
export function caywUrlForRole(role: CiteRole): string {
  const template = encodeURIComponent(templateForRole(role));
  return `${CAYW_ENDPOINT}?format=eta&template=${template}`;
}

/**
 * True if `value` is already one of our MyST `{cite}` template URLs — i.e. the
 * setting is configured for MyST and should not be prompted for or clobbered.
 * Deliberately narrow: an `eta` CAYW URL whose decoded template targets a
 * `{cite...}` role with the citationKey mapping.
 */
export function isMystCiteUrl(value: string | undefined): boolean {
  if (!value) return false;
  if (!value.startsWith(CAYW_ENDPOINT)) return false;
  if (!value.includes('format=eta')) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return false;
  }
  return /\{cite(?::[pt])?\}`/.test(decoded) && decoded.includes('citationKey');
}
