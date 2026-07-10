import * as vscode from 'vscode';
import { hasOpenConstruct } from './core/blockSplitter';
import { textToCells } from './core/serializer';
import { rawCellToData } from './cellFactory';
import { matchClosedShorthandFence } from './core/shorthand';
import { planShorthandExpansion } from './core/shorthandExpansion';
import { log } from './log';

/**
 * Registers the Enter-to-split command for MyST notebook markdown cells.
 *
 * Behavior: when invoked (Enter pressed while editing a markup cell in a
 * `myst-notebook`), if the cursor is inside an unclosed `$$`/`:::`/``` construct,
 * or the cell is empty/whitespace, insert a plain newline. Otherwise finalise the
 * current cell and open a new empty one below.
 *
 * Focus strategy (hard-won; see inline comments):
 *   notebook.cell.edit      → NEVER USE after replaceCells. It reads VS Code's
 *                             internal focused-cell pointer, which resets to cell 0
 *                             after any structural replaceCells edit, regardless of
 *                             nbEditor.selection.
 *   showTextDocument        → NEVER USE for notebook-cell URIs. Throws an error.
 *   showNotebookDocument    → resets focus to cell 0 after a replaceCells edit.
 *   notebook.focusNextEditor→ resets focus to cell 0 after a replaceCells edit.
 *   notebook.cell.quitEdit  → finalises current cell WITHOUT changing which cell
 *   + insertCells (additive)    has VS Code's internal focus pointer. insertCells
 *                             (WorkspaceEdit, additive) inserts the new cell without
 *                             corrupting the pointer. Then set nbEditor.selection +
 *                             notebook.cell.edit reliably enters the new cell. ✓
 *
 * Kind-converting paths (shorthand, multi-block) use replaceCells and accept
 * best-effort focus; the common path uses additive insert + enterEdit.
 */
export function registerEnterSplit(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('myst-notebook.onEnter', async () => {
      log('[onEnter] fired');
      const editor = vscode.window.activeTextEditor;
      if (!editor) return insertNewline();

      const cell = findCellForDocument(editor.document);
      if (!cell || cell.kind !== vscode.NotebookCellKind.Markup ||
          cell.notebook.notebookType !== 'myst-notebook') {
        return insertNewline();
      }

      const fullText = editor.document.getText();
      const cursorOffset = editor.document.offsetAt(editor.selection.active);
      const textBeforeCursor = fullText.slice(0, cursorOffset);

      // Capture the cell index ONCE, before any structural edit. `NotebookCell.index`
      // is a LIVE getter: after `replaceCells` removes this cell object from the
      // notebook, `cell.index` returns -1, which fed a `new NotebookRange(-1, 0)` and
      // threw "Illegal argument: start must be positive". replaceCells([i, i+1], [one])
      // preserves the cell count and reuses index `i`, so this stays valid.
      const cellIndex = cell.index;

      // ── Shorthand expansion (deferred) ─────────────────────────────────────────
      // Both ```run and ```show are INERT until the writer closes the fence. Nothing
      // happens on Enter while the fence is open — the open-construct guard below sees
      // an unclosed backtick fence in textBeforeCursor and inserts a plain newline, so
      // the writer types the body freely. Only once a bare ``` closer sits BEFORE the
      // cursor does the whole block convert:
      //
      //   ```run          →  executable, collapsed {code-cell} python (body = code)
      //   <code>
      //   ```
      //
      //   ```show         →  display-only markup cell wrapping a ```python fence
      //   <code>             (highlighted, never executed)
      //   ```
      //
      // We match textBeforeCursor (NOT the whole cell) precisely so VS Code's
      // auto-inserted closing ``` — dropped in the instant you type the opener — does
      // NOT count as "closed" while the cursor still sits above it. The cursor must be
      // past the final ``` for expansion to fire.
      const shorthand = matchClosedShorthandFence(textBeforeCursor);
      log(`[onEnter] shorthand match = ${shorthand ? shorthand.keyword : 'none'}`);
      if (shorthand) {
        const plan = planShorthandExpansion(shorthand);
        log(`[onEnter] plan: kind=${plan.cell.kind} autoRun=${plan.autoRun} enterEdit=${plan.enterEdit}`);
        const edit = new vscode.WorkspaceEdit();
        edit.set(cell.notebook.uri, [
          vscode.NotebookEdit.replaceCells(
            new vscode.NotebookRange(cellIndex, cellIndex + 1),
            [rawCellToData(plan.cell)]
          ),
        ]);
        await vscode.workspace.applyEdit(edit);
        await selectCellBestEffort(cell.notebook, cellIndex, { delayMs: 50, enterEdit: plan.enterEdit });
        if (plan.autoRun) {
          // Execute the just-created cell by index range so the writer sees output
          // immediately. Index-addressed (not selection-dependent), so it neither waits
          // on focus settling nor risks the negative-range warning. The controller's
          // execute handler prompts for / retries the kernel on first run.
          log(`[autoRun] firing notebook.cell.execute for index ${cellIndex} (cellCount=${cell.notebook.cellCount})`);
          try {
            await vscode.commands.executeCommand('notebook.cell.execute', {
              ranges: [{ start: cellIndex, end: cellIndex + 1 }],
              document: cell.notebook.uri,
            });
            log('[autoRun] notebook.cell.execute resolved');
          } catch (err) {
            log(`[autoRun] notebook.cell.execute THREW: ${err}`);
          }
        }
        return;
      }

      // Guard: empty/whitespace cell, or inside an open construct → just a newline.
      if (fullText.trim() === '' || hasOpenConstruct(textBeforeCursor)) {
        return insertNewline();
      }

      const allCells = textToCells(fullText);

      if (allCells.length === 1) {
        // ── Common path ──────────────────────────────────────────────────────────
        // Single paragraph, no blank-line split needed.
        // DO NOT use replaceCells: it resets VS Code's internal focused-cell pointer
        // to cell 0, making all subsequent focus commands land on the wrong cell.
        //
        // Strategy: quit edit mode (renders current cell, keeps focus on it), then
        // insert a new empty markup cell immediately below via WorkspaceEdit+insertCells
        // (additive — does NOT corrupt the focus pointer), set nbEditor.selection to
        // the new cell, then enter edit mode. notebook.cell.edit reads nbEditor.selection
        // reliably when the focus pointer was not disturbed by a structural edit.
        //
        // delayMs is 50 (aligned with the other paths): it runs BEFORE insertCells,
        // letting the inserted cell settle into the notebook model so the subsequent
        // nbEditor.selection set reliably lands on the new cell. The extra ~20ms over
        // the old value is imperceptible.
        //
        // cursorToStart is a best-effort, no-op-safe safeguard, not a load-bearing
        // step: the new cell is empty, so offset 0 is its only caret position and VS
        // Code already lands the caret there on entering edit mode. The pin merely
        // reasserts offset 0 where the cell's text editor is already resolvable, and
        // harmlessly no-ops when it is not (it usually is not yet — that editor
        // appears on a render tick after enterEdit).
        await vscode.commands.executeCommand('notebook.cell.quitEdit');

        const newCell = new vscode.NotebookCellData(
          vscode.NotebookCellKind.Markup, '', 'markdown'
        );
        const insertEdit = new vscode.WorkspaceEdit();
        insertEdit.set(cell.notebook.uri, [
          vscode.NotebookEdit.insertCells(cellIndex + 1, [newCell]),
        ]);
        await vscode.workspace.applyEdit(insertEdit);

        await selectCellBestEffort(cell.notebook, cellIndex + 1, {
          delayMs: 50,
          enterEdit: true,
          cursorToStart: true,
        });

      } else {
        // ── Edge-case path ───────────────────────────────────────────────────────
        // Multiple blocks (user has blank lines in this cell, which should not
        // happen in normal typing with the new Enter model, but handle gracefully).
        // Use replaceCells for content correctness; focus is best-effort.
        const newCells = allCells.map(rawCellToData);
        const trailing = new vscode.NotebookCellData(
          vscode.NotebookCellKind.Markup, '', 'markdown'
        );
        const edit = new vscode.WorkspaceEdit();
        edit.set(cell.notebook.uri, [
          vscode.NotebookEdit.replaceCells(
            new vscode.NotebookRange(cellIndex, cellIndex + 1),
            [...newCells, trailing]
          ),
        ]);
        await vscode.workspace.applyEdit(edit);
        // Best-effort: set selection on the trailing cell. The user may need to
        // click to enter edit mode (focus pointer reset is a known VS Code limitation
        // after replaceCells; no reliable programmatic workaround exists).
        const newIndex = cellIndex + newCells.length;
        await selectCellBestEffort(cell.notebook, newIndex, { delayMs: 50 });
      }
    })
  );
}

