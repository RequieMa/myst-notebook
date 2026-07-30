# LaTeX Completion Enhancements — Design Spec

**Date**: 2026-07-30
**Status**: Ready for Review
**Context**: Three interrelated improvements to the math symbol completion system in `myst-notebook`.

---

## 1. Problem Summary

| # | Problem | Root Cause |
|---|---------|------------|
| 1 | Recently-used symbols lost after VS Code restart | `workspaceState` Memento is workspace-keyed; no project-level persistence |
| 2 | Incomplete symbol list (e.g., `\rightarrow` missing) | Only 113 hardcoded symbols; missing ~400 KaTeX-supported commands |
| 3 | Cursor lands after `}` on brace commands like `\mathbf{}` | No snippet placeholders; plain-text insertion |

## 2. Solution Overview

Three changes that all touch the same files:

1. **Configuration file** → `.vscode/myst-symbols.json` — project-level, git-commit friendly, tracks usage stats
2. **Symbol list expansion** → from 113 to ~500 entries covering the full KaTeX supported-function set
3. **Snippet placeholders** → `SnippetString` with `$1`/`$2` tab stops on brace-wrapping commands

---

## 3. Configuration File

### 3.1 Format

```json
{
  "version": 1,
  "symbols": {
    "\\mathbb{R}": { "count": 12, "lastUsed": "2026-07-30T10:00:00Z" },
    "\\mathbf{}": { "count": 5,  "lastUsed": "2026-07-29T15:00:00Z" }
  }
}
```

- Keys are **LaTeX command strings** (exactly as they appear in `MathSymbol.latex`)
- Values track **cumulative usage count** and **ISO-8601 last-used timestamp**
- Symbols not in the file are treated as count=0 (no entry needed for unused symbols)
- `version` field allows future schema migrations

### 3.2 Location

```
<workspace-root>/.vscode/myst-symbols.json
```

- Uses first workspace folder when multi-root
- `.vscode/` directory auto-created if absent
- Configurable via `myst-notebook.symbols.configPath` setting (optional override)

### 3.3 Lifecycle

```
extension activate
  → MathSymbolStore.load()
      1. Read .vscode/myst-symbols.json
      2. If missing: check workspaceState for legacy data → migrate → save
      3. Parse into in-memory Map<string, {count, lastUsed}>
      4. Register FileSystemWatcher on config file

user picks/inserts a symbol
  → store.add(latex)              // sync: increment count, update lastUsed
  → store.debouncedSave()         // async: write JSON after 1s quiet period

external edit (git pull, manual)
  → FileSystemWatcher fires
  → store.load()                  // re-read, re-parse in-memory cache
```

### 3.4 Sorting Rule

Completion items sorted by:

1. **Config count descending** (most-used first)
2. **Config lastUsed descending** (recently-used as tiebreaker)
3. **Built-in index** (fallback — symbols defined earlier in `MATH_SYMBOLS` appear first)

The current `sortText` prefix (`0_` for recent, `1_` for others) is replaced with a three-tier key:
- Tier 0: `0_<count_padded>_<index>` for symbols with usage count ≥ 1
- Tier 1: `1_<index>` for unused built-in symbols

### 3.5 Migration

On first load, if `.vscode/myst-symbols.json` does not exist but `workspaceState` has data under key `myst-notebook.mathSymbols`:

1. Iterate `workspaceState` entries (they are just `string[]` — no count/timestamp)
2. Write each to config as `{ "count": 1, "lastUsed": "<now>" }`
3. Save config file
4. Clear `workspaceState` key (so migration only runs once)

### 3.6 Error Handling

- **Missing file**: Treated as empty — no error
- **Malformed JSON**: Log warning, fall back to empty state, do NOT overwrite the broken file
- **Write failure** (permissions, disk full): Log error, skip write, keep in-memory state intact
- **FileSystemWatcher error**: Log warning, rely on next explicit save to sync

---

## 4. Symbol List Expansion

### 4.1 Interface Change

