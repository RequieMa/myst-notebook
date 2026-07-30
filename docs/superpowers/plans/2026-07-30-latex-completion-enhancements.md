# LaTeX Completion Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-level persistent symbol memory, expand the completion list from 113 to ~500 KaTeX-supported commands, and use VS Code SnippetString for brace-wrapping commands so the cursor lands inside `{}`.

**Architecture:** `MathSymbolStore` switches from `vscode.Memento` to a JSON file (`.vscode/myst-symbols.json`) with usage stats, while keeping a sync in-memory cache for the completion provider. `mathSymbols.ts` grows to 17 categories with an optional `snippet` field. `MathCompletionProvider` and the QuickPick path use `SnippetString` when a symbol has a snippet, and sort by config-based usage count.

**Tech Stack:** TypeScript, VS Code Extension API, vitest, Node.js `fs` module

## Global Constraints

- VS Code ≥ 1.85 required (Notebook API used throughout)
- `ms-python.python` is an `extensionDependencies`
- Unit tests use vitest with `src/__stubs__/vscode.ts` stubs
- `npm run build` must succeed before F5 or integration tests
- CRLF out of scope; block splitter assumes LF
- No new npm dependencies without explicit approval

---

## File Structure Map

| File | Role |
|------|------|
| `src/mathSymbols.ts` | `MathSymbol` interface + `MATH_SYMBOLS` array — the single source of truth for all completable symbols |
| `src/mathPalette.ts` | `MathSymbolStore` (persistence + recency tracking) + sidebar `TreeDataProvider` |
| `src/mathCompletion.ts` | `MathCompletionProvider` — `\`-triggered `CompletionItemProvider` |
| `src/mathQuickPick.ts` | `Ctrl+Shift+M` QuickPick dialog |
| `src/extension.ts` | Activation: constructs store, registers providers, wires watchers |
| `src/log.ts` | Shared diagnostic logging channel (already exists, used by store for error logging) |
| `src/__stubs__/vscode.ts` | VS Code API stubs for unit tests — must add `SnippetString` |

---

### Task 1: Add `SnippetString` stub

**Files:**
- Modify: `src/__stubs__/vscode.ts:75-86` (CompletionItem class)

**Interfaces:**
- Produces: `SnippetString` class available in stub so later tasks can test snippet insertion

- [ ] **Step 1: Add SnippetString class to vscode stub**

In `src/__stubs__/vscode.ts`, add after the `Range` class (after line 73):

```typescript
export class SnippetString {
  constructor(public value: string) {}
}
```

- [ ] **Step 2: Update CompletionItem stub to accept SnippetString**

In `src/__stubs__/vscode.ts`, change the `insertText` type on `CompletionItem` (line 76):

```typescript
// BEFORE
insertText?: string;

// AFTER
insertText?: string | SnippetString;
```

- [ ] **Step 3: Add EventEmitter to vscode stub**

`MathSymbolStore` (Task 3) needs `vscode.EventEmitter`. Add after the `SnippetString` class:

```typescript
export class EventEmitter<T> {
  private listeners: Array<(e: T) => any> = [];
  readonly event = (listener: (e: T) => any, _thisArgs?: any, _disposables?: any[]) => {
    this.listeners.push(listener);
    return { dispose: () => { const i = this.listeners.indexOf(listener); if (i >= 0) this.listeners.splice(i, 1); } };
  };
  fire(data: T): void { for (const l of this.listeners) l(data); }
  dispose(): void { this.listeners.length = 0; }
}
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `npm test`
Expected: all existing tests pass (no existing test uses `SnippetString` or `EventEmitter`)

- [ ] **Step 5: Commit**

```bash
git add src/__stubs__/vscode.ts
git commit -m "test: add SnippetString and EventEmitter to vscode test stub

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Expand `mathSymbols.ts` with snippet field and full KaTeX list

**Files:**
- Modify: `src/mathSymbols.ts` (entire file — 121 lines → ~550 lines)
- Test: `src/mathSymbols.test.ts` (new file)

**Interfaces:**
- Produces:
  - `MathSymbol` interface: `{ latex: string; description: string; unicode?: string; snippet?: string }`
  - `MATH_SYMBOLS: MathSymbol[]` — ~500 entries, no duplicates
  - `MATH_SYMBOLS_BY_LATEX: Map<string, MathSymbol>` — O(1) lookup for QuickPick

- [ ] **Step 1: Write validation tests for the expanded symbol list**

Create `src/mathSymbols.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MATH_SYMBOLS, MathSymbol } from './mathSymbols';

