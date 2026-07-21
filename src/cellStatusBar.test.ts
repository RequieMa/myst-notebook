import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from './__stubs__/vscode';
import { registerCellStatusBar } from './cellStatusBar';

// Save the original factory once so beforeEach always chains from the real one.
const _origCreateItem = vscode.notebooks.createNotebookCellStatusBarItem.bind(vscode.notebooks);

describe('cellStatusBar', () => {
  let createdItems: vscode.NotebookCellStatusBarItem[] = [];
  let disposedCount = 0;
  let mockCtrl: any;

  beforeEach(() => {
    createdItems = [];
    disposedCount = 0;
    mockCtrl = { execute: vi.fn().mockResolvedValue(undefined) } as any;

    // Reset event emitters so listeners do not accumulate across tests
    vscode.workspace.onDidOpenNotebookDocument.reset();
    vscode.workspace.onDidCloseNotebookDocument.reset();
    vscode.workspace.onDidChangeNotebookDocument.reset();

    // Spy on createNotebookCellStatusBarItem: capture every created item.
    // Always chain from the original factory (not from a previous spy).
    vscode.notebooks.createNotebookCellStatusBarItem = (cell: any, alignment?: any) => {
      const item = _origCreateItem(cell, alignment);
      const origDispose = item.dispose.bind(item);
      item.dispose = () => { disposedCount++; origDispose(); };
      createdItems.push(item);
      return item;
    };
  });

  function codeCell(idx: number, notebookUri: string): any {
    return {
      index: idx,
      kind: 2,
      document: { getText: () => 'print(1)', uri: { toString: () => notebookUri, scheme: 'file' }, languageId: 'python' },
      notebook: {
        uri: { toString: () => notebookUri, scheme: 'file' },
        notebookType: 'myst-notebook',
        getCells: () => [],
      },
    };
  }

  function markupCell(idx: number, notebookUri: string): any {
    return {
      index: idx,
      kind: 1,
      document: { getText: () => 'text', uri: { toString: () => notebookUri, scheme: 'file' }, languageId: 'markdown' },
      notebook: {
        uri: { toString: () => notebookUri, scheme: 'file' },
        notebookType: 'myst-notebook',
        getCells: () => [],
      },
    };
  }

  function notebookStub(uri: string, cells: any[]): any {
    for (let i = 0; i < cells.length; i++) {
      cells[i].index = i;
      cells[i].notebook = {
        uri: { toString: () => uri, scheme: 'file' },
        notebookType: 'myst-notebook',
        getCells: () => cells,
      };
    }
    return {
      uri: { toString: () => uri, scheme: 'file' },
      notebookType: 'myst-notebook',
      getCells: () => cells,
      cellAt: (i: number) => cells[i],
      cellCount: cells.length,
    };
  }

  it('creates Run items for code cells (not markup) when notebook opens', () => {
    const nb = notebookStub('file:///test.md', [
      codeCell(0, 'file:///test.md'),
      markupCell(1, 'file:///test.md'),
      codeCell(2, 'file:///test.md'),
    ]);

    registerCellStatusBar({ subscriptions: [] } as any, mockCtrl);
    vscode.workspace.onDidOpenNotebookDocument.fire(nb);

    // 2 items: one for each code cell (markup cell is skipped)
    expect(createdItems.length).toBe(2);
    expect(createdItems.every((it) => {
      return it.text === '$(play) Run'
        && it.command !== undefined
        && it.alignment === vscode.NotebookCellStatusBarAlignment.Right;
    })).toBe(true);
  });

  it('does not create items for non-myst notebooks', () => {
    const c = codeCell(0, 'file:///test.md');
    const nb = notebookStub('file:///test.md', [c]);
    nb.notebookType = 'python-notebook';

    registerCellStatusBar({ subscriptions: [] } as any, mockCtrl);
    vscode.workspace.onDidOpenNotebookDocument.fire(nb);

    expect(createdItems.length).toBe(0);
  });

  it('disposes items when notebook closes', () => {
    const nb = notebookStub('file:///test.md', [codeCell(0, 'file:///test.md')]);

    registerCellStatusBar({ subscriptions: [] } as any, mockCtrl);
    vscode.workspace.onDidOpenNotebookDocument.fire(nb);
    expect(createdItems.length).toBe(1);

    vscode.workspace.onDidCloseNotebookDocument.fire(nb);
    expect(disposedCount).toBe(1);
  });

  it('adds items for new cells and disposes for removed cells on cell change', () => {
    const nb = notebookStub('file:///test.md', [codeCell(0, 'file:///test.md')]);

    registerCellStatusBar({ subscriptions: [] } as any, mockCtrl);
    vscode.workspace.onDidOpenNotebookDocument.fire(nb);
    expect(createdItems.length).toBe(1);
    expect(disposedCount).toBe(0);

    // Cell change: notebook now has no code cells → existing item disposed
    const emptyNb = notebookStub('file:///test.md', []);
    vscode.workspace.onDidChangeNotebookDocument.fire({
      notebook: emptyNb,
      contentChanges: [{ addedCells: [], removedCells: [codeCell(0, 'file:///test.md')] }],
    });
    expect(disposedCount).toBe(1);
  });

  it('marks item as running while execute is in flight', async () => {
    // Use a manually-resolved promise so we can observe the "running" state
    let resolveExec: () => void;
    const execPromise = new Promise<void>((r) => { resolveExec = r; });
    mockCtrl.execute = vi.fn().mockReturnValue(execPromise);

    const uri = 'file:///test.md';
    const cell = codeCell(0, uri);
    const nb = notebookStub(uri, [cell]);

    registerCellStatusBar({ subscriptions: [] } as any, mockCtrl);
    vscode.workspace.onDidOpenNotebookDocument.fire(nb);

    const item = createdItems[0];
    expect(item.text).toBe('$(play) Run');
    expect(item.command).toBeDefined();

    // Start execution — don't await yet
    const running = mockCtrl.execute([cell], nb);
    // Item should now show running
    expect(item.text).toBe('$(sync~spin) Running...');
    expect(item.command).toBeUndefined();

    // Let execution finish
    resolveExec!();
    await running;

    // Item should be restored
    expect(item.text).toBe('$(play) Run');
    expect(item.command).toBeDefined();
  });

  it('restores Run state even if execution throws', async () => {
    mockCtrl.execute = vi.fn().mockRejectedValue(new Error('boom'));

    const uri = 'file:///test.md';
    const cell = codeCell(0, uri);
    const nb = notebookStub(uri, [cell]);

    registerCellStatusBar({ subscriptions: [] } as any, mockCtrl);
    vscode.workspace.onDidOpenNotebookDocument.fire(nb);

    const item = createdItems[0];
    expect(item.text).toBe('$(play) Run');

    await expect(mockCtrl.execute([cell], nb)).rejects.toThrow('boom');

    // Item should be restored even on error
    expect(item.text).toBe('$(play) Run');
    expect(item.command).toBeDefined();
  });
});