```typescript
// BEFORE
export interface MathSymbol {
  latex: string;
  description: string;
  unicode?: string;
}

// AFTER
export interface MathSymbol {
  latex: string;        // LaTeX command, e.g. "\\mathbf{}", "\\rightarrow"
  description: string;  // Human-readable, e.g. "bold", "arrow right"
  unicode?: string;     // Display character, e.g. "→"
  snippet?: string;     // VS Code SnippetString with $1/$2 placeholders
                        // e.g. "\\mathbf{$1}", "\\frac{$1}{$2}"
                        // Omitted = plain-text insertion
}
```

### 4.2 New Categories

The expanded list grows from 113 to ~500 entries across 17 categories:

| Category | Key additions | Snippet? |
|----------|--------------|----------|
| Greek lowercase | 28 symbols (existing, minor adds like `\omicron`) | No |
| Greek uppercase | 11 symbols (existing) | No |
| Hebrew/misc letters | `\aleph`, `\beth`, `\gimel`, `\daleth`, `\hbar`, `\hslash`, `\ell`, `\wp`, `\Im`, `\Re`, `\mho`, `\Finv`, `\Bbbk`, `\Game` | No |
| Font commands | `\mathbf{}`, `\mathbb{}`, `\mathcal{}`, `\mathfrak{}`, `\mathscr{}`, `\mathsf{}`, `\mathtt{}`, `\mathit{}`, `\mathrm{}`, `\bm{}`, `\boldsymbol{}`, `\textrm{}`, `\text{}`, `\textsf{}`, `\texttt{}`, `\textbf{}`, `\textit{}` | **Yes** |
| Large operators | `\sum`, `\prod`, `\coprod`, `\int`, `\iint`, `\iiint`, `\oint`, `\oiint`, `\oiiint`, `\bigcap`, `\bigcup`, `\bigvee`, `\bigwedge`, `\bigodot`, `\bigoplus`, `\bigotimes`, `\biguplus`, `\bigsqcup`, `\smallint` | No |
| Binary operators | `\times`, `\cdot`, `\div`, `\pm`, `\mp`, `\oplus`, `\otimes`, `\circ`, `\bullet`, `\star`, `\diamond`, `\ast`, `\odot`, `\ominus`, `\oslash`, `\uplus`, `\sqcap`, `\sqcup`, `\wedge`, `\vee`, `\cup`, `\cap`, `\setminus`, `\wr`, `\amalg`, `\bigcirc`, `\bigtriangleup`, `\bigtriangledown`, `\triangleleft`, `\triangleright`, `\lhd`, `\rhd`, `\unlhd`, `\unrhd`, `\dagger`, `\ddagger`, `\barwedge`, `\veebar`, `\doublebarwedge`, `\boxplus`, `\boxminus`, `\boxtimes`, `\boxdot`, `\curlyvee`, `\curlywedge`, `\ltimes`, `\rtimes`, `\leftthreetimes`, `\rightthreetimes`, `\intercal`, `\divideontimes`, `\dotplus`, `\centerdot` | No |
| Relations | `\leq`, `\geq`, `\neq`, `\approx`, `\sim`, `\simeq`, `\equiv`, `\propto`, `\prec`, `\succ`, `\preceq`, `\succeq`, `\ll`, `\gg`, `\lll`, `\ggg`, `\subset`, `\supset`, `\subseteq`, `\supseteq`, `\subsetneq`, `\supsetneq`, `\in`, `\notin`, `\ni`, `\notni`, `\mid`, `\nmid`, `\parallel`, `\nparallel`, `\perp`, `\models`, `\vdash`, `\dashv`, `\Vdash`, `\vDash`, `\nvdash`, `\nvDash`, `\smile`, `\frown`, `\asymp`, `\bowtie`, `\doteq`, `\doteqdot`, `\fallingdotseq`, `\risingdotseq`, `\eqcirc`, `\circeq`, `\triangleq`, `\bumpeq`, `\Bumpeq`, `\leqq`, `\geqq`, `\lneqq`, `\gneqq`, `\lneq`, `\gneq`, `\lnsim`, `\gnsim`, `\lesssim`, `\gtrsim`, `\lessapprox`, `\gtrapprox`, `\lessgtr`, `\gtrless`, `\lesseqgtr`, `\gtreqless`, `\lesseqqgtr`, `\gtreqqless`, `\precapprox`, `\succapprox`, `\precnapprox`, `\succnapprox`, `\precsim`, `\succsim`, `\precneqq`, `\succneqq`, `\curlyeqprec`, `\curlyeqsucc`, `\trianglelefteq`, `\trianglerighteq`, `\between`, `\pitchfork`, `\shortmid`, `\shortparallel`, `\smallfrown`, `\smallsmile`, `\backsim`, `\backsimeq`, `\eqsim`, `\approxeq` | No |
| Arrows | `\to`, `\rightarrow`, `\leftarrow`, `\leftrightarrow`, `\Rightarrow`, `\Leftarrow`, `\Leftrightarrow`, `\mapsto`, `\longrightarrow`, `\longleftarrow`, `\longleftrightarrow`, `\Longrightarrow`, `\Longleftarrow`, `\Longleftrightarrow`, `\longmapsto`, `\hookrightarrow`, `\hookleftarrow`, `\rightharpoonup`, `\leftharpoonup`, `\rightharpoondown`, `\leftharpoondown`, `\rightleftharpoons`, `\leftrightharpoons`, `\nearrow`, `\searrow`, `\swarrow`, `\nwarrow`, `\uparrow`, `\downarrow`, `\updownarrow`, `\Uparrow`, `\Downarrow`, `\Updownarrow`, `\twoheadrightarrow`, `\twoheadleftarrow`, `\rightarrowtail`, `\leftarrowtail`, `\looparrowleft`, `\looparrowright`, `\circlearrowleft`, `\circlearrowright`, `\curvearrowleft`, `\curvearrowright`, `\dashrightarrow`, `\dashleftarrow`, `\Lsh`, `\Rsh`, `\multimap`, `\rightsquigarrow`, `\leftrightsquigarrow`, `\nleftarrow`, `\nrightarrow`, `\nLeftarrow`, `\nRightarrow`, `\nleftrightarrow`, `\nLeftrightarrow` | No |
| Logic/set theory | `\forall`, `\exists`, `\nexists`, `\neg`, `\land`, `\lor`, `\top`, `\bot`, `\therefore`, `\because`, `\varnothing`, `\complement`, `\setminus`, `\subset`, `\supset`, `\subseteq`, `\supseteq`, `\in`, `\notin`, `\ni`, `\emptyset`, `\mathbb{P}`, `\mathbb{S}`, `\mathbb{H}` | No |
| Calculus/analysis | `\partial`, `\nabla`, `\infty`, `\lim`, `\liminf`, `\limsup`, `\sup`, `\inf`, `\max`, `\min`, `\int`, `\iint`, `\iiint`, `\oint`, `\oiint`, `\oiiint` | No |
| Trig/hyperbolic | `\sin`, `\cos`, `\tan`, `\sec`, `\csc`, `\cot`, `\sinh`, `\cosh`, `\tanh`, `\coth`, `\arcsin`, `\arccos`, `\arctan`, `\arcsec`, `\arccsc`, `\arccot` | No |
| Other operators | `\arg`, `\deg`, `\det`, `\dim`, `\exp`, `\gcd`, `\hom`, `\ker`, `\lg`, `\ln`, `\log`, `\Pr` | No |
| Delimiters | `\langle`, `\rangle`, `\lceil`, `\rceil`, `\lfloor`, `\rfloor`, `\lbrace`, `\rbrace`, `\lvert`, `\rvert`, `\lVert`, `\rVert`, `\llbracket`, `\rrbracket`, `\ulcorner`, `\urcorner`, `\llcorner`, `\lrcorner` | No |
| Decorations (accents) | `\hat{}`, `\bar{}`, `\vec{}`, `\dot{}`, `\ddot{}`, `\widehat{}`, `\widetilde{}`, `\overline{}`, `\underline{}`, `\overbrace{}{}`, `\underbrace{}{}`, `\acute{}`, `\grave{}`, `\breve{}`, `\check{}`, `\tilde{}`, `\mathring{}`, `\dddot{}`, `\ddddot{}` | **Yes** (those with `{}`) |
| Fractions/binomials | `\frac{}{}`, `\dfrac{}{}`, `\tfrac{}{}`, `\binom{}{}`, `\dbinom{}{}`, `\tbinom{}{}` | **Yes** |
| Stacking/annotation | `\overset{}{}`, `\underset{}{}`, `\stackrel{}{}`, `\xrightarrow{}`, `\xleftarrow{}`, `\xleftrightarrow{}`, `\xmapsto{}` | **Yes** |
| Math font styles | `\displaystyle`, `\textstyle`, `\scriptstyle`, `\scriptscriptstyle` | No |
| Spacing | `\,`, `\;`, `\:`, `\!`, `\quad`, `\qquad`, `\enspace`, `\thinspace`, `\thickspace`, `\medspace`, `\negthinspace`, `\negmedspace`, `\negthickspace` | No |
| Environments | `{pmatrix}`, `{bmatrix}`, `{Bmatrix}`, `{vmatrix}`, `{Vmatrix}`, `{matrix}`, `{cases}`, `{rcases}`, `{dcases}`, `{aligned}`, `{gathered}`, `{array}`, `{split}`, `{smallmatrix}`, `{CD}` | No |
| Root/box | `\sqrt{}`, `\sqrt[]{}`, `\boxed{}` | **Yes** |
| Color | `\color{}{}`, `\textcolor{}{}`, `\colorbox{}{}`, `\fcolorbox{}{}{}` | **Yes** |
| Misc symbols | `\infty`, `\emptyset`, `\varnothing`, `\partial`, `\nabla`, `\ell`, `\hbar`, `\hslash`, `\eth`, `\S`, `\P`, `\dag`, `\ddag`, `\copyright`, `\pounds`, `\angle`, `\measuredangle`, `\sphericalangle`, `\surd`, `\|`, `\#`, `\$`, `\%`, `\&`, `\_`, `\{`, `\}`, `\dots`, `\ldots`, `\cdots`, `\vdots`, `\ddots`, `\iddots`, `\therefore`, `\because`, `\square`, `\Box`, `\blacksquare`, `\triangle`, `\triangledown`, `\triangleleft`, `\triangleright`, `\bigtriangleup`, `\bigtriangledown`, `\lozenge`, `\blacklozenge`, `\diamond`, `\Diamond`, `\Diamond`, `\blacktriangle`, `\blacktriangledown`, `\blacktriangleleft`, `\blacktriangleright`, `\star`, `\bigstar`, `\clubsuit`, `\diamondsuit`, `\heartsuit`, `\spadesuit`, `\sharp`, `\flat`, `\natural`, `\mho`, `\bot`, `\top`, `\prime`, `\backprime`, `\backslash`, `\diagup`, `\diagdown` | No |

