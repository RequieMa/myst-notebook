import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from './__stubs__/vscode';
import { registerSingleClickEdit } from './cellFocus';

const _origExecuteCommand = vscode.commands.executeCommand;

describe('cellFocus', () => {
  let callArgs: Array<{ command: string; args: any[] }> = [];

  beforeEach(() => {
    callArgs = [];
    vscode.window.onDidChangeNotebookEditorSelection.reset();
    vscode.commands.executeCommand = (command: string, ...args: any[]) => {
      callArgs.push({ command, args });
      return _origExecuteCommand(command, ...args);
    };
  });

  function makeNotebook(notebookType: string): any {
    return {
      notebookType,
      cellAt: (i: number) => ({
        index: i,
        kind: 1,
        document: { uri: { toString: () => `cell://${i}` } },
      }),
      cellCount: 10,
      uri: { toString: () => 'file:///test.md' },
    };
  }

  function fireSelection(
    notebookType: string,
    opts: { isEmpty?: boolean; multiSelect?: boolean; cellKind?: number } = {},
  ): void {
    const isEmpty = opts.isEmpty ?? false;
    const multiSelect = opts.multiSelect ?? false;
    const cellKind = opts.cellKind ?? 1;
    const nb = makeNotebook(notebookType);
    nb.cellAt = (i: number) => ({ index: i, kind: cellKind, document: { uri: { toString: () => `cell://${i}` } } });

    vscode.window.onDidChangeNotebookEditorSelection.fire({
      notebookEditor: {
        notebook: nb,
        selection: { start: 0, end: 1 },
      },
      selection: {
        isEmpty,
        start: 0,
        end: multiSelect ? 3 : 1,
      },
    } as any);
  }

  it('calls notebook.cell.edit for markup cell in myst-notebook', () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { cellKind: 1 });
    expect(callArgs.some(c => c.command === 'notebook.cell.edit')).toBe(true);
  });

  it('skips code cells', () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { cellKind: 2 });
    expect(callArgs.some(c => c.command === 'notebook.cell.edit')).toBe(false);
  });

  it('skips non-myst notebooks', () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('jupyter-notebook');
    expect(callArgs.some(c => c.command === 'notebook.cell.edit')).toBe(false);
  });

  it('skips empty selection', () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { isEmpty: true });
    expect(callArgs.some(c => c.command === 'notebook.cell.edit')).toBe(false);
  });

  it('skips multi-select', () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { multiSelect: true });
    expect(callArgs.some(c => c.command === 'notebook.cell.edit')).toBe(false);
  });
});
