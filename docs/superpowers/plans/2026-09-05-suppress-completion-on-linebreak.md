# Suppress Completion on LaTeX Line Break Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user types a LaTeX `\\` line break inside math, the `\` completion list hides instead of staying open (so Tab/Enter no longer swallows the line break).

**Architecture:** A pure `src/core/mathCompletion.ts` module (no VS Code imports) decides whether to suppress completion from the line prefix. `src/mathCompletion.ts` calls it right after computing the line prefix and returns `undefined` (which closes/hides the completion widget) when suppression applies.

**Tech Stack:** TypeScript, VS Code CompletionItemProvider, vitest.

**Spec:** Approved in-chat design (bounded task — no separate spec file). Key decisions captured in Global Constraints below.

## Global Constraints

- VS Code ≥ 1.85.
- Suppression rule: suppress when the line prefix ends with an **even** number (> 0) of backslashes — i.e. the just-typed `\` is the second of a `\\` pair (a line break). Odd counts (1, 3, …) keep completion open (command start).
- Return `undefined` (not an empty array) from `provideCompletionItems` to hide the completion widget.
- Pure logic lives in `src/core/mathCompletion.ts` (no imports). Wiring lives in `src/mathCompletion.ts`.

---

### Task 1: Pure suppression helper

**Files:**
- Create: `src/core/mathCompletion.ts`
- Test: `src/core/mathCompletion.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `shouldSuppressMathCompletion(linePrefix: string): boolean` (from `src/core/mathCompletion.ts`).

- [ ] **Step 1: Write the failing test**

Create `src/core/mathCompletion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldSuppressMathCompletion } from './mathCompletion';

describe('shouldSuppressMathCompletion', () => {
  it('does not suppress for a single backslash (command start)', () => {
    expect(shouldSuppressMathCompletion('a \\')).toBe(false);
  });

  it('suppresses for a double backslash (line break)', () => {
    expect(shouldSuppressMathCompletion('a \\\\')).toBe(true);
  });

  it('does not suppress for a triple backslash (break + command)', () => {
    expect(shouldSuppressMathCompletion('a \\\\\\')).toBe(false);
  });

  it('suppresses for a quadruple backslash (two breaks)', () => {
    expect(shouldSuppressMathCompletion('a \\\\\\\\')).toBe(true);
  });

  it('does not suppress when the prefix has no backslash', () => {
    expect(shouldSuppressMathCompletion('x^2 + y^2')).toBe(false);
  });

  it('does not suppress when the prefix ends with other text', () => {
    expect(shouldSuppressMathCompletion('a \\alpha')).toBe(false);
  });

  it('does not suppress for an empty prefix', () => {
    expect(shouldSuppressMathCompletion('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/mathCompletion.test.ts`
Expected: FAIL — `Cannot find module './mathCompletion'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/core/mathCompletion.ts`:

```ts
/** Math-completion behavior helpers. Pure module — no VS Code imports. */

/**
 * True when the line prefix ends with an even number (> 0) of backslashes —
 * i.e. the user just typed a LaTeX `\\` line break. Completion should be
 * suppressed so Tab/Enter doesn't swallow the line break.
 */
export function shouldSuppressMathCompletion(linePrefix: string): boolean {
  const m = /\\+$/.exec(linePrefix);
  const count = m ? m[0].length : 0;
  return count > 0 && count % 2 === 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/mathCompletion.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/mathCompletion.ts src/core/mathCompletion.test.ts
git commit -m "feat: pure math-completion suppression helper with tests"
```

---

### Task 2: Wire the suppression check into the provider

**Files:**
- Modify: `src/mathCompletion.ts` (one import + one early-return check)

**Interfaces:**
- Consumes (from Task 1): `shouldSuppressMathCompletion`.

- [ ] **Step 1: Add the import**

In `src/mathCompletion.ts`, add after the existing imports:

```ts
import { shouldSuppressMathCompletion } from './core/mathCompletion';
```

- [ ] **Step 2: Add the early return**

In `provideCompletionItems`, locate:

```ts
    const line = document.lineAt(position).text;
    const linePrefix = line.slice(0, position.character);
    const lastBackslash = linePrefix.lastIndexOf('\\');
```

Insert the suppression check between `linePrefix` and `lastBackslash`:

```ts
    const line = document.lineAt(position).text;
    const linePrefix = line.slice(0, position.character);
    if (shouldSuppressMathCompletion(linePrefix)) return undefined;
    const lastBackslash = linePrefix.lastIndexOf('\\');
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS — no type errors.

- [ ] **Step 4: Build + unit tests**

Run: `npm run build` then `npm test`
Expected: PASS — esbuild succeeds; all tests green including `src/core/mathCompletion.test.ts` (7 tests).

- [ ] **Step 5: F5 smoke check**

Expected behavior:
1. In a MyST Notebook markup cell, type `$\alpha$` — typing `\` opens the completion list; picking `\alpha` works.
2. In a `$$...$$` block, type `a \\ b` — after the first `\`, the list opens; after typing the second `\` (`\\`), the completion list **hides**; pressing Tab or Enter inserts a literal tab/newline rather than completing.
3. Type `a \\ \alpha` (break followed by a command) — the `\` before `\alpha` re-opens the list and `\alpha` completes normally.

- [ ] **Step 6: Commit**

```bash
git add src/mathCompletion.ts
git commit -m "fix: hide math completion after LaTeX line break (double backslash)"
```
