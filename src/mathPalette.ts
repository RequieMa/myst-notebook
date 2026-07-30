import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { log } from './log';

/** Type guard: checks if an error is a Node.js SystemError with a `.code` property. */
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

interface SymbolStats {
  count: number;
  lastUsed: string; // ISO-8601
}

interface ConfigFile {
  version: number;
  symbols: Record<string, SymbolStats>;
}

export class MathSymbolStore {
  private static LEGACY_KEY = 'myst-notebook.mathSymbols';
  private symbols = new Map<string, SymbolStats>();
  private configPath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(workspaceRoot: string) {
    this.configPath = path.join(workspaceRoot, '.vscode', 'myst-symbols.json');
  }

  /** Parse a JSON string into the in-memory cache. Exposed for testing. */
  _fromJSON(json: string): void {
    this.symbols.clear();
    try {
      const config: ConfigFile = JSON.parse(json);
      if (config && config.symbols) {
        for (const [latex, stats] of Object.entries(config.symbols)) {
          if (stats && typeof stats.count === 'number') {
            this.symbols.set(latex, {
              count: stats.count,
              lastUsed: stats.lastUsed ?? new Date(0).toISOString(),
            });
          }
        }
      }
    } catch (e) {
      log(`[MathSymbolStore] failed to parse config: ${e}`);
      // Keep empty cache, do NOT overwrite the broken file
    }
  }

  /** Serialize the in-memory cache to a JSON string. Exposed for testing. */
  _toJSON(): string {
    const symbols: Record<string, SymbolStats> = {};
    for (const [latex, stats] of this.symbols) {
      symbols[latex] = { count: stats.count, lastUsed: stats.lastUsed };
    }
    // Sort keys for deterministic output (git-friendly)
    const sorted: Record<string, SymbolStats> = {};
    for (const key of Object.keys(symbols).sort()) {
      sorted[key] = symbols[key];
    }
    const config: ConfigFile = { version: 1, symbols: sorted };
    return JSON.stringify(config, null, 2) + '\n';
  }

  /** Load symbols from the config file. Optionally migrates from legacy workspaceState. */
  async load(legacyState?: vscode.Memento): Promise<void> {
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      this._fromJSON(content);
      return;
    } catch (e) {
      if (isNodeError(e) && e.code !== 'ENOENT') {
        log(`[MathSymbolStore] error reading config: ${e}`);
      }
    }

    // Migration: check legacy workspaceState
    if (legacyState) {
      const raw = legacyState.get<unknown[]>(MathSymbolStore.LEGACY_KEY, []);
      if (raw.length > 0) {
        for (const item of raw) {
          const latex = typeof item === 'string' ? item : (item as { latex: string }).latex;
          this.add(latex);
        }
        await this.save();
        void legacyState.update(MathSymbolStore.LEGACY_KEY, undefined);
      }
    }
  }

  /** Record a symbol usage. Sync — updates in-memory cache immediately. */
  add(latex: string): void {
    const existing = this.symbols.get(latex);
    if (existing) {
      existing.count++;
      existing.lastUsed = new Date().toISOString();
    } else {
      this.symbols.set(latex, {
        count: 1,
        lastUsed: new Date().toISOString(),
      });
    }
    this.debouncedSave();
  }

  /** Remove a symbol. For palette sidebar use. */
  remove(latex: string): void {
    this.symbols.delete(latex);
    this.debouncedSave();
  }

  /** Get recent symbols sorted by (count desc, lastUsed desc). */
  getRecent(n: number): string[] {
    const entries = [...this.symbols.entries()]
      .sort((a, b) => {
        if (b[1].count !== a[1].count) return b[1].count - a[1].count;
        return b[1].lastUsed.localeCompare(a[1].lastUsed);
      })
      .slice(0, n);
    // Only return symbols that are still in the built-in list
    // (filtering is done by consumer — this returns raw stored data)
    return entries.map(([latex]) => latex);
  }

  /** Get all stored symbols (for sidebar palette). */
  getAll(): string[] {
    return this.getRecent(Number.MAX_SAFE_INTEGER);
  }

  /** Get usage stats for a specific symbol. */
  getStats(latex: string): SymbolStats | undefined {
    return this.symbols.get(latex);
  }

  /** Fire tree data change event (for sidebar refresh). */
  refresh(): void {
    this._onDidChange.fire();
  }

  /** Immediate save to disk. */
  async save(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, this._toJSON(), 'utf-8');
    } catch (e) {
      log(`[MathSymbolStore] failed to save config: ${e}`);
    }
  }

  /** Debounced save — writes after 1s of inactivity. */
  private debouncedSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, 1000);
  }

  /** Cancel pending save (for testing / dispose). */
  dispose(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
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