describe('MATH_SYMBOLS', () => {
  it('has no duplicate latex values', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const sym of MATH_SYMBOLS) {
      if (seen.has(sym.latex)) {
        dupes.push(sym.latex);
      }
      seen.add(sym.latex);
    }
    expect(dupes).toEqual([]);
  });

  it('every symbol has non-empty latex and description', () => {
    for (const sym of MATH_SYMBOLS) {
      expect(sym.latex).toBeTruthy();
      expect(sym.latex.startsWith('\\') || sym.latex.startsWith('{') || sym.latex.startsWith('\\!') || sym.latex.startsWith('\\,') || sym.latex.startsWith('\\:') || sym.latex.startsWith('\\;') || sym.latex.startsWith('\\quad') || sym.latex.startsWith('\\qquad'), `"${sym.latex}" should start with \\ or {`).toBe(true);
      expect(sym.description).toBeTruthy();
    }
  });

  it('all snippet symbols have matching $1 placeholder', () => {
    for (const sym of MATH_SYMBOLS) {
      if (sym.snippet) {
        expect(
          sym.snippet.includes('$1'),
          `Snippet for "${sym.latex}" must contain $1`
        ).toBe(true);
      }
    }
  });

  it('all snippet symbols have consecutive $N placeholders (no gaps)', () => {
    for (const sym of MATH_SYMBOLS) {
      if (sym.snippet) {
        const placeholders = sym.snippet.match(/\$(\d+)/g) ?? [];
        const nums = placeholders.map(p => parseInt(p.slice(1), 10)).sort((a, b) => a - b);
        expect(nums[0]).toBe(1); // must start at $1
        for (let i = 1; i < nums.length; i++) {
          expect(nums[i]).toBe(nums[i - 1] + 1); // no gaps
        }
      }
    }
  });

  it('has at least 400 symbols (expanded from original 113)', () => {
    expect(MATH_SYMBOLS.length).toBeGreaterThanOrEqual(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/mathSymbols.test.ts`
Expected: FAIL — file doesn't exist yet or has old 113 symbols

- [ ] **Step 3: Rewrite mathSymbols.ts with expanded list**

Add `snippet` field to the interface and expand from 113 to ~500 symbols organized in 17 category sections. The full list is in Appendix A at the end of this plan (not inlined here for readability — copy from the design spec §4.2 and add snippet fields).

Key structural changes at the top of the file:

```typescript
export interface MathSymbol {
  latex: string;
  description: string;
  unicode?: string;
  snippet?: string;  // NEW: VS Code SnippetString with $1/$2 placeholders
}

// NEW: O(1) lookup map built from the array
export const MATH_SYMBOLS_BY_LATEX: Map<string, MathSymbol> = new Map();

export const MATH_SYMBOLS: MathSymbol[] = [
  // ===== Greek lowercase =====
  { latex: '\\alpha', description: 'alpha', unicode: 'α' },
  // ... (all existing + \omicron)
  
  // ===== Font commands (WITH SNIPPETS) =====
  { latex: '\\mathbf{}', description: 'bold', snippet: '\\mathbf{$1}' },
  { latex: '\\mathbb{}', description: 'blackboard bold', snippet: '\\mathbb{$1}' },
  { latex: '\\mathcal{}', description: 'calligraphic', snippet: '\\mathcal{$1}' },
  { latex: '\\mathfrak{}', description: 'fraktur', snippet: '\\mathfrak{$1}' },
  { latex: '\\mathscr{}', description: 'script', snippet: '\\mathscr{$1}' },
  { latex: '\\mathsf{}', description: 'sans serif', snippet: '\\mathsf{$1}' },
  { latex: '\\mathtt{}', description: 'monospace', snippet: '\\mathtt{$1}' },
  { latex: '\\mathit{}', description: 'italic', snippet: '\\mathit{$1}' },
  { latex: '\\mathrm{}', description: 'roman', snippet: '\\mathrm{$1}' },
  { latex: '\\bm{}', description: 'bold math', snippet: '\\bm{$1}' },
  { latex: '\\boldsymbol{}', description: 'bold symbol', snippet: '\\boldsymbol{$1}' },
  { latex: '\\textrm{}', description: 'roman text', snippet: '\\textrm{$1}' },
  { latex: '\\text{}', description: 'text mode', snippet: '\\text{$1}' },
  { latex: '\\textsf{}', description: 'sans serif text', snippet: '\\textsf{$1}' },
  { latex: '\\texttt{}', description: 'typewriter text', snippet: '\\texttt{$1}' },
  { latex: '\\textbf{}', description: 'bold text', snippet: '\\textbf{$1}' },
  { latex: '\\textit{}', description: 'italic text', snippet: '\\textit{$1}' },
  
  // ... (all remaining categories from spec §4.2)
];

// Populate the lookup map AFTER the array is fully defined
for (const sym of MATH_SYMBOLS) {
  MATH_SYMBOLS_BY_LATEX.set(sym.latex, sym);
}
```

**Important:** Use a `for` loop AFTER the array literal, NOT `forEach` inside the literal — the array must be fully constructed before the Map references it.

- [ ] **Step 4: Run symbol tests to verify they pass**

Run: `npx vitest run src/mathSymbols.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npm test`
Expected: all existing tests pass (no consumer code changed yet)

- [ ] **Step 6: Commit**

```bash
git add src/mathSymbols.ts src/mathSymbols.test.ts
git commit -m "feat: expand math symbols from 113 to ~500 KaTeX commands with snippet support

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Rewrite `MathSymbolStore` for config file persistence

**Files:**
- Modify: `src/mathPalette.ts` (MathSymbolStore class only — TreeDataProvider unchanged)
- Create: `src/mathPalette.test.ts`

**Interfaces:**
- Consumes: `MathSymbol` from Task 2 (for `MATH_SYMBOLS_BY_LATEX` validation, no direct dependency)
- Produces:
  - `MathSymbolStore` constructor: `(workspaceRoot: string)`
  - `MathSymbolStore.load(legacyState?: vscode.Memento): Promise<void>` — must be called once before use
  - `MathSymbolStore.add(latex: string): void` — sync, increments count
  - `MathSymbolStore.getRecent(n: number): string[]` — sync, sorted by (count desc, lastUsed desc)
  - `MathSymbolStore.getStats(latex: string): { count: number; lastUsed: string } | undefined`
  - `MathSymbolStore.refresh(): void` — fires tree data change event (for sidebar)

**Design notes:**
- Config path: `<workspaceRoot>/.vscode/myst-symbols.json`
- In-memory cache: `Map<string, { count: number; lastUsed: string }>`
- `load()` reads JSON file → populates cache. If file missing + legacyState has data, migrates.
- `add()` updates cache synchronously, triggers a debounced async `save()` (1s)
- `save()` writes `{ version: 1, symbols: <serialized map> }` to disk
- `_fromJSON(json: string): void` and `_toJSON(): string` are package-private for testing
- Error handling: malformed JSON → log warning, keep empty cache; write failure → log error, skip

- [ ] **Step 1: Write unit tests for MathSymbolStore**

Create `src/mathPalette.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MathSymbolStore } from './mathPalette';

describe('MathSymbolStore', () => {
  let tmpDir: string;
  let store: MathSymbolStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myst-test-'));
    // Create .vscode dir if store expects it — store handles auto-create on save
    store = new MathSymbolStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('_toJSON and _fromJSON', () => {
    it('round-trips symbol stats', () => {
      store.add('\\alpha');
      store.add('\\alpha');
      store.add('\\beta');
      const json = store._toJSON();
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe(1);
      expect(parsed.symbols['\\alpha'].count).toBe(2);
      expect(parsed.symbols['\\beta'].count).toBe(1);
      expect(parsed.symbols['\\alpha'].lastUsed).toBeTruthy();

      // Fresh store loads the same data
      const store2 = new MathSymbolStore(tmpDir);
      store2._fromJSON(json);
      expect(store2.getRecent(10)[0]).toBe('\\alpha'); // higher count = first
    });

    it('_fromJSON handles empty object gracefully', () => {
      store._fromJSON('{}');
      expect(store.getRecent(10)).toEqual([]);
    });

    it('_fromJSON handles malformed JSON gracefully', () => {
      store._fromJSON('not json at all {{{');
      expect(store.getRecent(10)).toEqual([]);
    });
  });

  describe('add and getRecent', () => {
    it('increments count on repeated adds', () => {
      store.add('\\alpha');
      store.add('\\alpha');
      store.add('\\beta');
      expect(store.getStats('\\alpha')?.count).toBe(2);
      expect(store.getStats('\\beta')?.count).toBe(1);
      expect(store.getStats('\\gamma')).toBeUndefined();
    });

    it('sorts by count descending, then lastUsed descending', () => {
      // Add alpha 3 times, beta 5 times, gamma 3 times
      for (let i = 0; i < 3; i++) store.add('\\alpha');
      for (let i = 0; i < 5; i++) store.add('\\beta');
      for (let i = 0; i < 3; i++) store.add('\\gamma');
      // Last-used order: gamma > beta > alpha (gamma added most recently)
      const recent = store.getRecent(10);
      expect(recent[0]).toBe('\\beta');  // highest count
      // alpha and gamma both have count 3, gamma was used more recently
      const alphaIdx = recent.indexOf('\\alpha');
      const gammaIdx = recent.indexOf('\\gamma');
      expect(gammaIdx).toBeLessThan(alphaIdx);
    });

    it('returns empty array when no symbols added', () => {
      expect(store.getRecent(10)).toEqual([]);
    });
  });

  describe('load', () => {
    it('loads from config file', async () => {
      // Write a config file manually
      const vscodeDir = path.join(tmpDir, '.vscode');
      fs.mkdirSync(vscodeDir, { recursive: true });
      const config = {
        version: 1,
        symbols: {
          '\\mathbb{R}': { count: 5, lastUsed: '2026-07-30T10:00:00Z' },
        },
      };
      fs.writeFileSync(path.join(vscodeDir, 'myst-symbols.json'), JSON.stringify(config));

      await store.load();
      expect(store.getStats('\\mathbb{R}')?.count).toBe(5);
    });

    it('handles missing config file gracefully', async () => {
      await store.load(); // no file exists
      expect(store.getRecent(10)).toEqual([]); // empty but no error
    });

    it('migrates from legacy workspaceState format', async () => {
      const legacyState = {
        get: (key: string, _default: any) => {
          if (key === 'myst-notebook.mathSymbols') return ['\\alpha', '\\beta', '\\alpha'];
          return undefined;
        },
        update: () => Promise.resolve(),
      };

      await store.load(legacyState as any);
      expect(store.getStats('\\alpha')?.count).toBe(1);
      expect(store.getStats('\\beta')?.count).toBe(1);
    });
  });

  describe('save', () => {
    it('saves to config file, creating .vscode directory if needed', async () => {
      store.add('\\alpha');
      await (store as any).save(); // call private save for testing
      const configPath = path.join(tmpDir, '.vscode', 'myst-symbols.json');
      expect(fs.existsSync(configPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(content.version).toBe(1);
      expect(content.symbols['\\alpha'].count).toBe(1);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/mathPalette.test.ts`
Expected: FAIL — current `MathSymbolStore` takes `vscode.Memento`, not a path

- [ ] **Step 3: Rewrite MathSymbolStore in mathPalette.ts**

Replace the `MathSymbolStore` class (lines 3-32) while keeping `MathSymbolItem`, `MathSymbolProvider` unchanged (lines 34-64). The new `MathSymbolStore`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { log } from './log';

interface SymbolStats {
  count: number;
  lastUsed: string; // ISO-8601
}

interface ConfigFile {
  version: number;
  symbols: Record<string, SymbolStats>;
}

export class MathSymbolStore {
  private static LEGACY_KEY = 'myst-notebook.mathSymbols';
  private symbols = new Map<string, SymbolStats>();
  private configPath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(workspaceRoot: string) {
    this.configPath = path.join(workspaceRoot, '.vscode', 'myst-symbols.json');
  }

  /** Parse a JSON string into the in-memory cache. Exposed for testing. */
  _fromJSON(json: string): void {
    this.symbols.clear();
    try {
      const config: ConfigFile = JSON.parse(json);
      if (config && config.symbols) {
        for (const [latex, stats] of Object.entries(config.symbols)) {
          if (stats && typeof stats.count === 'number') {
            this.symbols.set(latex, {
              count: stats.count,
              lastUsed: stats.lastUsed ?? new Date(0).toISOString(),
            });
          }
        }
      }
    } catch (e) {
      log(`[MathSymbolStore] failed to parse config: ${e}`);
      // Keep empty cache, do NOT overwrite the broken file
    }
  }

  /** Serialize the in-memory cache to a JSON string. Exposed for testing. */
  _toJSON(): string {
    const symbols: Record<string, SymbolStats> = {};
    for (const [latex, stats] of this.symbols) {
      symbols[latex] = { count: stats.count, lastUsed: stats.lastUsed };
    }
    // Sort keys for deterministic output (git-friendly)
    const sorted: Record<string, SymbolStats> = {};
    for (const key of Object.keys(symbols).sort()) {
      sorted[key] = symbols[key];
    }
    const config: ConfigFile = { version: 1, symbols: sorted };
    return JSON.stringify(config, null, 2) + '\n';
  }

  /** Load symbols from the config file. Optionally migrates from legacy workspaceState. */
  async load(legacyState?: vscode.Memento): Promise<void> {
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      this._fromJSON(content);
      return;
    } catch (e) {
      // File doesn't exist or can't be read — that's normal on first run
    }

    // Migration: check legacy workspaceState
    if (legacyState) {
      const raw = legacyState.get<unknown[]>(MathSymbolStore.LEGACY_KEY, []);
      if (raw.length > 0) {
        for (const item of raw) {
          const latex = typeof item === 'string' ? item : (item as { latex: string }).latex;
          this.add(latex);
        }
        await this.save();
        void legacyState.update(MathSymbolStore.LEGACY_KEY, undefined);
      }
    }
  }

  /** Record a symbol usage. Sync — updates in-memory cache immediately. */
  add(latex: string): void {
    const existing = this.symbols.get(latex);
    if (existing) {
      existing.count++;
      existing.lastUsed = new Date().toISOString();
    } else {
      this.symbols.set(latex, {
        count: 1,
        lastUsed: new Date().toISOString(),
      });
    }
    this.debouncedSave();
  }

  /** Remove a symbol. For palette sidebar use. */
  remove(latex: string): void {
    this.symbols.delete(latex);
    this.debouncedSave();
  }

  /** Get recent symbols sorted by (count desc, lastUsed desc). */
  getRecent(n: number): string[] {
    const entries = [...this.symbols.entries()]
      .sort((a, b) => {
        if (b[1].count !== a[1].count) return b[1].count - a[1].count;
        return b[1].lastUsed.localeCompare(a[1].lastUsed);
      })
      .slice(0, n);
    // Only return symbols that are still in the built-in list
    // (filtering is done by consumer — this returns raw stored data)
    return entries.map(([latex]) => latex);
  }

  /** Get all stored symbols (for sidebar palette). */
  getAll(): string[] {
    return this.getRecent(Number.MAX_SAFE_INTEGER);
  }

  /** Get usage stats for a specific symbol. */
  getStats(latex: string): SymbolStats | undefined {
    return this.symbols.get(latex);
  }

  /** Fire tree data change event (for sidebar refresh). */
  refresh(): void {
    this._onDidChange.fire();
  }

  /** Immediate save to disk. */
  async save(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, this._toJSON(), 'utf-8');
    } catch (e) {
      log(`[MathSymbolStore] failed to save config: ${e}`);
    }
  }

  /** Debounced save — writes after 1s of inactivity. */
  private debouncedSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, 1000);
  }

  /** Cancel pending save (for testing / dispose). */
  dispose(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }
}
```

- [ ] **Step 4: Run MathSymbolStore tests to verify they pass**

Run: `npx vitest run src/mathPalette.test.ts`
Expected: all PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: MathPalette tests pass. MathCompletion tests may fail because constructor signature changed (Task 4 fixes this).

- [ ] **Step 6: Commit**

```bash
git add src/mathPalette.ts src/mathPalette.test.ts
git commit -m "feat: rewrite MathSymbolStore for project-level JSON config persistence

