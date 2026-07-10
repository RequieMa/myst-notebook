import { Range } from '../model/range';

export interface TextEdit {
  range: Range;
  newText: string;
}

export abstract class TextEdit {
  public static apply(text: string, textEditOrEdits: TextEdit | TextEdit[]): string {
    if (Array.isArray(textEditOrEdits)) {
      let result = text;
      const sorted = [...textEditOrEdits].sort((a, b) => {
        const lineDiff = b.range.start.line - a.range.start.line;
        return lineDiff !== 0 ? lineDiff : b.range.start.character - a.range.start.character;
      });
      for (const edit of sorted) {
        result = TextEdit.apply(result, edit);
      }
      return result;
    }
    const edit = textEditOrEdits;
    const lines = text.split('\n');
    const before = lines.slice(0, edit.range.start.line);
    const startLine = lines[edit.range.start.line] ?? '';
    const endLine = lines[edit.range.end.line] ?? '';
    const prefix = startLine.slice(0, edit.range.start.character);
    const suffix = endLine.slice(edit.range.end.character);
    const after = lines.slice(edit.range.end.line + 1);
    return [...before, prefix + edit.newText + suffix, ...after].join('\n');
  }
}
