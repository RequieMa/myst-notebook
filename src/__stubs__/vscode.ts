// Minimal stub so pure-function tests can import modules that also import vscode.
// Only the exports needed by unit-tested modules need to be stubbed.
// The stub intentionally throws if any vscode runtime API is called —
// pure functions must not invoke vscode at test time.

/** VS Code notebook cell kinds. Real values: Markup=1, Code=2. */
export enum NotebookCellKind {
  Markup = 1,
  Code = 2,
}

export enum CompletionItemKind {
  Value = 0,
}

export enum NotebookCellStatusBarAlignment {
  Left = 1,
  Right = 2,
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

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  constructor(
    public startLineOrStart: Position | number,
    public startCharOrEnd?: Position | number,
    public endLine?: number,
    public endCharacter?: number,
  ) {
    // Support both Range(Position, Position) and Range(line, char, line, char)
    if (typeof startLineOrStart === 'number') {
      this.start = new Position(startLineOrStart, startCharOrEnd as number);
      this.end = new Position(endLine!, endCharacter!);
    } else {
      this.start = startLineOrStart;
      this.end = startCharOrEnd as Position;
    }
  }
  start!: Position;
  end!: Position;
}

export class CompletionItem {
  range?: Range;
  insertText?: string;
  sortText?: string;
  filterText?: string;
  detail?: string;
  documentation?: string;
  constructor(
    public label: string,
    public kind?: CompletionItemKind,
  ) {}
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  iconPath?: any;
  description?: string;
  tooltip?: string;
  contextValue?: string;
  collapsibleState?: TreeItemCollapsibleState;
  command?: { command: string; title: string; arguments?: any[] };
  constructor(label: string | { label: string }, collapsibleState?: TreeItemCollapsibleState) {
    this.label = typeof label === 'string' ? label : label.label;
    this.collapsibleState = collapsibleState;
  }
  label?: string;
}

/**
 * Create a stub VS Code Event: a callable that registers listeners, plus
 * .fire() for tests and .reset() to clear listeners between tests.
 */
function createEvent<T>(): ((listener: (e: T) => any, thisArgs?: any, disposables?: any[]) => { dispose: () => void }) & { fire: (e: T) => void; reset: () => void } {
  const listeners: Array<(e: T) => any> = [];
  const fn = (listener: (e: T) => any, _thisArgs?: any, _disposables?: any[]) => {
    listeners.push(listener);
    return { dispose: () => { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1); } };
  };
  fn.fire = (e: T) => { listeners.forEach(l => l(e)); };
  fn.reset = () => { listeners.length = 0; };
  return fn as any;
}

export class NotebookCellStatusBarItem {
  text: string = '';
  command?: string | { command: string; arguments?: any[]; title: string };
  tooltip?: string;
  alignment: NotebookCellStatusBarAlignment = NotebookCellStatusBarAlignment.Right;
  priority?: number;
  accessibilityInformation?: { label: string };
  dispose() {}
  show() {}
  hide() {}
}

export const NotebookEdit = {
  replaceCells(_range: NotebookRange, _cells: NotebookCellData[]) {
    return {};
  },
  insertCells(_index: number, _cells: NotebookCellData[]) {
    return {};
  },
} as any;

export const Uri = {
  parse(s: string) {
    return {
      scheme: 'file',
      fsPath: s,
      toString: () => s,
      toJSON: () => ({ scheme: 'file', path: s }),
    };
  },
  file(s: string) {
    return Uri.parse(s);
  },
};

export const notebooks = {
  createNotebookCellStatusBarItem(
    _cell: any,
    alignment?: NotebookCellStatusBarAlignment,
  ): NotebookCellStatusBarItem {
    const item = new NotebookCellStatusBarItem();
    if (alignment !== undefined) item.alignment = alignment;
    return item;
  },
  onDidOpenNotebookDocument: createEvent<any>(),
  onDidChangeNotebookCells: createEvent<any>(),
  onDidCloseNotebookDocument: createEvent<any>(),
};

export const window = {
  onDidChangeNotebookEditorSelection: createEvent<{ notebookEditor: any; selection: any }>(),
  _activeNotebookEditor: undefined as any,
  get activeNotebookEditor(): any {
    return this._activeNotebookEditor;
  },
  set activeNotebookEditor(v: any) {
    this._activeNotebookEditor = v;
  },
  visibleNotebookEditors: [] as any[],
  createOutputChannel: (_name: string, _opts?: any) => ({
    info: (_msg: string) => {},
    error: (_msg: string) => {},
    warn: (_msg: string) => {},
    appendLine: (_msg: string) => {},
    dispose: () => {},
    show: () => {},
    hide: () => {},
  }),
  showNotebookDocument: (_doc: any, _opts?: any): Promise<any> => Promise.resolve(),
};

export const commands = {
  executeCommand: (_command: string, ..._args: any[]): Promise<any> => Promise.resolve(),
  registerCommand: (_command: string, _callback: (...args: any[]) => any, _thisArg?: any): { dispose: () => void } => ({
    dispose: () => {},
  }),
};

export const workspace = {
  applyEdit: (_edit: any): Promise<boolean> => Promise.resolve(true),
  onDidOpenNotebookDocument: createEvent<any>(),
  onDidCloseNotebookDocument: createEvent<any>(),
  onDidChangeNotebookDocument: createEvent<any>(),
  notebookDocuments: [] as any[],
};

export const WorkspaceEdit = class {
  set(_uri: any, _edits: any[]) {}
};

export const Disposable = {
  from(...disposables: Array<{ dispose: () => void }>) {
    return { dispose: () => disposables.forEach(d => d.dispose()) };
  },
};

export default {};