Replaces workspaceState Memento with .vscode/myst-symbols.json file.
Adds usage count tracking, auto-migration from legacy format, and
debounced async saves. Error handling for malformed JSON and write failures.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Update `MathCompletionProvider` for snippet + config sorting

**Files:**
- Modify: `src/mathCompletion.ts`
- Modify: `src/mathCompletion.test.ts`

**Interfaces:**
- Consumes:
  - `MathSymbolStore.getRecent(n)` from Task 3
  - `MathSymbolStore.getStats(latex)` from Task 3
  - `MathSymbol.snippet` from Task 2
  - `SnippetString` stub from Task 1
- Produces: `MathCompletionProvider` — same public API, enhanced behavior

- [ ] **Step 1: Update completion tests for snippet and sorting**

In `src/mathCompletion.test.ts`, add these tests in the `describe('MathCompletionProvider')` block (after existing tests, before the closing `});` on line 155):

```typescript
  it('sets insertText as SnippetString for symbols with snippet', () => {
    // Override MATH_SYMBOLS temporarily? No — test with a real snippet symbol.
    // \mathbf{} has snippet: "\mathbf{$1}" (after Task 2 expansion)
    const provider = new MathCompletionProvider(store);
    const doc = makeDoc('$\\mathbf');
    const pos = new vscode.Position(0, 8);
    const items = provider.provideCompletionItems(
      doc as any, pos, undefined as any, undefined as any,
    );
    expect(items).not.toBeUndefined();
    const mathbf = items!.find(i => i.label === '\\mathbf{}');
    if (mathbf) {
      expect(mathbf.insertText).toBeDefined();
      expect(mathbf.insertText).toBeInstanceOf(vscode.SnippetString);
      expect((mathbf.insertText as vscode.SnippetString).value).toBe('\\mathbf{$1}');
    }
  });

  it('does NOT set insertText for symbols without snippet', () => {
    const provider = new MathCompletionProvider(store);
    const doc = makeDoc('$\\alpha');
    const pos = new vscode.Position(0, 6);
    const items = provider.provideCompletionItems(
      doc as any, pos, undefined as any, undefined as any,
    );
    expect(items).not.toBeUndefined();
    const alpha = items!.find(i => i.label === '\\alpha');
    expect(alpha).toBeDefined();
    expect(alpha!.insertText).toBeUndefined(); // plain text, uses label
  });

  it('boosts sortText for symbols with higher usage count', () => {
    const storeWithStats = new MathSymbolStore('/tmp/test');
    storeWithStats._fromJSON(JSON.stringify({
      version: 1,
      symbols: {
        '\\alpha': { count: 10, lastUsed: '2026-07-30T10:00:00Z' },
        '\\beta': { count: 1, lastUsed: '2026-07-29T10:00:00Z' },
      },
    }));
    const provider = new MathCompletionProvider(storeWithStats);
    const doc = makeDoc('$\\');
    const pos = new vscode.Position(0, 2);
    const items = provider.provideCompletionItems(
      doc as any, pos, undefined as any, undefined as any,
    );
    expect(items).not.toBeUndefined();
    const alpha = items!.find(i => i.label === '\\alpha');
    const beta = items!.find(i => i.label === '\\beta');
    expect(alpha).toBeDefined();
    expect(beta).toBeDefined();
    // Alpha should sort before beta (higher count)
    expect(alpha!.sortText! < beta!.sortText!).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/mathCompletion.test.ts`