export function insertNewline(): Thenable<unknown> {
  return vscode.commands.executeCommand('default:type', { text: '\n' });
}

function findCellForDocument(doc: vscode.TextDocument): vscode.NotebookCell | undefined {
  for (const nb of vscode.workspace.notebookDocuments) {
    for (const cell of nb.getCells()) {
      if (cell.document === doc) return cell;
    }
  }
  return undefined;
}

/**
 * After a structural notebook edit, VS Code needs a beat before the editor list
 * reflects the new/replaced cells. Wait, re-resolve the notebook editor by URI,
 * and best-effort move the selection to `index`. Optionally enter edit mode.
 * The delay is empirical settle time; all call sites currently pass 50ms.
 *
 * When `cursorToStart` is set (common path only), after edit mode is entered we
 * also pin the text-editor caret to offset (0,0) of the new cell so its landing
 * position is deterministic instead of relying on VS Code's default. We locate the
 * cell's text editor by matching its document URI, so this can only ever act on the
 * intended cell — if the editor isn't resolvable yet it is a harmless no-op. This is
 * NOT one of the NEVER-USE APIs: it sets a TextEditor.selection on the cell's own
 * document, it does not touch the notebook's focused-cell pointer.
 */
async function selectCellBestEffort(
  nb: vscode.NotebookDocument,
  index: number,
  opts?: { delayMs?: number; enterEdit?: boolean; cursorToStart?: boolean }
): Promise<void> {
  const delayMs = opts?.delayMs ?? 50;
  await new Promise<void>(resolve => setTimeout(resolve, delayMs));
  const nbEditor = vscode.window.visibleNotebookEditors.find(
    e => e.notebook.uri.toString() === nb.uri.toString()
  );
  if (nbEditor && index >= 0 && nb.cellCount > index) {
    nbEditor.selection = new vscode.NotebookRange(index, index + 1);
    if (opts?.enterEdit) {
      await vscode.commands.executeCommand('notebook.cell.edit');
      if (opts?.cursorToStart) {
        // Pin the caret to the start of the freshly entered cell. Match by the
        // cell's own document URI so we never touch the wrong editor; no-op if the
        // text editor hasn't materialised yet (edit mode still succeeded).
        const cellUri = nb.cellAt(index).document.uri.toString();
        const cellEditor = vscode.window.visibleTextEditors.find(
          e => e.document.uri.toString() === cellUri
        );
        if (cellEditor) {
          cellEditor.selection = new vscode.Selection(0, 0, 0, 0);
        }
      }
    }
  }
}
