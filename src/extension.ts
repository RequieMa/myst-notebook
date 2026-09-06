import * as vscode from 'vscode';
import { MystSerializer } from './mystSerializer';
import { MystController } from './mystController';
import { registerEnterSplit, insertNewline } from './enterSplit';
import { registerInputCollapse } from './inputCollapse';
import { registerInsertCells } from './insertCells';
import { MathSymbolStore, MathSymbolProvider } from './mathPalette';
import { lintCellText, collectMathPaletteItems, DEFAULT_RULES } from './mathLinter';
import { MathCompletionProvider } from './mathCompletion';
import { insertMathSymbolQuickPick } from './mathQuickPick';
import { MATH_SYMBOLS_BY_LATEX } from './mathSymbols';
import { registerZoteroSetup } from './zoteroSetup';
import { registerOnboarding } from './openAsNotebook';
import { applyFocusedNotebookSettings } from './workspaceChrome';
import { initLog, log } from './log';
import { registerGraphFeatures } from './graph';
import { registerCellStatusBar } from './cellStatusBar';
import { registerSingleClickEdit } from './cellFocus';
import { registerFontSize } from './fontSize';
import { registerCellSelection } from './cellSelection';

export function activate(context: vscode.ExtensionContext) {
  initLog(context);

  // Serializer
  context.subscriptions.push(
    vscode.workspace.registerNotebookSerializer('myst-notebook', new MystSerializer())
  );

  // Execution
  const controller = new MystController(context.workspaceState);
  context.subscriptions.push({ dispose: () => controller.dispose() });

  // --- Cell UX improvements ---

  // Execute button on code cells (▶ Run)
  registerCellStatusBar(context, controller);

  // Single-click to enter edit mode (selection-change path)
  registerSingleClickEdit(context);

  // Font-size shortcuts + status-bar dropdown
  registerFontSize(context);

  // Keyboard cell multi-select (Ctrl+Shift+Up/Down)
  registerCellSelection(context);

  // Command: execute a specific cell (fired by the status bar ▶ Run button)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'myst-notebook.runCell',
      (args: { notebookUri: string; cellIndex: number }) => {
        const notebook = vscode.workspace.notebookDocuments.find(
          (n) => n.uri.toString() === args.notebookUri,
        );
        if (!notebook) return;
        const cell = notebook.cellAt(args.cellIndex);
        if (cell) {
          void controller.execute([cell], notebook);
        }
      },
    ),
  );

  // Kernel lifecycle commands
  context.subscriptions.push(
    vscode.commands.registerCommand('myst-notebook.restartKernel', () =>
      controller.restartActiveKernel()
    ),
    vscode.commands.registerCommand('myst-notebook.interruptKernel', () =>
      controller.interruptActiveKernel()
    ),
    vscode.commands.registerCommand('myst-notebook.reinstallRuntime', () =>
      controller.reinstallRuntime()
    ),
    vscode.commands.registerCommand('myst-notebook.convertToMarkdown', () =>
      controller.convertActiveCellToMarkdown()
    ),
    vscode.commands.registerCommand('myst-notebook.convertToCode', () =>
      controller.convertActiveCellToCode()
    )
  );

  // Enter-split keybinding
  registerEnterSplit(context);

  // Alt+Enter: force a literal newline inside a markup cell
  context.subscriptions.push(
    vscode.commands.registerCommand('myst-notebook.insertNewline', () => insertNewline())
  );

  // Input collapse fallback
  registerInputCollapse(context);

  // Insert-cell commands (executable / display-code)
  registerInsertCells(context);

  // Hide notebook editing chrome (global + insert-cell toolbars) for a focused
  // writing feel. Fire-and-forget: async and must not block activation.
  void applyFocusedNotebookSettings();

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
        store.add(latex);
      },
    ),
  );

  // Quick-pick command (Ctrl+Shift+M)
  context.subscriptions.push(
    vscode.commands.registerCommand('myst-notebook.insertMathSymbolPicker', () =>
      insertMathSymbolQuickPick(store, insertLatexAtCursor),
    ),
  );

  // Command: record a math symbol as explicitly used (fired by completion accept)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'myst-notebook.recordMathSymbol',
      (latex: string) => store.add(latex),
    ),
  );

  // Command: save the exact cursor-selected LaTeX in the current cell
  context.subscriptions.push(
    vscode.commands.registerCommand('myst-notebook.saveSelectedLatex', () => {
      const editor = vscode.window.activeTextEditor;
      const nbEditor = vscode.window.activeNotebookEditor;
      if (!editor || !nbEditor || nbEditor.notebook.notebookType !== 'myst-notebook') {
        void vscode.window.showInformationMessage('MyST: Save LaTeX works inside a MyST notebook cell.');
        return;
      }
      const isCell = nbEditor.notebook.getCells().some((c) => c.document === editor.document);
      if (!isCell) {
        void vscode.window.showInformationMessage('MyST: select text inside a notebook cell first.');
        return;
      }
      const text = editor.document.getText(editor.selection).trim();
      if (!text) {
        void vscode.window.showInformationMessage('MyST: select LaTeX text first.');
        return;
      }
      store.add(text);
      provider.refresh();
      void vscode.window.showInformationMessage(`MyST: saved "${text}" to math symbols.`);
    }),
  );

  // Inline \ completion inside $...$ and $$...$$
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'markdown' },
      new MathCompletionProvider(store, {
        command: 'myst-notebook.recordMathSymbol',
        title: 'Record usage',
      }),
      '\\',
    ),
  );

  // Math linter + auto-collect symbols on cell exit
  registerMathLinterAndCollect(context, store, provider);

  // Zotero → MyST {cite} auto-config (command + one-time prompt)
  registerZoteroSetup(context);

  // Onboarding: open-as-notebook command + one-time first-open toast.
  registerOnboarding(context);

  // Graph features (knowledge graph, backlinks, navigation, hover, completions)
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    registerGraphFeatures(context, workspaceFolders[0].uri).catch(err =>
      log(`[graph] registerGraphFeatures failed: ${err}`)
    );
  }
}