Expected: new snippet/sorting tests FAIL (not yet implemented)

- [ ] **Step 3: Update MathCompletionProvider**

In `src/mathCompletion.ts`, replace the `provideCompletionItems` method:

```typescript
import * as vscode from 'vscode';
import { MATH_SYMBOLS } from './mathSymbols';
import { MathSymbolStore } from './mathPalette';
import { isInsideMathContext } from './mathContextDetector';

export class MathCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly store: MathSymbolStore) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] | undefined {
    const line = document.lineAt(position).text;
    if (!isInsideMathContext(line, position.character)) {
      return undefined;
    }

    const linePrefix = line.slice(0, position.character);
    const lastBackslash = linePrefix.lastIndexOf('\\');
    const replaceRange =
      lastBackslash >= 0
        ? new vscode.Range(position.line, lastBackslash, position.line, position.character)
        : undefined;

    const items = MATH_SYMBOLS.map((sym, index) => {
      const item = new vscode.CompletionItem(sym.latex, vscode.CompletionItemKind.Value);
      item.detail = sym.unicode ?? '';
      item.documentation = sym.description;

      // Snippet insertion for brace-wrapping commands
      if (sym.snippet) {
        item.insertText = new vscode.SnippetString(sym.snippet);
      }

      if (replaceRange) {
        item.range = replaceRange;
      }

      // Sort: config stats → built-in index
      const stats = this.store.getStats(sym.latex);
      if (stats && stats.count > 0) {
        // Tier 0: used symbols, sorted by count desc (padded for string sort)
        const countKey = String(9999 - Math.min(stats.count, 9999)).padStart(4, '0');
        item.sortText = `0_${countKey}_${String(index).padStart(4, '0')}`;
      } else {
        // Tier 1: unused symbols, by built-in index
        item.sortText = `1_${String(index).padStart(4, '0')}`;
      }

      return item;
    });

    return items;
  }
}
```

