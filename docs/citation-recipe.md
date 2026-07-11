# Zotero → MyST `{cite}` — CAYW templates

Ready-to-paste URLs for the Better BibTeX **CAYW** endpoint using the `eta`
formatter. Paste one into `mblode.zotero`'s `zotero-citation-picker.port` setting
(it is used verbatim as the fetch URL), or call it with `curl` to test.

> The **MyST: Configure Zotero Citations** command in the MyST Notebook extension
> writes these for you automatically (workspace scope). These raw URLs are for
> reference or manual setup. See [`citation-setup.md`](./citation-setup.md).

Endpoint base: `http://127.0.0.1:23119/better-bibtex/cayw`

The `eta` formatter exposes the picked items as `it.items`; each item has a
`citationKey` field (confirmed live against Better BibTeX on 2026-06-29). MyST
groups multiple keys in one role: `` {cite}`a,b` ``.

> ⚠️ The item field name is `citationKey` here. Other Better BibTeX versions may
> expose it as `citekey` — if the templates emit empty/`undefined` keys, run
> `format=json` (see bottom) to inspect the real shape and adjust accordingly.

## Templates (raw, human-readable)

**`{cite}` (basic citation):**
```
?format=eta&template={cite}`<%= it.items.map(i => i.citationKey).join(',') %>`
```

**`{cite:p}` (parenthetical):**
```
?format=eta&template={cite:p}`<%= it.items.map(i => i.citationKey).join(',') %>`
```

**`{cite:t}` (textual / narrative):**
```
?format=eta&template={cite:t}`<%= it.items.map(i => i.citationKey).join(',') %>`
```

## URL-encoded (paste these into the setting)

`{cite}`:
```
http://127.0.0.1:23119/better-bibtex/cayw?format=eta&template=%7Bcite%7D%60%3C%25%3D%20it.items.map(i%20%3D%3E%20i.citationKey).join('%2C')%20%25%3E%60
```

`{cite:p}`:
```
http://127.0.0.1:23119/better-bibtex/cayw?format=eta&template=%7Bcite%3Ap%7D%60%3C%25%3D%20it.items.map(i%20%3D%3E%20i.citationKey).join('%2C')%20%25%3E%60
```

`{cite:t}`:
```
http://127.0.0.1:23119/better-bibtex/cayw?format=eta&template=%7Bcite%3At%7D%60%3C%25%3D%20it.items.map(i%20%3D%3E%20i.citationKey).join('%2C')%20%25%3E%60
```

## Quick test with curl (Zotero must be running)

First inspect the real item shape (confirms the field name):
```
curl -s "http://127.0.0.1:23119/better-bibtex/cayw?format=json"
```
(This opens the Zotero picker; pick an item, then the JSON is returned.)

Then test the MyST template:
```
curl -s "http://127.0.0.1:23119/better-bibtex/cayw?format=eta&template=%7Bcite%7D%60%3C%25%3D%20it.items.map(i%20%3D%3E%20i.citationKey).join('%2C')%20%25%3E%60"
```
Expected output, e.g.: `` {cite}`smith2020` `` or `` {cite}`smith2020,doe2019` ``.

## Notes

- `&minimize=true` keeps Zotero in the background after picking (don't steal focus).
- If you want bracketed locators / prefixes, the `eta` template can read
  `it.items[n].locator`, `.prefix`, `.suffix`, `.suppressAuthor` — inspect with
  `format=json` to see what's populated.
- One saved URL = one role. Switching between `{cite}` / `{cite:p}` / `{cite:t}`
  by hand means editing the setting each time — the extension's **MyST: Configure
  Zotero Citations** command handles role-switching for you.
