import { describe, it, expect } from 'vitest';
import * as vscode from './__stubs__/vscode';
import { MathCompletionProvider } from './mathCompletion';
import { MathSymbolStore } from './mathPalette';
import { isInsideMathContext } from './mathContextDetector';

describe('isInsideMathContext', () => {
  it('returns true when cursor is after an odd number of $ delimiters', () => {
    // line: "before $x + "   cursor at index 12 (after the space)
    expect(isInsideMathContext('before $x + ', 12)).toBe(true);
  });

  it('returns false when cursor is after a closed inline math span', () => {
    // line: "before $x$ rest"   cursor at index 13 (inside "rest")
    expect(isInsideMathContext('before $x$ rest', 13)).toBe(false);
  });

  it('returns false when no math delimiters present', () => {
    expect(isInsideMathContext('plain prose text', 5)).toBe(false);
  });

  it('returns true inside display math $$', () => {
    // line: "$$E = mc"  cursor at index 7
    expect(isInsideMathContext('$$E = mc', 7)).toBe(true);
  });

  it('returns false at position 0 with no preceding $', () => {
    expect(isInsideMathContext('$alpha', 0)).toBe(false);
  });

  it('returns true immediately after opening $', () => {
    // line: "$"  cursor at index 1
    expect(isInsideMathContext('$', 1)).toBe(true);
  });

  it('ignores escaped \\$', () => {
    // line: "cost is \\$5 and $math"  cursor at 21
    expect(isInsideMathContext('cost is \\$5 and $math', 21)).toBe(true);
  });

  it('handles $$ as two $ chars (each counts)', () => {
    // "$$" followed by content — cursor at index 3: 2 $ seen → even → false for inline counting
    // But $$ is display math and we treat it as "inside" because count >= 1 seen
    // Implementation: count raw unescaped $ left of cursor; odd = inside
    // "$$ x": positions: 0=$, 1=$, 2=space, 3=x — chars 0 and 1 are $
    // count = 2 → even → false? But we ARE inside display math.
    // Resolution: "$$" block: once we see $$, we are inside until we see $$ again.
    // For simplicity the implementation uses raw $ count (2 = even = outside) which is wrong
    // for display math. The smarter approach: count $$ pairs too.
    // This test documents the display math case:
    expect(isInsideMathContext('$$ x + ', 6)).toBe(true);
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
  const store = new MathSymbolStore({ get: (_key: string, defaultValue: any) => defaultValue, update: () => Promise.resolve() } as any);

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
});
