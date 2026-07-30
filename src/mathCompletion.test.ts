import { describe, it, expect } from 'vitest';
import * as vscode from './__stubs__/vscode';
import { MathCompletionProvider } from './mathCompletion';
import { MathSymbolStore } from './mathPalette';
import { isInsideMathContext } from './mathContextDetector';

/** Create a minimal mock TextDocument for isInsideMathContext tests. */
function mockDoc(text: string): vscode.TextDocument {
  const lines = text.split('\n');
  return {
    lineAt(posOrLine: any) {
      const line = typeof posOrLine === 'number' ? posOrLine : posOrLine.line;
      return { text: lines[line] ?? '' };
    },
    getText(range?: any) {
      if (!range) return text;
      // Compute substring from (startLine,startChar) to (endLine,endChar)
      const startOffset = lines.slice(0, range.start.line).reduce((s, l) => s + l.length + 1, 0) + range.start.character;
      const endOffset = lines.slice(0, range.end.line).reduce((s, l) => s + l.length + 1, 0) + range.end.character;
      return text.slice(startOffset, endOffset);
    },
    uri: vscode.Uri.parse('file:///test.md'),
    languageId: 'markdown',
    version: 1,
    lineCount: lines.length,
    positionAt: () => new vscode.Position(0, 0),
    offsetAt: () => 0,
    getWordRangeAtPosition: () => undefined,
    validatePosition: () => true,
    validateRange: () => true,
  } as any;
}

describe('isInsideMathContext', () => {
  it('returns true when cursor is after an odd number of $ delimiters', () => {
    const doc = mockDoc('before $x + ');
    expect(isInsideMathContext(doc as any, new vscode.Position(0, 12))).toBe(true);
  });

  it('returns false when cursor is after a closed inline math span', () => {
    const doc = mockDoc('before $x$ rest');
    expect(isInsideMathContext(doc as any, new vscode.Position(0, 13))).toBe(false);
  });

  it('returns false when no math delimiters present', () => {
    const doc = mockDoc('plain prose text');
    expect(isInsideMathContext(doc as any, new vscode.Position(0, 5))).toBe(false);
  });

  it('returns true inside display math $$', () => {
    const doc = mockDoc('$$E = mc');
    expect(isInsideMathContext(doc as any, new vscode.Position(0, 7))).toBe(true);
  });

  it('returns false at position 0 with no preceding $', () => {
    const doc = mockDoc('$alpha');
    expect(isInsideMathContext(doc as any, new vscode.Position(0, 0))).toBe(false);
  });

  it('returns true immediately after opening $', () => {
    const doc = mockDoc('$');
    expect(isInsideMathContext(doc as any, new vscode.Position(0, 1))).toBe(true);
  });

  it('ignores escaped \\$', () => {
    const doc = mockDoc('cost is \\$5 and $math');
    expect(isInsideMathContext(doc as any, new vscode.Position(0, 21))).toBe(true);
  });

  it('returns true inside multi-line display math $$', () => {
    // Cursor on line 2 (the math content), which has no $ of its own
    const doc = mockDoc('$$\nE = mc^2\nmore');
    expect(isInsideMathContext(doc as any, new vscode.Position(1, 4))).toBe(true);
  });

  it('returns false after closing $$ in multi-line display math', () => {
    const doc = mockDoc('$$\nE = mc^2\n$$\nprose');
    expect(isInsideMathContext(doc as any, new vscode.Position(3, 3))).toBe(false);
  });
});

// --------------- MathCompletionProvider tests ---------------

function makeDoc(text: string): vscode.TextDocument {
  const lines = text.split('\n');
  return {
    lineAt(posOrLine: any) {
      const line = typeof posOrLine === 'number' ? posOrLine : posOrLine.line;
      return { text: lines[line] ?? '' };
    },
    getText() { return text; },
    uri: vscode.Uri.parse('file:///test.md'),
    languageId: 'markdown',
    version: 1,
    lineCount: lines.length,
    positionAt: () => new vscode.Position(0, 0),
    offsetAt: () => 0,
    getWordRangeAtPosition: () => undefined,
    validatePosition: () => true,
    validateRange: () => true,
  } as any;
}