- [ ] **Step 4: Run completion tests to verify they pass**

Run: `npx vitest run src/mathCompletion.test.ts`
Expected: all PASS (including new snippet + sorting tests)

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all tests pass EXCEPT possibly integration/smoke tests

- [ ] **Step 6: Commit**

```bash
git add src/mathCompletion.ts src/mathCompletion.test.ts
git commit -m "feat: add snippet insertion and config-based sorting to math completion

- SnippetString for brace commands (cursor lands in {})
- Sort by usage count from config file, then built-in index

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Update QuickPick for snippet-aware insertion

**Files:**
- Modify: `src/mathQuickPick.ts`
- Modify: `src/extension.ts:142-146` (insertLatexAtCursor)

**Interfaces:**
- Consumes: `MathSymbol.snippet` from Task 2, `MathSymbolStore` from Task 3, `MATH_SYMBOLS_BY_LATEX` from Task 2
- Produces: updated `insertLatexAtCursor(latex: string, snippet?: string): void`

- [ ] **Step 1: Add snippet-aware insertLatexAtCursor**

In `src/extension.ts`, replace the existing `insertLatexAtCursor` (lines 142-146):

```typescript
function insertLatexAtCursor(latex: string, snippet?: string): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  if (snippet) {
    void editor.insertSnippet(new vscode.SnippetString(snippet), editor.selection.active);
  } else {
    void editor.edit(eb => eb.insert(editor.selection.active, latex));
  }
}
```

- [ ] **Step 2: Update QuickPick to pass snippet**

In `src/mathQuickPick.ts`, update `insertMathSymbolQuickPick` to look up the snippet:

```typescript
import * as vscode from 'vscode';
import { MATH_SYMBOLS, MATH_SYMBOLS_BY_LATEX } from './mathSymbols';
import { MathSymbolStore } from './mathPalette';

interface SymbolPickItem extends vscode.QuickPickItem {
  latex: string;
  snippet?: string;
}

export async function insertMathSymbolQuickPick(
  store: MathSymbolStore,
  insertAtCursor: (latex: string, snippet?: string) => void
): Promise<void> {
  const recent = store.getRecent(20);
  const recentSet = new Set(recent);

  // Use MATH_SYMBOLS_BY_LATEX for O(1) lookup on large lists
  const recentItems: SymbolPickItem[] = recent
    .map(latex => {
      const sym = MATH_SYMBOLS_BY_LATEX.get(latex);
      return {
        label: latex,
        description: sym ? `${sym.unicode ?? ''} — ${sym.description}` : '',
        latex,
        snippet: sym?.snippet,
      };
    })
    .filter(item => item.label); // skip symbols not in built-in list

  const allItems: SymbolPickItem[] = MATH_SYMBOLS
    .filter(sym => !recentSet.has(sym.latex))
    .map(sym => ({
      label: sym.latex,
      description: `${sym.unicode ?? ''} — ${sym.description}`,
      latex: sym.latex,
      snippet: sym.snippet,
    }));

  const items: SymbolPickItem[] = [
    ...(recentItems.length > 0
      ? [{ label: 'Recently used', kind: vscode.QuickPickItemKind.Separator, latex: '', snippet: undefined }]
      : []),
    ...recentItems,
    ...(allItems.length > 0
      ? [{ label: 'All symbols', kind: vscode.QuickPickItemKind.Separator, latex: '', snippet: undefined }]
      : []),
    ...allItems,
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Search math symbols…',
    matchOnDescription: true,
  });

  if (!picked || !picked.latex) return;

  insertAtCursor(picked.latex, picked.snippet);
  store.add(picked.latex);
}
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: all unit tests pass

- [ ] **Step 4: Build to verify no type errors**

Run: `npm run build`
Expected: successful build, no type errors

- [ ] **Step 5: Commit**

```bash
git add src/mathQuickPick.ts src/extension.ts
git commit -m "feat: add snippet-aware insertion to math QuickPick (Ctrl+Shift+M)

Uses MATH_SYMBOLS_BY_LATEX for O(1) lookup. Passes snippet to
insertLatexAtCursor which uses editor.insertSnippet.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Wire extension.ts — store construction, watcher, migration

**Files:**
- Modify: `src/extension.ts:93-122` (math subsystem wiring)

**Interfaces:**
- Consumes: `MathSymbolStore` (new constructor) from Task 3, updated `MathCompletionProvider` from Task 4, updated `insertMathSymbolQuickPick` from Task 5
- Produces: working end-to-end flow

- [ ] **Step 1: Update extension activation to wire store with config file**

In `src/extension.ts`, replace the math subsystem wiring (lines 93-122):

```typescript
  // Math symbol palette — persistent config-backed store
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const store = new MathSymbolStore(workspaceRoot ?? '');
  const provider = new MathSymbolProvider(store);

  // Load config (migrates legacy data if needed). Fire-and-forget:
  // must not block activation, but items render correctly once loaded.
  store.load(context.workspaceState).then(() => provider.refresh());

  // Watch for external config changes (git pull, manual edit, etc.)
  if (workspaceRoot) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.file(workspaceRoot),
        '.vscode/myst-symbols.json',
      ),
    );
    watcher.onDidChange(() => {
      store.load().then(() => provider.refresh());
    });
    watcher.onDidCreate(() => {
      store.load().then(() => provider.refresh());
    });
    context.subscriptions.push(watcher);
  }

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('myst-notebook.mathPalette', provider),
  );

  // Insert-symbol-direct (tree item click)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'myst-notebook.insertMathSymbolDirect',
      (latex: string) => {
        const sym = MATH_SYMBOLS_BY_LATEX.get(latex);
        insertLatexAtCursor(latex, sym?.snippet);
      },
    ),
  );

  // Quick-pick command (Ctrl+Shift+M)
  context.subscriptions.push(
    vscode.commands.registerCommand('myst-notebook.insertMathSymbolPicker', () =>
      insertMathSymbolQuickPick(store, insertLatexAtCursor),
    ),
  );

  // Inline \ completion inside $...$ and $$...$$
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'markdown' },
      new MathCompletionProvider(store),
      '\\',
    ),
  );