function insertLatexAtCursor(latex: string, snippet?: string): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  if (snippet) {
    void editor.insertSnippet(new vscode.SnippetString(snippet), editor.selection.active);
  } else {
    void editor.edit(eb => eb.insert(editor.selection.active, latex));
  }
}

function registerMathLinterAndCollect(
  context: vscode.ExtensionContext,
  store: MathSymbolStore,
  provider: MathSymbolProvider
) {
  // Track the cell that currently holds edit focus, per notebook. Linting fires
  // when focus LEAVES a cell — i.e. on selection change, not on document change.
  //
  // Why not onDidChangeNotebookDocument: a document-change event fires on every
  // keystroke while the cell is active, so skipping the active cell means the
  // just-edited cell is never linted; and moving away from a cell is a selection
  // change, not a document change, so no later doc-change event ever arrives to
  // lint it. Selection change is the event that actually corresponds to "cell exit".
  const lastActiveCell = new Map<string, vscode.NotebookCell | undefined>();

  const processCell = (cell: vscode.NotebookCell) => {
    if (cell.kind !== vscode.NotebookCellKind.Markup) return;
    if (cell.notebook.notebookType !== 'myst-notebook') return;

    const original = cell.document.getText();

    // Collect distinct, reusable math elements into the palette. The linter
    // runs first so commands like \mathbf R become \mathbf{R} before storage.
    // Use markSeen (not add) — we are scanning existing document content, not
    // recording an explicit user insertion. Counts only increment on explicit
    // insertions (QuickPick, completion accept, palette click).
    let paletteDirty = false;
    for (const element of collectMathPaletteItems(original)) {
      store.markSeen(element);
      paletteDirty = true;
    }
    if (paletteDirty) provider.refresh();

    // Apply lint edits.
    const linted = lintCellText(original, DEFAULT_RULES);
    if (linted === original) return;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      cell.document.uri,
      new vscode.Range(
        cell.document.positionAt(0),
        cell.document.positionAt(original.length)
      ),
      linted
    );
    void vscode.workspace.applyEdit(edit);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeNotebookEditorSelection((e) => {
      const nb = e.notebookEditor.notebook;
      if (nb.notebookType !== 'myst-notebook') return;

      const key = nb.uri.toString();
      const previous = lastActiveCell.get(key);
      const selection = e.notebookEditor.selection;
      const current = selection.isEmpty ? undefined : nb.cellAt(selection.start);

      // Focus moved to a different cell (or away): lint the one we just left.
      if (previous && previous !== current) {
        processCell(previous);
      }
      lastActiveCell.set(key, current);
    })
  );

  // Drop tracking state for notebooks as they close.
  context.subscriptions.push(
    vscode.workspace.onDidCloseNotebookDocument((nb) => {
      lastActiveCell.delete(nb.uri.toString());
    })
  );
}

export function deactivate() {}
