---
name: package-json-restraint
description: Do not modify package.json unless absolutely necessary
metadata:
  type: feedback
---

Do not modify `package.json` (dependencies, scripts, version bumps) unless there is a clear, unavoidable reason. Prefer other solutions first. When a change is truly necessary, explain why before making it.

**Why:** The user wants to keep dependency footprint and script surface minimal. Adding packages adds maintenance burden; modifying scripts can break CI/release flows.

**How to apply:** Before touching package.json, ask: can this be done without it? If `vsce` can be run via `npx`, prefer that over adding it as a devDependency. If a script is only run manually, document it in CLAUDE.md instead of adding to package.json.
