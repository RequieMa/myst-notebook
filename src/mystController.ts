import * as vscode from 'vscode';
import { log } from './log';
import { listEnvironments } from './pythonEnvService';
import { resolveKernel } from './core/kernelResolution';
import type { KernelSpecInfo } from './core/kernelRanking';
import { pickKernel } from './kernelPicker';
import { ensureRuntime } from './envSetup';
import { startServerKernel, type KernelSession } from './kernelSession';
import { deriveCellSuccess, messageFor } from './core/failurePolicy';

const DEFAULT_ENV_KEY = 'myst-notebook.defaultKernelId';

// Stream mimes that VS Code concatenates when appended into one output block.
// Kept in sync with kernelSession's mapIOPub.
const STDOUT_MIME = 'application/vnd.code.notebook.stdout';
const STDERR_MIME = 'application/vnd.code.notebook.stderr';
// The mime an IOPub error message maps to (see kernelSession.mapIOPub). A cell
// that streams this ran a kernel-side execution error; used to derive an honest
// success flag since kernel errors arrive as output, not as a thrown exception.
const ERROR_MIME = 'application/vnd.code.notebook.error';

export class MystController {
  private readonly controller: vscode.NotebookController;
  private readonly sessions = new Map<string, KernelSession>();
  private readonly pending = new Map<string, Promise<KernelSession | undefined>>();

  constructor(private readonly memento: vscode.Memento) {
    this.controller = vscode.notebooks.createNotebookController(
      'myst-notebook-controller',
      'myst-notebook',
      'MyST (Jupyter)'
    );
    this.controller.supportedLanguages = ['python'];
    this.controller.supportsExecutionOrder = true;
    this.controller.executeHandler = this.execute.bind(this);
    // Toolbar stop button: registering an interruptHandler makes VS Code route
    // the notebook stop button to it (not to the per-cell cancellation token),
    // so kernelSession's token.onCancellationRequested does not fire for the
    // toolbar stop — there's no double-interrupt. Both paths ultimately call
    // kernel.interrupt(), which is safe.
    this.controller.interruptHandler = (notebook) => {
      const s = this.sessions.get(notebook.uri.toString());
      return s ? s.interrupt() : Promise.resolve();
    };
  }

  private async resolveSession(
    notebook: vscode.NotebookDocument
  ): Promise<KernelSession | undefined> {
    const key = notebook.uri.toString();
    const cached = this.sessions.get(key);
    if (cached) {
      // Death-recovery: a stale session's kernel has died or disconnected. Evict
      // and dispose it (best-effort) so we fall through to a fresh start below.
      // The persisted default means re-resolve won't re-prompt.
      if (cached.isStale) {
        log('[controller] cached session stale -> evict + re-resolve');
        this.sessions.delete(key);
        void cached.dispose();
      } else {
        return cached;
      }
    }

    // Dedup concurrent starts for the same notebook: a second run-cell click (or
    // an auto-run overlapping a manual run) must await the in-flight start rather
    // than launch a second Jupyter server that then leaks when its session is
    // overwritten in this.sessions.
    const inFlight = this.pending.get(key);
    if (inFlight) return await inFlight;

    const promise = this.doResolveSession(key);
    this.pending.set(key, promise);
    try {
      return await promise;
    } finally {
      this.pending.delete(key);
    }
  }

  private async doResolveSession(key: string): Promise<KernelSession | undefined> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

    const specs = await listEnvironments();
    const storedDefault = this.memento.get<string>(DEFAULT_ENV_KEY);
    const decision = resolveKernel({
      workspaceDefaultId: storedDefault,
      availableSpecs: specs,
    });
    log(
      '[kernel] decision=' +
        decision.kind +
        ' specs=' +
        specs.length +
        ' default=' +
        (storedDefault ?? '<none>')
    );

    let chosenSpec: KernelSpecInfo | undefined;
    let persist = false;
    switch (decision.kind) {
      case 'use':
      case 'needsIpykernel':
        chosenSpec = specs.find((s) => s.id === decision.specId);
        persist = false;
        break;
      case 'pick':
        chosenSpec = await pickKernel(specs, workspaceRoot);
        if (chosenSpec === undefined) {
          log('[kernel] pick dismissed');
          return undefined;
        }
        persist = true;
        break;
      case 'none':
        vscode.window.showErrorMessage(messageFor('noPython'));
        return undefined;
      default: {
        const _never: never = decision;
        void _never;
        return undefined;
      }
    }

    if (chosenSpec === undefined) {
      log('[kernel] chosen spec not found');
      return undefined;
    }

    if (!(await ensureRuntime(chosenSpec))) {
      return undefined;
    }

    if (chosenSpec.interpreterPath === undefined) {
      vscode.window.showErrorMessage(messageFor('noInterpreterPath'));
      return undefined;
    }

    const session = await startServerKernel(chosenSpec.interpreterPath);
    if (!session) {
      log('[kernel] chosen=' + chosenSpec.id + ' start=fail');
      vscode.window.showErrorMessage(messageFor('serverStartFailed'));
      return undefined;
    }
    log('[kernel] chosen=' + chosenSpec.id + ' start=ok');

