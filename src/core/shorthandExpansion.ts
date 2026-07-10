import type { RawCell } from './serializer';
import type { ClosedShorthand } from './shorthand';
import { makeExecutableCell, makeDisplayCodeCell } from './cellTemplates';

/**
 * Turns a matched shorthand fence into a concrete expansion plan: which cell to
 * create, whether the Enter handler should drop into edit mode, and whether the new
 * cell should auto-execute. Pure (VS Code-free) so the run-vs-show branching — the
 * part with real logic — is unit-tested here rather than in the notebook glue.
 *
 *   run  → executable {code-cell} python pre-filled with the body. Auto-runs so the
 *          writer sees output immediately, EXCEPT when the body is empty/whitespace
 *          (running that is a spurious no-op). No edit-mode: execution needs no text
 *          focus, and skipping it avoids focus/run contention.
 *   show → display-only markup cell wrapping the body in a ```python fence. Never
 *          executes; enters edit-mode so the writer keeps editing the markup.
 */
export interface ShorthandExpansionPlan {
  cell: RawCell;
  enterEdit: boolean;
  autoRun: boolean;
}

export function planShorthandExpansion(match: ClosedShorthand): ShorthandExpansionPlan {
  if (match.keyword === 'run') {
    const cell = makeExecutableCell();
    cell.value = match.body;
    return { cell, enterEdit: false, autoRun: match.body.trim() !== '' };
  }
  return { cell: makeDisplayCodeCell(match.body), enterEdit: true, autoRun: false };
}