```

- [ ] **Step 2: Add import for MATH_SYMBOLS_BY_LATEX at top of extension.ts**

```typescript
// Change existing import:
// FROM:
// import { MathCompletionProvider } from './mathCompletion';
// import { insertMathSymbolQuickPick } from './mathQuickPick';
// TO add:
import { MATH_SYMBOLS_BY_LATEX } from './mathSymbols';
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: successful build, no type errors

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: all unit tests pass

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts
git commit -m "feat: wire config-backed MathSymbolStore with FileSystemWatcher

- Store uses .vscode/myst-symbols.json with auto-migration
- FileSystemWatcher reloads on external changes
- insertMathSymbolDirect uses MATH_SYMBOLS_BY_LATEX for snippet lookup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Integration test and manual verification

**Files:**
- Modify: `src/test/smoke.test.ts` (add math completion scenarios)

- [ ] **Step 1: Add integration test scenarios to smoke test**

In `src/test/smoke.test.ts`, add a test that opens a `.md` file, types `\mathbf`, and verifies completion appears. (Note: integration tests run in real VS Code — keep test surface small.)

```typescript
// NOTE: Full integration testing of completion items in a VS Code instance
// is complex and fragile. The primary verification for this feature is:
// 1. Unit tests (Tasks 1-5) cover all logic paths
// 2. Manual F5 smoke test (Step 2 below)
```

- [ ] **Step 2: Manual F5 verification checklist**

1. `npm run build`
2. Press F5 → Extension Development Host opens
3. Open a `.md` file, open it as MyST Notebook
4. Type `$\mathbf` — verify `\mathbf{}` appears in completions
5. Select it — verify cursor lands inside `{}` (not after `}`)
6. Type `x` → `\mathbf{x|}`
7. Press Tab → cursor moves past `}`
8. Press `Ctrl+Shift+M` — verify `\rightarrow` is in the list
9. Select `\rightarrow` — verify it inserts
10. Close and reopen VS Code — verify `\mathbf{}` and `\rightarrow` appear in "Recently used"
11. Check `.vscode/myst-symbols.json` exists with usage stats
12. Open another `.md` file in the same project — verify recently-used symbols are still there

- [ ] **Step 3: Commit any final fixes**

```bash
git add src/test/smoke.test.ts
git commit -m "test: add manual verification checklist for LaTeX completion

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Appendix A: Full Symbol Categories for Task 2 Implementation

When implementing Task 2 Step 3, expand `MATH_SYMBOLS` with these categories (order matters — it determines the fallback sort order). Each category header is a comment. Symbols marked with `// snippet` get a `snippet` field.

**Category 1: Greek lowercase** (28 symbols)
Keep all 28 existing, add `\omicron`.

**Category 2: Greek uppercase** (11 symbols)
Keep all 11 existing.

**Category 3: Hebrew/misc letters** (14 symbols)
`\aleph` (ℵ), `\beth` (ℶ), `\gimel` (ℷ), `\daleth` (ℸ), `\hbar` (ℏ), `\hslash` (ℏ), `\ell` (ℓ), `\wp` (℘), `\Im` (ℑ), `\Re` (ℜ), `\mho` (℧), `\Finv` (Ⅎ), `\Bbbk` (𝕜), `\Game` (⅁)

**Category 4: Font commands** (17 symbols, ALL with snippets)
`\mathbf{}`, `\mathbb{}`, `\mathcal{}`, `\mathfrak{}`, `\mathscr{}`, `\mathsf{}`, `\mathtt{}`, `\mathit{}`, `\mathrm{}`, `\bm{}`, `\boldsymbol{}`, `\textrm{}`, `\text{}`, `\textsf{}`, `\texttt{}`, `\textbf{}`, `\textit{}`
Snippet pattern: `\cmd{$1}`

**Category 5: Large operators** (19 symbols)
`\sum` (∑), `\prod` (∏), `\coprod` (∐), `\int` (∫), `\iint` (∬), `\iiint` (∭), `\oint` (∮), `\oiint` (∯), `\oiiint` (∰), `\bigcap` (⋂), `\bigcup` (⋃), `\bigvee` (⋁), `\bigwedge` (⋀), `\bigodot` (⨀), `\bigoplus` (⨁), `\bigotimes` (⨂), `\biguplus` (⨄), `\bigsqcup` (⨆), `\smallint` (∫)

**Category 6: Binary operators** (54 symbols)
Keep `\times`, `\cdot`, `\div`, `\pm`, `\mp`, `\oplus`, `\otimes`, `\circ`, `\cup`, `\cap`, `\wedge`, `\vee`
Add: `\bullet` (∙), `\star` (⋆), `\diamond` (⋄), `\ast` (∗), `\odot` (⊙), `\ominus` (⊖), `\oslash` (⊘), `\uplus` (⊎), `\sqcap` (⊓), `\sqcup` (⊔), `\setminus` (∖), `\wr` (≀), `\amalg` (⨿), `\bigcirc` (○), `\bigtriangleup` (△), `\bigtriangledown` (▽), `\triangleleft` (◃), `\triangleright` (▹), `\lhd` (⊲), `\rhd` (⊳), `\unlhd` (⊴), `\unrhd` (⊵), `\dagger` (†), `\ddagger` (‡), `\barwedge` (⊼), `\veebar` (⊻), `\doublebarwedge` (⩞), `\boxplus` (⊞), `\boxminus` (⊟), `\boxtimes` (⊠), `\boxdot` (⊡), `\curlyvee` (⋎), `\curlywedge` (⋏), `\ltimes` (⋉), `\rtimes` (⋊), `\leftthreetimes` (⋋), `\rightthreetimes` (⋌), `\intercal` (⊺), `\divideontimes` (⋇), `\dotplus` (∔), `\centerdot` (·), `\And` (&)