    if (persist) {
      await this.memento.update(DEFAULT_ENV_KEY, chosenSpec.id);
    }
    this.sessions.set(key, session);
    return session;
  }

  private async execute(
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument
  ): Promise<void> {
    log(`[controller.execute] invoked for ${cells.length} cell(s)`);
    const session = await this.resolveSession(notebook);
    if (!session) return;

    for (const cell of cells) {
      const exec = this.controller.createNotebookCellExecution(cell);
      exec.start(Date.now());
      let started = false;
      try {
        // Incremental streaming: flush each IOPub part to the cell as it
        // arrives so long-running cells show output as it happens, not only
        // after `future.done`.
        //
        // Coalescing rule: successive stdout chunks (and successive stderr
        // chunks) append into the SAME output block so the cell reads like a
        // console. stdout and stderr are distinct mimes -> two separate
        // coalescing buckets: a stderr chunk after stdout, or any rich output
        // (execute_result/display_data) or error, starts a NEW output block
        // and resets the current-stream reference. The first output overall
        // uses replaceOutput (clearing any prior run); later ones append.
        let currentStreamOutput: vscode.NotebookCellOutput | undefined;
        let currentStreamMime: string | undefined;
        let blocks = 0;
        let sawError = false;

        for await (const part of session.executeCode(cell.document.getText(), exec.token)) {
          if (part.items.length === 0) continue;
          // A kernel-side execution error arrives as an error output block, not
          // as a thrown exception (kernelSession's generator resolves normally),
          // so note it here to fail the cell below.
          if (part.items.some((item) => item.mime === ERROR_MIME)) {
            sawError = true;
          }
          const streamMime =
            part.items.length === 1 &&
            (part.items[0].mime === STDOUT_MIME || part.items[0].mime === STDERR_MIME)
              ? part.items[0].mime
              : undefined;

          // Same-stream chunk: coalesce into the open block.
          if (streamMime && currentStreamOutput && streamMime === currentStreamMime) {
            await exec.appendOutputItems(
              new vscode.NotebookCellOutputItem(part.items[0].data, streamMime),
              currentStreamOutput
            );
            continue;
          }

          // Otherwise start a fresh output block for this part.
          const output = new vscode.NotebookCellOutput(
            part.items.map((item) => new vscode.NotebookCellOutputItem(item.data, item.mime))
          );
          if (!started) {
            await exec.replaceOutput([output]);
            started = true;
          } else {
            await exec.appendOutput(output);
          }
          blocks++;

          // Only stream blocks stay open for coalescing; rich outputs don't.
          currentStreamMime = streamMime;
          currentStreamOutput = streamMime ? output : undefined;
        }

        // No output at all: clear any prior run's outputs.
        if (!started) {
          await exec.replaceOutput([]);
        }
        // Derive the cell's success flag rather than assuming the loop
        // completing means success: kernel execution errors arrive as an error
        // output block (they never throw here), and a mid-run kernel death marks
        // the session stale. So the cell succeeded only if no error block
        // streamed AND the session is still live.
        const ok = deriveCellSuccess({ sawError, isStale: session.isStale });
        log(`[controller] cell finished ok=${ok}, ${blocks} output block(s)`);
        exec.end(ok, Date.now());
      } catch (err) {
        const errorBlock = new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.error(err as Error),
        ]);
        if (started) {
          await exec.appendOutput(errorBlock);
        } else {
          await exec.replaceOutput([errorBlock]);
        }
        exec.end(false, Date.now());
      }
    }

    // Bug 2: when Shift+Enter executes the last cell and it's a code cell,
    // VS Code auto-creates another code cell below. For MyST notebooks the
    // default should be Markdown — most cells are prose. Schedule a one-shot
    // check after VS Code's auto-insert to convert the new empty code cell.
    this.scheduleAutoCellFix(notebook, cells);
  }

  private scheduleAutoCellFix(
    notebook: vscode.NotebookDocument,
    cells: readonly vscode.NotebookCell[]
  ): void {
    const executedLastCodeCell = cells.some(
      (c) =>
        c.kind === vscode.NotebookCellKind.Code &&
        c.index === notebook.cellCount - 1
    );
    if (!executedLastCodeCell) return;

    const notebookUri = notebook.uri.toString();
    setTimeout(async () => {
      // Re-fetch: the document may have changed since execution ended.
      const nb = vscode.workspace.notebookDocuments.find(
        (n) => n.uri.toString() === notebookUri
      );
      if (!nb || nb.cellCount === 0) return;
      const lastCell = nb.cellAt(nb.cellCount - 1);
      // Only replace the auto-created cell: empty code cell at the end.
      if (
        lastCell.kind === vscode.NotebookCellKind.Code &&
        lastCell.document.getText() === ''
      ) {
        const edit = new vscode.WorkspaceEdit();
        edit.set(nb.uri, [
          vscode.NotebookEdit.replaceCells(
            new vscode.NotebookRange(nb.cellCount - 1, nb.cellCount),
            [
              new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                '',
                'markdown'
              ),
            ]
          ),
        ]);
        await vscode.workspace.applyEdit(edit);
        log('[controller] auto-cell-fix: replaced empty code cell with markup');
      }
    }, 100);
  }

  /** Command handler: restart the active notebook's kernel, clearing its state. */
  async restartActiveKernel(): Promise<void> {
    const notebook = vscode.window.activeNotebookEditor?.notebook;
    const session = notebook ? this.sessions.get(notebook.uri.toString()) : undefined;
    if (!session) {
      vscode.window.showInformationMessage(messageFor('noActiveKernel'));
      return;
    }
    const ok = await session.restart();
    if (ok) {
      vscode.window.showInformationMessage('MyST Notebook: kernel restarted.');
    } else {
      vscode.window.showErrorMessage(messageFor('restartFailed'));
    }
  }

  /** Command handler: interrupt the active notebook's running kernel. */
  async interruptActiveKernel(): Promise<void> {
    const notebook = vscode.window.activeNotebookEditor?.notebook;
    const session = notebook ? this.sessions.get(notebook.uri.toString()) : undefined;
    if (!session) {
      vscode.window.showInformationMessage(messageFor('noActiveKernel'));
      return;
    }
    await session.interrupt();
  }

  dispose() {
    for (const s of this.sessions.values()) {
      void s.dispose();
    }
    this.sessions.clear();
    this.controller.dispose();
  }
}
