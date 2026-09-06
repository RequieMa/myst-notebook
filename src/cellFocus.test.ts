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
    opts: { selections?: Array<{ start: number; end: number; isEmpty: boolean }>; cellKind?: number } = {},
  ): void {
    const cellKind = opts.cellKind ?? 1;
    const nb = makeNotebook(notebookType);
    nb.cellAt = (i: number) => ({ index: i, kind: cellKind, document: { uri: { toString: () => `cell://${i}` } } });

    const selections = opts.selections ?? [{ start: 0, end: 1, isEmpty: false }];

    vscode.window.onDidChangeNotebookEditorSelection.fire({
      notebookEditor: { notebook: nb, selections },
      selections,
    } as any);
  }

  it('edits a single selected markup cell', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { selections: [{ start: 0, end: 1, isEmpty: false }] });

    await vi.advanceTimersByTimeAsync(60);
    expect(callArgs.some((c) => c.command === 'notebook.cell.edit')).toBe(true);
  });

  it('skips code cells', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { cellKind: 2 });
    await vi.advanceTimersByTimeAsync(60);
    expect(callArgs.some((c) => c.command === 'notebook.cell.edit')).toBe(false);
  });

  it('skips non-myst notebooks', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('jupyter-notebook');
    await vi.advanceTimersByTimeAsync(60);
    expect(callArgs.some((c) => c.command === 'notebook.cell.edit')).toBe(false);
  });

  it('skips empty selection', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { selections: [{ start: 0, end: 0, isEmpty: true }] });
    await vi.advanceTimersByTimeAsync(60);
    expect(callArgs.some((c) => c.command === 'notebook.cell.edit')).toBe(false);
  });

  it('skips disjoint multi-select', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', {
      selections: [
        { start: 0, end: 1, isEmpty: false },
        { start: 1, end: 2, isEmpty: false },
        { start: 2, end: 3, isEmpty: false },
      ],
    });
    await vi.advanceTimersByTimeAsync(60);
    expect(callArgs.some((c) => c.command === 'notebook.cell.edit')).toBe(false);
  });

  it('skips a contiguous multi-cell selection', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { selections: [{ start: 0, end: 3, isEmpty: false }] });
    await vi.advanceTimersByTimeAsync(60);
    expect(callArgs.some((c) => c.command === 'notebook.cell.edit')).toBe(false);
  });

  it('ignores re-entrant selection events fired by its own edit/quitEdit commands', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);

    // User selects a markup cell → handler starts and awaits quitEditAllCells.
    fireSelection('myst-notebook', { selections: [{ start: 0, end: 1, isEmpty: false }] });
    // VS Code's notebook.cell.edit / quitEdit fire the selection event again
    // (unconditionally, even when the selection is unchanged). This echo must
    // not re-enter the handler, or it loops edit→quitEdit→edit forever.
    fireSelection('myst-notebook', { selections: [{ start: 0, end: 1, isEmpty: false }] });

    await vi.advanceTimersByTimeAsync(60);
    const editCalls = callArgs.filter((c) => c.command === 'notebook.cell.edit');
    expect(editCalls.length).toBe(1);
  });

  it('auto-previews all editing cells when the selection changes', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);
    fireSelection('myst-notebook', { selections: [{ start: 0, end: 1, isEmpty: false }] });
    await vi.advanceTimersByTimeAsync(60);
    expect(callArgs.some((c) => c.command === 'notebook.quitEditAllCells')).toBe(true);
  });

  it('does not re-enter edit mode when the same cell is re-selected (Escape quit)', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);

    // First selection enters edit mode.
    fireSelection('myst-notebook', { selections: [{ start: 0, end: 1, isEmpty: false }] });
    await vi.advanceTimersByTimeAsync(60);

    // Escape quits edit: VS Code fires the selection event again for the same
    // cell. This must NOT re-enter edit mode.
    fireSelection('myst-notebook', { selections: [{ start: 0, end: 1, isEmpty: false }] });
    await vi.advanceTimersByTimeAsync(60);

    const editCalls = callArgs.filter((c) => c.command === 'notebook.cell.edit');
    expect(editCalls.length).toBe(1);
  });

  it('re-enters edit mode after Escape when a non-adjacent cell is clicked', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);

    fireSelection('myst-notebook', { selections: [{ start: 0, end: 1, isEmpty: false }] });
    await vi.advanceTimersByTimeAsync(60);

    // Escape quits cell 0 (same selection, no re-edit).
    fireSelection('myst-notebook', { selections: [{ start: 0, end: 1, isEmpty: false }] });
    await vi.advanceTimersByTimeAsync(60);

    // Clicking a non-adjacent cell should enter edit mode again.
    fireSelection('myst-notebook', { selections: [{ start: 3, end: 4, isEmpty: false }] });
    await vi.advanceTimersByTimeAsync(60);

    const editCalls = callArgs.filter((c) => c.command === 'notebook.cell.edit');
    expect(editCalls.length).toBe(2);
  });

  it('does not enter edit mode for adjacent arrow-key moves after Escape', async () => {
    registerSingleClickEdit({ subscriptions: [] } as any);

    fireSelection('myst-notebook', { selections: [{ start: 0, end: 1, isEmpty: false }] });
    await vi.advanceTimersByTimeAsync(60);

    // Escape quits cell 0.
    fireSelection('myst-notebook', { selections: [{ start: 0, end: 1, isEmpty: false }] });
    await vi.advanceTimersByTimeAsync(60);

    // Arrow keys move the selection one cell at a time: no edit.
    fireSelection('myst-notebook', { selections: [{ start: 1, end: 2, isEmpty: false }] });
    await vi.advanceTimersByTimeAsync(60);
    fireSelection('myst-notebook', { selections: [{ start: 2, end: 3, isEmpty: false }] });
    await vi.advanceTimersByTimeAsync(60);

    const editCalls = callArgs.filter((c) => c.command === 'notebook.cell.edit');
    expect(editCalls.length).toBe(1);
  });
});