### 4.3 Snippet Rules

Commands ending in `{}` get a `snippet` field. Mapping rules:

| Pattern | Snippet | Example |
|---------|---------|---------|
| `\cmd{}` | `\cmd{$1}` | `\mathbf{$1}`, `\hat{$1}` |
| `\cmd{}{}` | `\cmd{$1}{$2}` | `\frac{$1}{$2}`, `\binom{$1}{$2}` |
| `\cmd{}{}{}` | `\cmd{$1}{$2}{$3}` | `\fcolorbox{$1}{$2}{$3}` |
| `\cmd[]{}` | `\cmd[$1]{$2}` | `\sqrt[$1]{$2}` |
| `\cmd{}{}^{}` | `\cmd{$1}{$2}^{$3}` | `\overset{$1}{$2}` (just 2 args for this one) |

Determined at symbol definition time: `MathSymbol.snippet` is set explicitly per-symbol. No runtime derivation.

### 4.4 Symbols NOT Included

- **Macro definition** commands (`\def`, `\newcommand`, `\let`, etc.) — these are code, not math input
- **HTML extension** commands (`\htmlClass`, `\href`, etc.) — non-standard usage
- **Environment `\begin{...}` / `\end{...}`** — too long for completion; users type these directly
- **Internal TeX commands** (`\char`, `\relax`, `\noexpand`, etc.) — not user-facing

