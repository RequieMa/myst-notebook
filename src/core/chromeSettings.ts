/**
 * The VS Code settings that turn a MyST notebook into a focused writing document.
 *
 * `notebook.globalToolbar: false` hides the top toolbar (Generate / +Code / +Markdown /
 * Run All / Clear All Outputs); `notebook.insertToolbarLocation: 'hidden'` hides the
 * between-cell (and end-of-notebook) insert-cell toolbar.
 *
 * VS Code-free by design: this is the only piece unit-tested under vitest. The adapter
 * that actually writes these into the workspace lives in `src/workspaceChrome.ts`.
 */
export function desiredChromeSettings(): Record<string, unknown> {
  return {
    'notebook.globalToolbar': false,
    'notebook.insertToolbarLocation': 'hidden',
  };
}
