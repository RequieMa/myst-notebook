# Publishing checklist

Steps to complete before running `npx @vscode/vsce publish`.

---

## 1. Publisher account

1. Go to https://marketplace.visualstudio.com/manage
2. Sign in with the Microsoft account you want to publish under.
3. Click **Create publisher** if you don't have one.
4. Choose a publisher ID (this becomes the `"publisher"` field in `package.json`). It cannot be changed after publishing.
5. Update `package.json` → `"publisher"` to match your publisher ID.

---

## 2. Personal Access Token (PAT)

1. Go to https://dev.azure.com → your organisation → **User settings** → **Personal access tokens**.
2. Click **New Token**.
   - Name: anything (e.g. `vsce-publish`)
   - Organisation: **All accessible organisations**
   - Scopes: **Marketplace → Manage** (custom scope)
3. Copy the token — you won't see it again.
4. Run `npx @vscode/vsce login <your-publisher-id>` and paste the token when prompted.

---

## 3. Icon

The Marketplace requires a square PNG icon (128×128 or 256×256).

1. Create or export your icon as `icon.png` at the repo root (`myst-notebook/icon.png`).
2. The `package.json` already has `"icon": "icon.png"` — nothing else to change.
3. Make sure `icon.png` is **not** in `.vscodeignore` (it isn't by default).

Suggested style: dark background (#1e1e2e matches the gallery banner), white/light MyST or notebook symbol.

---

## 4. GitHub repository

1. Create a public repository at https://github.com/new (e.g. `RequieMa/myst-notebook`).
2. From the repo root:
   ```bash
   git remote add origin https://github.com/<your-username>/myst-notebook.git
   git push -u origin main
   ```
3. The `package.json` already has `"repository": { "url": "https://github.com/RequieMa/myst-notebook.git" }` — update the URL if your username differs.

---

## 5. Final check before publish

```bash
# From myst-notebook/
npm test                        # all tests pass
npx tsc --noEmit                # no type errors
npx @vscode/vsce package        # .vsix builds cleanly, inspect the file list
```

Inspect the packaged file list printed by `vsce package` — confirm `icon.png`, `README.md`, `CHANGELOG.md`, and `dist/` are included, and `node_modules/`, `src/`, `docs/` are excluded.

---

## 6. Publish

```bash
npx @vscode/vsce publish
```

Or publish a specific version bump:

```bash
npx @vscode/vsce publish minor   # bumps 0.0.1 → 0.1.0
npx @vscode/vsce publish patch   # bumps 0.0.1 → 0.0.2
```

After publishing, the listing appears at:
`https://marketplace.visualstudio.com/items?itemName=<publisher-id>.myst-notebook`
