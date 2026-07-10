import * as vscode from 'vscode';
import { hideInputFromCellMetadata } from './core/tags';

/**
 * Mirror each code cell's MyST hide-input / hide-cell tag on open.
 *
 * The source of truth for whether a code cell's input should be collapsed is its
 * MyST tags, carried verbatim in `metadata.myst.options` (the `:tags: [...]` line).
 * VS Code does NOT reliably honor `inputCollapsed` set in serializer/NotebookData
 * metadata on open — it often reads collapse state from its own store instead — so
 * this module is the fallback: after a MyST notebook opens we apply a runtime
 * `NotebookEdit.updateCellMetadata`, which DOES force VS Code to apply the collapse.
 * Tagged cells are collapsed; untagged cells are left expanded.
 *
 * This only touches in-memory cell metadata; `cellsToText` ignores everything except
 * `metadata.myst`, so the saved `.md` is unaffected (round-trip preserved). An edit is
 * emitted only when a cell's live `inputCollapsed` DIFFERS from the tag-driven desired
 * state, so we never dirty a notebook that already matches. This is a one-shot-on-open
 * reconciliation (open + already-open documents), NOT an ongoing listener — we mirror
 * the tag intent once and then leave the user free to expand or collapse cells for the
 * rest of the session without being fought.
 */
export function registerInputCollapse(context: vscode.ExtensionContext) {
  const collapse = (nb: vscode.NotebookDocument) => {
    if (nb.notebookType !== 'myst-notebook') return;
    const edits = nb
      .getCells()
      .filter((c) => c.kind === vscode.NotebookCellKind.Code)
      .flatMap((c) => {
        const cellMeta = (c.metadata as Record<string, unknown> | undefined) ?? {};
        // Desired state derives from the SOURCE OF TRUTH — the MyST tags — not from
        // re-reading `inputCollapsed` (which VS Code may not have honored on open).
        const desired = hideInputFromCellMetadata(cellMeta);
        // The cell's CURRENT live collapse state as VS Code sees it.
        const current = cellMeta.inputCollapsed === true;
        // Only emit an edit when the live state DIFFERS from the desired state, so we
        // never dirty a notebook that already matches, and never re-collapse a cell the
        // user expanded to fight the intended tag state mid-session.
        if (current === desired) return [];
        const next = { ...cellMeta, inputCollapsed: desired };
        return [vscode.NotebookEdit.updateCellMetadata(c.index, next)];
      });
    if (edits.length === 0) return;
    const we = new vscode.WorkspaceEdit();
    we.set(nb.uri, edits);
    void vscode.workspace.applyEdit(we);
  };

  // Already-open MyST notebooks (e.g. on window reload), plus any opened later.
  vscode.workspace.notebookDocuments.forEach(collapse);
  context.subscriptions.push(vscode.workspace.onDidOpenNotebookDocument(collapse));
}