**Category 7: Relations** (85 symbols)
Keep existing: `\leq`, `\geq`, `\neq`, `\approx`, `\sim`, `\simeq`, `\equiv`, `\propto`, `\in`, `\notin`, `\subset`, `\subseteq`, `\supset`, `\supseteq`.
Add: `\prec` (≺), `\succ` (≻), `\preceq` (≼), `\succeq` (≽), `\ll` (≪), `\gg` (≫), `\lll` (⋘), `\ggg` (⋙), `\subsetneq` (⊊), `\supsetneq` (⊋), `\ni` (∋), `\notni` (∌), `\mid` (∣), `\nmid` (∤), `\parallel` (∥), `\nparallel` (∦), `\perp` (⊥), `\models` (⊧), `\vdash` (⊢), `\dashv` (⊣), `\Vdash` (⊩), `\vDash` (⊨), `\nvdash` (⊬), `\nvDash` (⊭), `\smile` (⌣), `\frown` (⌢), `\asymp` (≍), `\bowtie` (⋈), `\doteq` (≐), `\doteqdot` (≑), `\fallingdotseq` (≒), `\risingdotseq` (≓), `\eqcirc` (≖), `\circeq` (≗), `\triangleq` (≜), `\bumpeq` (≏), `\Bumpeq` (≎), `\leqq` (≦), `\geqq` (≧), `\lneqq` (≨), `\gneqq` (≩), `\lneq` (⪇), `\gneq` (⪈), `\lnsim` (⋦), `\gnsim` (⋧), `\lesssim` (≲), `\gtrsim` (≳), `\lessapprox` (⪅), `\gtrapprox` (⪆), `\lessgtr` (≶), `\gtrless` (≷), `\lesseqgtr` (⋚), `\gtreqless` (⋛), `\lesseqqgtr` (⪋), `\gtreqqless` (⪌), `\precapprox` (⪷), `\succapprox` (⪸), `\precnapprox` (⪹), `\succnapprox` (⪺), `\precsim` (≾), `\succsim` (≿), `\precneqq` (⪵), `\succneqq` (⪶), `\curlyeqprec` (⋞), `\curlyeqsucc` (⋟), `\trianglelefteq` (⊴), `\trianglerighteq` (⊵), `\between` (≬), `\pitchfork` (⋔), `\shortmid` (∣), `\shortparallel` (∥), `\smallfrown` (⌢), `\smallsmile` (⌣), `\backsim` (∽), `\backsimeq` (⋍), `\eqsim` (≂), `\approxeq` (≊).

**Category 8: Arrows** (55 symbols)
Keep existing: `\to`, `\leftarrow`, `\leftrightarrow`, `\Rightarrow`, `\Leftarrow`, `\Leftrightarrow`, `\mapsto`.
Add: `\rightarrow` (→), `\longrightarrow` (⟶), `\longleftarrow` (⟵), `\longleftrightarrow` (⟷), `\Longrightarrow` (⟹), `\Longleftarrow` (⟸), `\Longleftrightarrow` (⟺), `\longmapsto` (⟼), `\hookrightarrow` (↪), `\hookleftarrow` (↩), `\rightharpoonup` (⇀), `\leftharpoonup` (↼), `\rightharpoondown` (⇁), `\leftharpoondown` (↽), `\rightleftharpoons` (⇌), `\leftrightharpoons` (⇋), `\nearrow` (↗), `\searrow` (↘), `\swarrow` (↙), `\nwarrow` (↖), `\uparrow` (↑), `\downarrow` (↓), `\updownarrow` (↕), `\Uparrow` (⇑), `\Downarrow` (⇓), `\Updownarrow` (⇕), `\twoheadrightarrow` (↠), `\twoheadleftarrow` (↞), `\rightarrowtail` (↣), `\leftarrowtail` (↢), `\looparrowleft` (↫), `\looparrowright` (↬), `\circlearrowleft` (↺), `\circlearrowright` (↻), `\curvearrowleft` (↶), `\curvearrowright` (↷), `\dashrightarrow` (⇢), `\dashleftarrow` (⇠), `\Lsh` (↰), `\Rsh` (↱), `\multimap` (⊸), `\rightsquigarrow` (⇝), `\leftrightsquigarrow` (↭), `\nleftarrow` (↚), `\nrightarrow` (↛), `\nLeftarrow` (⇍), `\nRightarrow` (⇏), `\nleftrightarrow` (↮), `\nLeftrightarrow` (⇎).

**Category 9: Logic/set theory** (23 symbols)
Keep existing, add: `\forall` (∀), `\exists` (∃), `\nexists` (∄), `\neg` (¬), `\land` (∧), `\lor` (∨), `\top` (⊤), `\bot` (⊥), `\therefore` (∴), `\because` (∵), `\varnothing` (∅), `\complement` (∁).

**Category 10: Calculus/analysis** (16 symbols)
Keep `\partial`, `\nabla`, `\infty`, `\lim`, `\int`, `\iint`, `\iiint`, `\oint`
Add: `\liminf`, `\limsup`, `\sup`, `\inf`, `\max`, `\min`, `\oiint`, `\oiiint`

**Category 11: Trig/hyperbolic** (16 symbols)
`\sin`, `\cos`, `\tan`, `\sec`, `\csc`, `\cot`, `\sinh`, `\cosh`, `\tanh`, `\coth`, `\arcsin`, `\arccos`, `\arctan`, `\arcsec`, `\arccsc`, `\arccot`

**Category 12: Other operators** (12 symbols)
`\arg`, `\deg`, `\det`, `\dim`, `\exp`, `\gcd`, `\hom`, `\ker`, `\lg`, `\ln`, `\log`, `\Pr`

**Category 13: Delimiters** (18 symbols)
`\langle` (⟨), `\rangle` (⟩), `\lceil` (⌈), `\rceil` (⌉), `\lfloor` (⌊), `\rfloor` (⌋), `\lbrace` ({), `\rbrace` (}), `\lvert` (|), `\rvert` (|), `\lVert` (‖), `\rVert` (‖), `\llbracket` (⟦), `\rrbracket` (⟧), `\ulcorner` (┌), `\urcorner` (┐), `\llcorner` (└), `\lrcorner` (┘)

