# Zotero → MyST `{cite}` — setup & verification

**Goal:** get `` {cite}`key` `` inserted from your Zotero library using the
existing `mblode.zotero` extension + a Better BibTeX CAYW template URL.

The MyST Notebook extension automates the VS Code side (the
**MyST: Configure Zotero Citations** command / one-time prompt writes the URL
into `zotero-citation-picker.port` at workspace scope). This guide covers the
manual prerequisites and how to verify the whole pipeline end to end. The exact
template URLs are in [`citation-recipe.md`](./citation-recipe.md).

---

## Prerequisites (you set these up)

1. **Zotero desktop** installed and **running**.
2. **Better BibTeX** plugin installed in Zotero
   (Zotero → Tools → Plugins → it should be listed).
3. **`mblode.zotero`** ("Citation Picker for Zotero") installed in VS Code
   (the MyST Notebook command offers to install it if absent).
4. A Zotero library with at least 2–3 references to pick from.

> ⚠️ Zotero MUST be open the whole time. The picker talks to a local server
> (`127.0.0.1:23119`) that only exists while Zotero runs.

---

## Step 1 — Confirm the endpoint is alive & see the real data shape

In a terminal, run:

```bash
curl -s "http://127.0.0.1:23119/better-bibtex/cayw?format=json"
```

- A **Zotero picker window pops up** → search & select one reference → press Enter.
- The terminal prints **JSON** describing your pick.

**⚠️ Pay attention to:** the exact **field name for the citation key** in that
JSON. Here it is **`citationKey`** (confirmed 2026-06-29). Some Better BibTeX
versions call it `citekey`; if yours does, you'll edit the template accordingly.

If no picker appears or curl errors → Zotero isn't running or Better BibTeX isn't
installed. Fix that before continuing.

---

## Step 2 — Confirm a MyST template renders `{cite}`

Run (the URL-encoded `{cite}` template):

```bash
curl -s "http://127.0.0.1:23119/better-bibtex/cayw?format=eta&template=%7Bcite%7D%60%3C%25%3D%20it.items.map(i%20%3D%3E%20i.citationKey).join('%2C')%20%25%3E%60"
```

Pick a reference in the popup.

**✅ Expected output:** something like `` {cite}`smith2020` `` or, with multiple
picks, `` {cite}`smith2020,doe2019` ``.

**⚠️ Pay attention to:**
- If you get `` {cite}`undefined` `` → the field name is wrong. Replace
  `i.citationKey` in the URL with the name you found in Step 1 (e.g. `i.citekey`)
  and re-run. (See [`citation-recipe.md`](./citation-recipe.md) for the readable,
  non-encoded form.)
- If you get an error about `eta` / unknown format → your Better BibTeX version
  may be too old.

---

## Step 3 — Wire it into VS Code

**Recommended:** run **MyST: Configure Zotero Citations** from the Command Palette
(or accept the one-time prompt in a MyST workspace). It writes the correct URL to
`.vscode/settings.json` and lets you pick the citation role.

**Manual alternative (reliable on WSL/remote):** set it in the JSON directly.
1. `Ctrl+Shift+P` → **"Preferences: Open User Settings (JSON)"** (or workspace
   settings).
2. Add, inside the top-level `{ }`:
   ```json
   "zotero-citation-picker.port": "http://127.0.0.1:23119/better-bibtex/cayw?format=eta&template=%7Bcite%7D%60%3C%25%3D%20it.items.map(i%20%3D%3E%20i.citationKey).join('%2C')%20%25%3E%60"
   ```
3. **Save the file.** (The setting only takes effect once written to disk.)

*(Despite the name "port", this field holds the entire URL — verified in the
extension source.)*

Then:
4. Open any `.md` file, put the cursor where you want a citation.
5. Run the picker: **`Alt+Shift+Z`** (or Command Palette → "Zotero Citation Picker").
6. **Pick a reference and press Enter** — don't press Escape (see Troubleshooting).

**✅ Expected:** `` {cite}`key` `` is inserted at your cursor.

### Troubleshooting — "could not connect to Zotero. Are you sure it is running?"

This message is **misleading**: the extension shows it on *any* failure, not just
a down server (a single `catch` wraps every error). If `curl`/Step 2 worked,
Zotero is fine. The real causes are:

- **The setting never saved.** Check that your User/workspace settings JSON
  actually contains the `zotero-citation-picker.port` line. If the key is absent,
  the extension silently falls back to its default (`...?format=pandoc`) and your
  eta URL is never used.
- **You pressed Escape in the picker.** Cancelling the Zotero popup makes CAYW
  return a non-2xx status; the extension's HTTP client rejects, producing the
  *exact same* "could not connect" error even though Zotero is reachable. Re-run
  and press **Enter** on a selection.

---

## Step 4 — Make the citation resolve (render a reference list)

Inserting `` {cite}`key` `` is only half the job — the key must resolve against a
bibliography for a reference list to appear.

1. Provide a `.bib` file whose entry keys **match** the inserted citekeys.
   Keep it in sync with Zotero via **Better BibTeX auto-export**: right-click the
   collection → Export → format **Better BibTeX** → check **"Keep updated"** →
   point it at e.g. `references.bib`.
2. Register it in `myst.yml`:
   ```yaml
   project:
     bibliography:
       - references.bib
   ```
3. Build/preview: `jupyter book start` (or `uv run jupyter book start`).

**Gotchas** (see also [`RESEARCH.md`](./RESEARCH.md) Phase 1):
- **mystmd ≠ old Jupyter Book** — no `{bibliography}` directive, no
  `bibtex_bibfiles`. The reference list is injected by the **theme**, per-page,
  only for works actually cited.
- **Stale `_build/` lies** — after editing `references.bib`/`myst.yml`,
  `rm -rf _build` before restarting.
- **Verify without HTML:** after `jupyter book build --html`, inspect
  `_build/site/content/<page>.json` → `references.cite.order`. A resolved cite has
  `error: None` and an integer `enumerator`; an unresolved key is where the
  citation "means nothing."

---

## Note on citation roles

One saved URL = one role. The **MyST: Configure Zotero Citations** command lets
you pick `{cite}` / `{cite:p}` / `{cite:t}` and re-run to switch. The three
template URLs are in [`citation-recipe.md`](./citation-recipe.md).