---

## 5. Snippet Cursor Placement

### 5.1 Completion Provider Changes

In `MathCompletionProvider.provideCompletionItems()`:

```typescript
const item = new vscode.CompletionItem(sym.latex, vscode.CompletionItemKind.Value);
item.detail = sym.unicode ?? '';
item.documentation = sym.description;

// Snippet insertion for brace-wrapping commands
if (sym.snippet) {
  item.insertText = new vscode.SnippetString(sym.snippet);
}

if (replaceRange) {
  item.range = replaceRange; // range determines what gets replaced; SnippetString replaces within it
}
```

### 5.2 QuickPick Path

`insertLatexAtCursor` is replaced with a new function that checks for snippet:

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

### 5.3 How Snippets Work in VS Code

- `$1`, `$2`, ... are **tab stops** — cursor starts at `$1`, Tab moves to `$2`
- `$0` is the **final** tab stop (not used here since we want to end after the last param)
- If multiple `$1` exist, they are **mirrored** (typing in one appears in all)
- `insertSnippet` is available on `TextEditor` API since VS Code 1.17

### 5.4 Example Flow

User types `\mathbf`, sees completion:
- Label: `\mathbf{}`
- Description: "bold"
- Selecting it inserts: `\mathbf{|}` where `|` = cursor (at `$1`)
- User types `x` → `\mathbf{x|}`
- User presses Tab → cursor moves past `}` → `\mathbf{x}|`

