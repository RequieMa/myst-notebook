import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from './__stubs__/vscode';
import { registerCellStatusBar } from './cellStatusBar';

describe('cellStatusBar', () => {
  let mockCtrl: any;
  let executionEmitter: vscode.EventEmitter<any>;

  beforeEach(() => {
    executionEmitter = new vscode.EventEmitter<any>();
    mockCtrl = { onDidChangeCellExecution: executionEmitter.event } as any;
    vscode.notebooks._resetStatusBarProviders();
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

  /** Registers the status bar and returns the single captured provider. */
  function register(): vscode.NotebookCellStatusBarItemProvider {
    registerCellStatusBar({ subscriptions: [] } as any, mockCtrl);
    expect(vscode.notebooks._statusBarProviders.length).toBe(1);
    return vscode.notebooks._statusBarProviders[0];
  }

  function itemsFor(cell: any): vscode.NotebookCellStatusBarItem[] {
    return register().provideCellStatusBarItems(cell) as vscode.NotebookCellStatusBarItem[];
  }

  it('returns a Run item for code cells', () => {
    const items = itemsFor(codeCell(0, 'file:///test.md'));
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('$(play) Run');
    expect(items[0].command).toBeDefined();
    expect(items[0].alignment).toBe(vscode.NotebookCellStatusBarAlignment.Right);
  });

  it('returns no item for markup cells', () => {
    expect(itemsFor(markupCell(1, 'file:///test.md'))).toEqual([]);
  });

  it('shows Running... when execution starts', () => {
    const provider = register();
    const cell = codeCell(0, 'file:///test.md');

    executionEmitter.fire({ notebook: cell.notebook, cells: [cell], running: true });

    const items = provider.provideCellStatusBarItems(cell) as vscode.NotebookCellStatusBarItem[];
    expect(items[0].text).toBe('$(sync~spin) Running...');
    expect(items[0].command).toBeUndefined();
  });

  it('restores Run when execution finishes', () => {
    const provider = register();
    const cell = codeCell(0, 'file:///test.md');

    executionEmitter.fire({ notebook: cell.notebook, cells: [cell], running: true });
    executionEmitter.fire({ notebook: cell.notebook, cells: [cell], running: false });

    const items = provider.provideCellStatusBarItems(cell) as vscode.NotebookCellStatusBarItem[];
    expect(items[0].text).toBe('$(play) Run');
    expect(items[0].command).toBeDefined();
  });
});