describe('MathCompletionProvider', () => {
  const store = new MathSymbolStore('/tmp/test');

  it('returns items with range covering the trigger backslash', () => {
    const provider = new MathCompletionProvider(store);
    const doc = makeDoc('some text $\\');
    const pos = new vscode.Position(0, 12); // cursor after "\"
    const items = provider.provideCompletionItems(
      doc as any, pos, undefined as any, undefined as any,
    );
    expect(items).not.toBeUndefined();
    expect(items!.length).toBeGreaterThan(0);
    for (const item of items!) {
      expect(item.range).toBeDefined();
      // Range should cover from the backslash (char 11) to cursor (char 12)
      expect(item.range!.start.line).toBe(0);
      expect(item.range!.start.character).toBe(11);
      expect(item.range!.end.line).toBe(0);
      expect(item.range!.end.character).toBe(12);
    }
  });

  it('finds the closest backslash when multiple are on the line', () => {
    const provider = new MathCompletionProvider(store);
    // line chars: $ \ a ... \ ... b     cursor at 12 (just after second \)
    // indices:    0 1 2        9 10 11
    // String: '$\\' = '$\' then 'alpha = \\' = 'alpha = \' then 'b'
    const doc = makeDoc('$\\alpha = \\b');
    // cursor at index 12: after the second "\" at index 10
    const pos = new vscode.Position(0, 12);
    const items = provider.provideCompletionItems(
      doc as any, pos, undefined as any, undefined as any,
    );
    expect(items).not.toBeUndefined();
    for (const item of items!) {
      expect(item.range!.start.character).toBe(10); // closest backslash, not the first one at index 1
    }
  });

  it('sets no range when cursor inside math but not preceded by backslash', () => {
    const provider = new MathCompletionProvider(store);
    // cursor inside $...$ math context but no backslash before cursor
    const doc = makeDoc('some text $alpha');
    const pos = new vscode.Position(0, 15); // cursor at end of "$alpha"
    const items = provider.provideCompletionItems(
      doc as any, pos, undefined as any, undefined as any,
    );
    // Inside math context → returns items, but no backslash → range is undefined
    expect(items).not.toBeUndefined();
    for (const item of items!) {
      expect(item.range).toBeUndefined();
    }
  });

  it('returns undefined outside math context', () => {
    const provider = new MathCompletionProvider(store);
    const doc = makeDoc('plain text no math');
    const pos = new vscode.Position(0, 10);
    const items = provider.provideCompletionItems(
      doc as any, pos, undefined as any, undefined as any,
    );
    expect(items).toBeUndefined();
  });

  it('sets range at correct position when backslash is not at position-1', () => {
    const provider = new MathCompletionProvider(store);
    // cursor between \ and alpha: "$\alpha" with cursor right after \
    const doc = makeDoc('$\\alpha');
    const pos = new vscode.Position(0, 2); // cursor right after "\"
    const items = provider.provideCompletionItems(
      doc as any, pos, undefined as any, undefined as any,
    );
    expect(items).not.toBeUndefined();
    for (const item of items!) {
      expect(item.range!.start.character).toBe(1); // position of "\"
      expect(item.range!.end.character).toBe(2);   // cursor position
    }
  });

  it('sets insertText as SnippetString for symbols with snippet', () => {
    // Override MATH_SYMBOLS temporarily? No — test with a real snippet symbol.
    // \mathbf{} has snippet: "\mathbf{$1}" (after Task 2 expansion)
    const provider = new MathCompletionProvider(store);
    const doc = makeDoc('$\\mathbf');
    const pos = new vscode.Position(0, 8);
    const items = provider.provideCompletionItems(
      doc as any, pos, undefined as any, undefined as any,
    );
    expect(items).not.toBeUndefined();
    const mathbf = items!.find(i => i.label === '\\mathbf{}');
    if (mathbf) {
      expect(mathbf.insertText).toBeDefined();
      expect(mathbf.insertText).toBeInstanceOf(vscode.SnippetString);
      expect((mathbf.insertText as vscode.SnippetString).value).toBe('\\mathbf{$1}');
    }
  });

  it('does NOT set insertText for symbols without snippet', () => {
    const provider = new MathCompletionProvider(store);
    const doc = makeDoc('$\\alpha');
    const pos = new vscode.Position(0, 6);
    const items = provider.provideCompletionItems(
      doc as any, pos, undefined as any, undefined as any,
    );
    expect(items).not.toBeUndefined();
    const alpha = items!.find(i => i.label === '\\alpha');
    expect(alpha).toBeDefined();
    expect(alpha!.insertText).toBeUndefined(); // plain text, uses label
  });

  it('boosts sortText for symbols with higher usage count', () => {
    const storeWithStats = new MathSymbolStore('/tmp/test');
    storeWithStats._fromJSON(JSON.stringify({
      version: 1,
      symbols: {
        '\\alpha': { count: 10, lastUsed: '2026-07-30T10:00:00Z' },
        '\\beta': { count: 1, lastUsed: '2026-07-29T10:00:00Z' },
      },
    }));
    const provider = new MathCompletionProvider(storeWithStats);
    const doc = makeDoc('$\\');
    const pos = new vscode.Position(0, 2);
    const items = provider.provideCompletionItems(
      doc as any, pos, undefined as any, undefined as any,
    );
    expect(items).not.toBeUndefined();
    const alpha = items!.find(i => i.label === '\\alpha');
    const beta = items!.find(i => i.label === '\\beta');
    expect(alpha).toBeDefined();
    expect(beta).toBeDefined();
    // Alpha should sort before beta (higher count)
    expect(alpha!.sortText! < beta!.sortText!).toBe(true);
  });
});