---

## 6. File Changes

| File | Change | Description |
|------|--------|-------------|
| `src/mathSymbols.ts` | **Major rewrite** | 113 → ~500 symbols, add `snippet` field, reorganize categories |
| `src/mathPalette.ts` | **Major rewrite** | `MathSymbolStore` reads/writes `.vscode/myst-symbols.json` instead of `workspaceState` |
| `src/mathCompletion.ts` | **Moderate** | Use `SnippetString` when `sym.snippet` exists; new sorting based on config stats |
| `src/mathQuickPick.ts` | **Moderate** | Pass snippet to insertion; handle new symbol list size |
| `src/extension.ts` | **Moderate** | Construct store with workspace path; `await store.load()`; register `FileSystemWatcher` |
| `src/mathCompletion.test.ts` | **Expand** | Add tests for snippet insertion, config-based sorting, migration |
| `src/mathPalette.test.ts` | **New** | Test config read/write, migration, error handling |
| `package.json` | **Minor** | Optional `myst-notebook.symbols.configPath` setting; docs link |

No changes to: renderer, graph, serializer, controller, kernel, enterSplit, or any other subsystem.

---

## 7. Testing Strategy

### 7.1 Unit Tests (vitest)

- **`mathSymbols.ts`**: Verify all symbols have valid format, no duplicate `latex` values, snippets have matching `$1`/`$2` counts
- **`mathPalette.ts`**: Test `load()` from JSON, `save()` to JSON, migration from old workspaceState format, malformed JSON handling, debounced save
- **`mathCompletion.ts`**: Verify `SnippetString` is set when `sym.snippet` exists, verify sort order (config-based + fallback), verify `range` interaction with snippet
- **`mathQuickPick.ts`**: Verify both snippet and plain-text insertion paths

### 7.2 Integration (vscode-test)

- Open a `.md` file in a MyST notebook workspace, type `\mathbf`, accept completion, verify cursor lands inside `{}`
- Use `Ctrl+Shift+M` to insert `\frac{}{}`, verify Tab navigation between arguments
- Close and reopen VS Code, verify previously-used symbols appear at top of completion list
- Simulate missing `.vscode` directory, verify auto-creation

---

## 8. Rollout / Backward Compatibility

- **Existing workspaces**: On first activation, `workspaceState` data auto-migrates to `.vscode/myst-symbols.json`
- **No config file present**: Treated as empty — all built-in symbols available, no user stats
- **Old extension version users**: No impact; they continue using `workspaceState` (unchanged code in old version)
- **`.vscode/myst-symbols.json` in `.gitignore`**: Not added by default; users decide whether to commit
- **No `package.json` version bump needed** for data migration — handled in code

---

## 9. Resolved Decisions

1. **Config file only, no workspaceState fallback** — YAGNI. The config file is strictly better for persistence + sharing.
2. **Palette sidebar shows only recent symbols** — keep current behavior. QuickPick (`Ctrl+Shift+M`) shows all 500.
3. **No `$0` final tab stop** — the last `$N` param is the natural end; extra `$0` adds unnecessary keystrokes.