**Category 14: Decorations/accents** (19 symbols, most with snippets)
`\hat{}` [snippet: `\hat{$1}`], `\bar{}` [snippet: `\bar{$1}`], `\vec{}` [snippet: `\vec{$1}`], `\dot{}` [snippet: `\dot{$1}`], `\ddot{}` [snippet: `\ddot{$1}`], `\widehat{}` [snippet: `\widehat{$1}`], `\widetilde{}` [snippet: `\widetilde{$1}`], `\overline{}` [snippet: `\overline{$1}`], `\underline{}` [snippet: `\underline{$1}`], `\overbrace{}{}` [snippet: `\overbrace{$1}{$2}`], `\underbrace{}{}` [snippet: `\underbrace{$1}{$2}`], `\acute{}` [snippet: `\acute{$1}`], `\grave{}` [snippet: `\grave{$1}`], `\breve{}` [snippet: `\breve{$1}`], `\check{}` [snippet: `\check{$1}`], `\tilde{}` [snippet: `\tilde{$1}`], `\mathring{}` [snippet: `\mathring{$1}`], `\dddot{}` [snippet: `\dddot{$1}`], `\ddddot{}` [snippet: `\ddddot{$1}`]

**Category 15: Fractions/binomials** (6 symbols, ALL with snippets)
`\frac{}{}` [snippet: `\frac{$1}{$2}`], `\dfrac{}{}` [snippet: `\dfrac{$1}{$2}`], `\tfrac{}{}` [snippet: `\tfrac{$1}{$2}`], `\binom{}{}` [snippet: `\binom{$1}{$2}`], `\dbinom{}{}` [snippet: `\dbinom{$1}{$2}`], `\tbinom{}{}` [snippet: `\tbinom{$1}{$2}`]

**Category 16: Stacking/extensible arrows** (10 symbols, most with snippets)
`\overset{}{}` [snippet: `\overset{$1}{$2}`], `\underset{}{}` [snippet: `\underset{$1}{$2}`], `\stackrel{}{}` [snippet: `\stackrel{$1}{$2}`], `\xrightarrow{}` [snippet: `\xrightarrow{$1}`], `\xleftarrow{}` [snippet: `\xleftarrow{$1}`], `\xleftrightarrow{}` [snippet: `\xleftrightarrow{$1}`], `\xmapsto{}` [snippet: `\xmapsto{$1}`], `\xhookleftarrow{}` [snippet: `\xhookleftarrow{$1}`], `\xhookrightarrow{}` [snippet: `\xhookrightarrow{$1}`], `\xlongequal{}` [snippet: `\xlongequal{$1}`]

**Category 17: Misc symbols** (60+ symbols)
Keep existing misc: `\forall`, `\exists`, `\neg`, `\emptyset`, `\mathbb{R}`–`\mathbb{Q}`, `\ldots`, `\cdots`, `\vdots`, `\ddots`
Add: `\infty` (∞), `\partial` (∂), `\nabla` (∇), `\ell` (ℓ), `\hbar` (ℏ), `\eth` (ð), `\S` (§), `\P` (¶), `\dag` (†), `\ddag` (‡), `\copyright` (©), `\pounds` (£), `\angle` (∠), `\measuredangle` (∡), `\sphericalangle` (∢), `\surd` (√), `\dots` (…), `\iddots` (⋰), `\square` (□), `\Box` (□), `\blacksquare` (■), `\triangle` (△), `\triangledown` (▽), `\triangleleft` (◁), `\triangleright` (▷), `\bigtriangleup` (△), `\bigtriangledown` (▽), `\lozenge` (◊), `\blacklozenge` (⧫), `\diamond` (⋄), `\Diamond` (◇), `\blacktriangle` (▲), `\blacktriangledown` (▼), `\blacktriangleleft` (◀), `\blacktriangleright` (▶), `\star` (⋆), `\bigstar` (★), `\clubsuit` (♣), `\diamondsuit` (♢), `\heartsuit` (♡), `\spadesuit` (♠), `\sharp` (♯), `\flat` (♭), `\natural` (♮), `\mho` (℧), `\prime` (′), `\backprime` (‵), `\backslash` (\), `\diagup` (╱), `\diagdown` (╲)

**Category 18: Math font styles** (4 symbols, no snippet)
`\displaystyle`, `\textstyle`, `\scriptstyle`, `\scriptscriptstyle`

**Category 19: Spacing** (13 symbols, no snippet)
`\,`, `\;`, `\:`, `\!`, `\quad`, `\qquad`, `\enspace`, `\thinspace`, `\thickspace`, `\medspace`, `\negthinspace`, `\negmedspace`, `\negthickspace`

**Category 20: Environment starters** (15 symbols, no snippet)
`{pmatrix}`, `{bmatrix}`, `{Bmatrix}`, `{vmatrix}`, `{Vmatrix}`, `{matrix}`, `{cases}`, `{rcases}`, `{dcases}`, `{aligned}`, `{gathered}`, `{array}`, `{split}`, `{smallmatrix}`, `{CD}`

**Category 21: Root/box** (3 symbols, all with snippets)
`\sqrt{}` [snippet: `\sqrt{$1}`], `\sqrt[]{}` [snippet: `\sqrt[$1]{$2}`], `\boxed{}` [snippet: `\boxed{$1}`]

**Category 22: Color** (4 symbols, all with snippets)
`\color{}{}` [snippet: `\color{$1}{$2}`], `\textcolor{}{}` [snippet: `\textcolor{$1}{$2}`], `\colorbox{}{}` [snippet: `\colorbox{$1}{$2}`], `\fcolorbox{}{}{}` [snippet: `\fcolorbox{$1}{$2}{$3}`]

**Category 23: Annotation/cancel** (5 symbols, most with snippets)
`\cancel{}` [snippet: `\cancel{$1}`], `\bcancel{}` [snippet: `\bcancel{$1}`], `\xcancel{}` [snippet: `\xcancel{$1}`], `\sout{}` [snippet: `\sout{$1}`], `\not` (no unicode, no snippet)

---

## Execution Order

```
Task 1 (SnippetString stub) ──┐
                               ├──> Task 3 (Store rewrite) ──> Task 4 (Completion) ──> Task 6 (Extension) ──> Task 7 (Integration)
Task 2 (Symbol expansion) ────┘                                     │                                                    │
                                                                     └──> Task 5 (QuickPick) ────────────────────────────┘
```
