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

  function fireSelection(
    notebookType: string,
    opts: { isEmpty?: boolean; multiSelect?: boolean; cellKind?: number } = {},
  ): void {
    const isEmpty = opts.isEmpty ?? false;
    const multiSelect = opts.multiSelect ?? false;
    const cellKind = opts.cellKind ?? 1; // default to Markup
    const startIdx = 0;
    vscode.window.onDidChangeNotebookEditorSelection.fire({
      notebookEditor: {
        notebook: {
          notebookType,
          cellAt: (i: number) => ({ index: i, kind: cellKind, document: { uri: { toString: () => `cell://${i}` } } }),
          cellCount: multiSelect ? 3 : 1,
          uri: { toString: () => 'file:///test.md' },
        },
        selection: {
          isEmpty,
          start: startIdx,
          end: multiSelect ? 3 : 1,
        },
      },
      selection: {
        isEmpty,
        start: startIdx,
        end: multiSelect ? 3 : 1,
      },
    } as any);
  }

  it('triggers notebook.cell.edit for markup cell after delay', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { cellKind: 1 }); // Markup cell

    // Not fired synchronously
    expect(editCalls).not.toContain('notebook.cell.edit');

    // Advance past the outer 50ms + inner 10ms timeouts
    await vi.advanceTimersByTimeAsync(60);

    expect(editCalls).toContain('notebook.cell.edit');
  });

  it('skips code cells (kind=2) — they auto-enter edit on click', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { cellKind: 2 }); // Code cell
    await vi.advanceTimersByTimeAsync(60);
    expect(editCalls).not.toContain('notebook.cell.edit');
  });

  it('skips when notebook type is not myst-notebook', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('jupyter-notebook');
    await vi.advanceTimersByTimeAsync(60);
    expect(editCalls).not.toContain('notebook.cell.edit');
  });

  it('skips when selection is empty', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { isEmpty: true });
    await vi.advanceTimersByTimeAsync(60);
    expect(editCalls).not.toContain('notebook.cell.edit');
  });

  it('skips multi-select (Shift+click)', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { multiSelect: true });
    await vi.advanceTimersByTimeAsync(60);
    expect(editCalls).not.toContain('notebook.cell.edit');
  });
});
