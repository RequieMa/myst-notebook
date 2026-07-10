import * as vscode from 'vscode';

export class MathSymbolStore {
  private static KEY = 'myst-notebook.mathSymbols';

  constructor(private readonly state: vscode.Memento) {}

  getAll(): string[] {
    // Migrate from old format (array of {latex, slot} objects) to plain string array
    const raw = this.state.get<unknown[]>(MathSymbolStore.KEY, []);
    return raw.map(item =>
      typeof item === 'string' ? item : (item as { latex: string }).latex
    );
  }

  add(latex: string): void {
    const all = this.getAll().filter(s => s !== latex);
    all.unshift(latex); // most recent first
    void this.state.update(MathSymbolStore.KEY, all);
  }

  remove(latex: string): void {
    void this.state.update(
      MathSymbolStore.KEY,
      this.getAll().filter(s => s !== latex)
    );
  }

  getRecent(n: number): string[] {
    return this.getAll().slice(0, n);
  }
}

export class MathSymbolItem extends vscode.TreeItem {
  constructor(public readonly latex: string) {
    super(latex, vscode.TreeItemCollapsibleState.None);
    this.tooltip = latex;
    this.contextValue = 'mathSymbol';
    this.command = {
      command: 'myst-notebook.insertMathSymbolDirect',
      title: 'Insert symbol',
      arguments: [latex],
    };
  }
}

export class MathSymbolProvider implements vscode.TreeDataProvider<MathSymbolItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly store: MathSymbolStore) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: MathSymbolItem): vscode.TreeItem {
    return element;
  }

  getChildren(): MathSymbolItem[] {
    return this.store.getAll().map(s => new MathSymbolItem(s));
  }
}
