import { describe, it, expect } from 'vitest';
import { MystSerializer } from './mystSerializer';
import { NotebookCellKind } from './__stubs__/vscode';

const encoder = new TextEncoder();

function deserialize(text: string) {
  const content = encoder.encode(text);
  const serializer = new MystSerializer();
  return serializer.deserializeNotebook(content);
}

describe('MystSerializer.deserializeNotebook', () => {
  it('returns a single empty markup cell for a completely empty file', () => {
    const data = deserialize('');
    expect(data.cells).toHaveLength(1);
    const cell = data.cells[0];
    expect(cell.kind).toBe(NotebookCellKind.Markup);
    expect(cell.value).toBe('');
    expect(cell.languageId).toBe('markdown');
  });

  it('returns a single empty markup cell for a whitespace-only file', () => {
    const data = deserialize('   \n  \t  ');
    expect(data.cells).toHaveLength(1);
    expect(data.cells[0].kind).toBe(NotebookCellKind.Markup);
    expect(data.cells[0].value).toBe('');
  });

  it('still deserializes a normal MyST document correctly', () => {
    const data = deserialize('# Hello\n\nA paragraph.\n');
    expect(data.cells).toHaveLength(2);
    expect(data.cells[0].kind).toBe(NotebookCellKind.Markup);
    expect(data.cells[0].value).toBe('# Hello');
    expect(data.cells[1].kind).toBe(NotebookCellKind.Markup);
    expect(data.cells[1].value).toBe('A paragraph.');
  });

  it('still deserializes a code-only document correctly', () => {
    const data = deserialize('```{code-cell} python\nx = 1\n```\n');
    expect(data.cells).toHaveLength(1);
    expect(data.cells[0].kind).toBe(NotebookCellKind.Code);
    expect(data.cells[0].value).toBe('x = 1');
    expect(data.cells[0].languageId).toBe('python');
  });
});

describe('MystSerializer.serializeNotebook', () => {
  it('round-trips an empty file through deserialize → serialize', () => {
    const serializer = new MystSerializer();
    const deserialized = serializer.deserializeNotebook(encoder.encode(''));
    // Empty file: deserialize injects one empty markup cell.
    expect(deserialized.cells).toHaveLength(1);

    // Round-trip: serialize back.
    const bytes = serializer.serializeNotebook(deserialized);
    const text = new TextDecoder().decode(bytes);
    // An empty markup cell serializes to '' (empty value) + trailing '\n'.
    // The serializer appends '\n' unconditionally → one blank line in the file.
    // This is acceptable: it's no longer an empty 0-byte file, it's a file with
    // one blank line that will deserialize to one empty markup cell next time.
    expect(text).toBe('\n');
  });

  it('round-trips a normal document without extra cells appearing', () => {
    const serializer = new MystSerializer();
    const original = '# Hello\n\nWorld.\n';
    const deserialized = serializer.deserializeNotebook(encoder.encode(original));
    const bytes = serializer.serializeNotebook(deserialized);
    const text = new TextDecoder().decode(bytes);
    expect(text).toBe(original);
  });
});
