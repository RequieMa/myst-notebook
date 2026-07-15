// Minimal stub so pure-function tests can import modules that also import vscode.
// Only the exports needed by unit-tested modules need to be stubbed.
// The stub intentionally throws if any vscode runtime API is called —
// pure functions must not invoke vscode at test time.

/** VS Code notebook cell kinds. Real values: Markup=1, Code=2. */
export enum NotebookCellKind {
  Markup = 1,
  Code = 2,
}

/** Stub matching the shape of vscode.NotebookCellData. */
export class NotebookCellData {
  metadata?: Record<string, unknown>;
  constructor(
    public kind: NotebookCellKind,
    public value: string,
    public languageId: string,
  ) {}
}

/** Stub matching the shape of vscode.NotebookData. */
export class NotebookData {
  constructor(public cells: NotebookCellData[]) {}
}

export class NotebookCellOutputItem {
  static error(_err: Error): NotebookCellOutputItem {
    return new NotebookCellOutputItem();
  }
  constructor(public data?: Uint8Array, public mime?: string) {}
}

export class NotebookCellOutput {
  constructor(public items: NotebookCellOutputItem[]) {}
}

export class NotebookRange {
  constructor(public start: number, public end: number) {}
}

export const NotebookEdit = {
  replaceCells(_range: NotebookRange, _cells: NotebookCellData[]) {
    return {};
  },
  insertCells(_index: number, _cells: NotebookCellData[]) {
    return {};
  },
} as any;

export default {};
