import * as vscode from 'vscode';
import { textToCells, cellsToText, RawCell } from './core/serializer';
import { rawCellToData } from './cellFactory';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/** Labels for rendering colon-fence directives as blockquotes. */
const LABELS: Record<string, string> = {
  note: 'Note', tip: 'Tip', important: 'Important', hint: 'Hint',
  warning: 'Warning', caution: 'Caution', danger: 'Danger', error: 'Error',
  attention: 'Attention', seealso: 'See Also', todo: 'To Do',
};

/**
 * MyST colon-fence → markdown blockquote. VS Code's notebook renderer cannot
 * render custom block syntax (it uses renderInline which skips block+core
 * rules), but it CAN render blockquotes. We rewrite directives at cell-load
 * time so they are visible, and store the original value in metadata so the
 * round-trip is lossless.
 */
export function convertColonFencesToBlockquote(value: string): string {
  return value.replace(
    /^:{3,}\{(\w+)\}\s*\n([\s\S]*?)^:{3,}\s*$/gm,
    (_match: string, name: string, body: string) => {
      const label = LABELS[name] ?? name;
      return `> **${label}:** ${body.trimEnd().replace(/\n/g, '\n> ')}\n`;
    }
  );
}

const ORIGINAL_KEY = 'myst.colonFenceOriginal';

export class MystSerializer implements vscode.NotebookSerializer {
  deserializeNotebook(content: Uint8Array): vscode.NotebookData {
    const text = decoder.decode(content).replace(/\n$/, '');
    const cells = textToCells(text).map((raw) => {
      if (raw.kind === 'markup' && /^:{3,}\{/m.test(raw.value)) {
        const original = raw.value;
        raw.value = convertColonFencesToBlockquote(original);
        raw.metadata = { ...raw.metadata, [ORIGINAL_KEY]: original };
      }
      return rawCellToData(raw);
    });
    return new vscode.NotebookData(cells);
  }

  serializeNotebook(data: vscode.NotebookData): Uint8Array {
    if (data.cells.length === 0) return encoder.encode('');
    const cells: RawCell[] = data.cells.map((c) => {
      const meta = (c.metadata ?? {}) as Record<string, unknown>;
      // Restore original colon-fence text from metadata, but ONLY if the
      // cell hasn't been edited since deserialization. If the user changed
      // the blockquote text, use the current value instead (user's edit wins).
      const original = typeof meta[ORIGINAL_KEY] === 'string'
        ? (meta[ORIGINAL_KEY] as string)
        : undefined;
      const value = original !== undefined &&
        convertColonFencesToBlockquote(original) === c.value
          ? original
          : c.value;
      // Strip our private metadata key so it doesn't leak into the .md file.
      const clean = { ...meta };
      delete clean[ORIGINAL_KEY];
      return {
        kind: c.kind === vscode.NotebookCellKind.Code ? 'code' : 'markup',
        language: c.languageId,
        value,
        metadata: clean,
      };
    });
    return encoder.encode(cellsToText(cells) + '\n');
  }
}
