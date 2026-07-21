import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from './__stubs__/vscode';
import { registerSingleClickEdit } from './cellFocus';

// Save the original executeCommand so we can restore it before each test.
const _origExecuteCommand = vscode.commands.executeCommand;

describe('cellFocus', () => {
  let editCalls: string[] = [];

  beforeEach(() => {
    editCalls = [];

    // Clear listeners accumulated from previous tests
    vscode.window.onDidChangeNotebookEditorSelection.reset();

    // Restore and then spy on executeCommand (always chain from the original)
    vscode.commands.executeCommand = (command: string, ...args: any[]) => {
      editCalls.push(command);
      return _origExecuteCommand(command, ...args);
    };
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
        end: multiSelect ? 2 : 0,
      },
    } as any);
  }

  it('triggers notebook.cell.edit on single-cell selection in myst-notebook', () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook');
    expect(editCalls).toContain('notebook.cell.edit');
  });

  it('skips when notebook type is not myst-notebook', () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('jupyter-notebook');
    expect(editCalls).not.toContain('notebook.cell.edit');
  });

  it('skips when selection is empty', () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { isEmpty: true });
    expect(editCalls).not.toContain('notebook.cell.edit');
  });

  it('skips multi-select (Shift+click)', () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { multiSelect: true });
    expect(editCalls).not.toContain('notebook.cell.edit');
  });
});
