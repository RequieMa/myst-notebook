import * as vscode from 'vscode';
import {
  clampFontSize,
  resolveFontSize,
  FONT_SIZE_PRESETS,
  FONT_SIZE_STEP,
} from './core/fontSize';

interface FontSizeOption extends vscode.QuickPickItem {
  size: number;
}

/**
 * Register font-size commands and a status-bar item for myst-notebook.
 *
 * One number drives both the markup preview font (`notebook.markup.fontSize`)
 * and the editor/code-cell font (`editor.fontSize`), kept in sync and
 * persisted to Global settings. `notebook.output.fontSize` is left alone.
 */
export function registerFontSize(context: vscode.ExtensionContext): void {
  function currentSize(): number {
    const markup = vscode.workspace
      .getConfiguration('notebook')
      .get<number>('markup.fontSize');
    const editor = vscode.workspace.getConfiguration('editor').get<number>('fontSize');
    return resolveFontSize(markup, editor);
  }

  async function apply(size: number): Promise<number> {
    const clamped = clampFontSize(size);
    await vscode.workspace
      .getConfiguration('notebook')
      .update('markup.fontSize', clamped, vscode.ConfigurationTarget.Global);
    await vscode.workspace
      .getConfiguration('editor')
      .update('fontSize', clamped, vscode.ConfigurationTarget.Global);
    return clamped;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('myst-notebook.increaseFontSize', () =>
      apply(currentSize() + FONT_SIZE_STEP),
    ),
    vscode.commands.registerCommand('myst-notebook.decreaseFontSize', () =>
      apply(currentSize() - FONT_SIZE_STEP),
    ),
    vscode.commands.registerCommand('myst-notebook.setFontSize', async () => {
      const current = currentSize();
      const options: FontSizeOption[] = FONT_SIZE_PRESETS.map((s) => ({
        label: `${s}px`,
        description: s === current ? 'current' : undefined,
        size: s,
      }));
      const picked = await vscode.window.showQuickPick(options, {
        title: 'MyST: Font Size',
        placeHolder: `Current: ${current}px`,
      });
      if (picked) {
        await apply(picked.size);
      }
    }),
  );

  const item = vscode.window.createStatusBarItem(
    'myst-notebook.fontSize',
    vscode.StatusBarAlignment.Right,
    100,
  );
  item.command = 'myst-notebook.setFontSize';
  item.tooltip = 'MyST font size (click to change)';

  const refresh = (): void => {
    const editor = vscode.window.activeNotebookEditor;
    if (editor && editor.notebook.notebookType === 'myst-notebook') {
      item.text = `$(text-size) ${currentSize()}px`;
      item.show();
    } else {
      item.hide();
    }
  };

  refresh();

  context.subscriptions.push(
    item,
    vscode.window.onDidChangeActiveNotebookEditor(refresh),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('notebook.markup.fontSize') ||
        e.affectsConfiguration('editor.fontSize')
      ) {
        refresh();
      }
    }),
  );
}
