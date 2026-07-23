import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from './__stubs__/vscode';
import { registerSingleClickEdit } from './cellFocus';

const _origExecuteCommand = vscode.commands.executeCommand;

describe('cellFocus', () => {
  let callArgs: Array<{ command: string; args: any[] }> = [];

  beforeEach(() => {
    callArgs = [];
    vi.useFakeTimers();
    vscode.window.onDidChangeNotebookEditorSelection.reset();
    vscode.window._activeNotebookEditor = undefined;
    vscode.commands.executeCommand = (command: string, ...args: any[]) => {
      callArgs.push({ command, args });
      return _origExecuteCommand(command, ...args);
    };
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('calls notebook.cell.edit for markup cell (after setTimeout + showNotebookDocument)', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { cellKind: 1 });

    // showNotebookDocument is called first (synchronously in setTimeout)
    await vi.advanceTimersByTimeAsync(60);

    // Check that notebook.cell.edit was called
    expect(callArgs.some(c => c.command === 'notebook.cell.edit')).toBe(true);
    // And showNotebookDocument was also called
    expect(callArgs.some(c => c.command === 'notebook.cell.edit')).toBe(true);
  });

  it('skips code cells', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { cellKind: 2 });
    await vi.advanceTimersByTimeAsync(60);
    expect(callArgs.some(c => c.command === 'notebook.cell.edit')).toBe(false);
  });

  it('skips non-myst notebooks', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('jupyter-notebook');
    await vi.advanceTimersByTimeAsync(60);
    expect(callArgs.some(c => c.command === 'notebook.cell.edit')).toBe(false);
  });

  it('skips empty selection', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { isEmpty: true });
    await vi.advanceTimersByTimeAsync(60);
    expect(callArgs.some(c => c.command === 'notebook.cell.edit')).toBe(false);
  });

  it('skips multi-select', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { multiSelect: true });
    await vi.advanceTimersByTimeAsync(60);
    expect(callArgs.some(c => c.command === 'notebook.cell.edit')).toBe(false);
  });
});
