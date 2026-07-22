import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from './__stubs__/vscode';
import { registerSingleClickEdit } from './cellFocus';

const _origExecuteCommand = vscode.commands.executeCommand;

describe('cellFocus', () => {
  let editCalls: string[] = [];

  beforeEach(() => {
    editCalls = [];
    vi.useFakeTimers();
    vscode.window.onDidChangeNotebookEditorSelection.reset();
    vscode.commands.executeCommand = (command: string, ...args: any[]) => {
      editCalls.push(command);
      return _origExecuteCommand(command, ...args);
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function fireSelection(notebookType: string, opts: { isEmpty?: boolean; multiSelect?: boolean } = {}): void {
    const isEmpty = opts.isEmpty ?? false;
    const multiSelect = opts.multiSelect ?? false;
    vscode.window.onDidChangeNotebookEditorSelection.fire({
      notebookEditor: {
        notebook: { notebookType },
      },
      selection: {
        isEmpty,
        start: 0,
        end: multiSelect ? 3 : 1,
      },
    } as any);
  }

  it('triggers notebook.cell.edit on single-cell selection in myst-notebook (deferred)', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook');

    // Command should NOT fire synchronously (it's deferred via setTimeout)
    expect(editCalls).not.toContain('notebook.cell.edit');

    // Advance timers → setTimeout(0) fires
    await vi.runAllTimersAsync();

    expect(editCalls).toContain('notebook.cell.edit');
  });

  it('skips when notebook type is not myst-notebook', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('jupyter-notebook');
    await vi.runAllTimersAsync();
    expect(editCalls).not.toContain('notebook.cell.edit');
  });

  it('skips when selection is empty', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { isEmpty: true });
    await vi.runAllTimersAsync();
    expect(editCalls).not.toContain('notebook.cell.edit');
  });

  it('skips multi-select (Shift+click)', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { multiSelect: true });
    await vi.runAllTimersAsync();
    expect(editCalls).not.toContain('notebook.cell.edit');
  });
});
