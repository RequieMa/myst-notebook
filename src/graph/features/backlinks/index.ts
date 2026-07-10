/**
 * Backlinks / Connections tree-view panel.
 *
 * Adapted from foam-vscode `src/vscode/features/notes/connections.ts`.
 * foam-vscode service imports replaced with inlined helpers; registration
 * function renamed to `registerBacklinks`.
 */

import * as vscode from 'vscode';
import {
  URI,
  Foam,
  FoamWorkspace,
  FoamGraph,
  Connection,
  Range,
  isNone,
  isSome,
  getBlockFor,
  Resource,
} from '../../core';

// ---------------------------------------------------------------------------
// URI conversion helpers (inlined from foam-vscode vsc-utils)
// ---------------------------------------------------------------------------

function fromVsCodeUri(u: vscode.Uri): URI {
  return new URI({
    scheme: u.scheme,
    authority: u.authority,
    path: u.path,
    query: u.query,
    fragment: u.fragment,
  });
}

function toVsCodeUri(u: URI): vscode.Uri {
  return vscode.Uri.from(u as Parameters<typeof vscode.Uri.from>[0]);
}

function toVsCodeRange(r: { start: { line: number; character: number }; end: { line: number; character: number } }): vscode.Range {
  return new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
}

// ---------------------------------------------------------------------------
// ContextMemento (inlined from foam-vscode vsc-utils)
// ---------------------------------------------------------------------------

class ContextMemento<T> {
  private defaultValue: T;
  constructor(
    private data: vscode.Memento,
    private key: string,
    defaultValue: T
  ) {
    this.defaultValue = defaultValue;
    const value = data.get(key) ?? defaultValue;
    vscode.commands.executeCommand('setContext', this.key, value);
  }
  public get(): T {
    return this.data.get<T>(this.key) ?? this.defaultValue;
  }
  public async update(value: T): Promise<void> {
    this.data.update(this.key, value);
    await vscode.commands.executeCommand('setContext', this.key, value);
  }
}

// ---------------------------------------------------------------------------
// Active-tab helpers (inlined from foam-vscode services/editor)
// ---------------------------------------------------------------------------

function getActiveTabUri(fWorkspace?: FoamWorkspace): URI | undefined {
  const tab = vscode.window.tabGroups?.activeTabGroup?.activeTab;
  const input = (tab as any)?.input;
  if (input && typeof input === 'object' && 'uri' in input && input.uri != null) {
    return fromVsCodeUri(input.uri as vscode.Uri);
  }
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) return fromVsCodeUri(activeUri);
  // Check notebook editor cell
  const notebookEditor = vscode.window.activeNotebookEditor;
  if (notebookEditor) return fromVsCodeUri(notebookEditor.notebook.uri);
  return undefined;
}

function onDidChangeActiveTab(listener: () => void): vscode.Disposable {
  const subscriptions = [
    vscode.window.onDidChangeActiveTextEditor(() => listener()),
    vscode.window.tabGroups.onDidChangeTabs(() => listener()),
    vscode.window.tabGroups.onDidChangeTabGroups(() => listener()),
  ];
  return { dispose: () => subscriptions.forEach(s => s.dispose()) };
}

function getWorkspaceDefaultScheme(): string {
  if (vscode.workspace.workspaceFolders === undefined) {
    throw new Error('An open folder or workspace is required');
  }
  return vscode.workspace.workspaceFolders[0].uri.scheme;
}

// ---------------------------------------------------------------------------
// getNoteTooltip (inlined from foam-vscode services/editor)
// ---------------------------------------------------------------------------

function getNoteTooltip(content: string): vscode.MarkdownString {
  const LINES_LIMIT = 16;
  const lines = content.split('\n');
  const excerpt = lines.slice(0, LINES_LIMIT).join('\n');
  const diffLines = lines.length - LINES_LIMIT;
  const ellipsis = diffLines > 0 ? `\n\n[...] *(+ ${diffLines} lines)*` : '';
  const md = new vscode.MarkdownString(`${excerpt}${ellipsis}`);
  md.isTrusted = true;
  return md;
}

// ---------------------------------------------------------------------------
// BaseTreeProvider (inlined from foam-vscode utils/tree-views/base-tree-provider)
// ---------------------------------------------------------------------------

abstract class BaseTreeProvider<T extends vscode.TreeItem>
  implements vscode.TreeDataProvider<T>, vscode.Disposable
{
  protected disposables: vscode.Disposable[] = [];

  private _onDidChangeTreeData = new vscode.EventEmitter<T | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  abstract getChildren(element?: T): vscode.ProviderResult<T[]>;

  getTreeItem(element: T): vscode.TreeItem {
    return element;
  }

  async resolveTreeItem(item: vscode.TreeItem, _element: T, _token: vscode.CancellationToken): Promise<vscode.TreeItem> {
    if ((item as any)?.resolveTreeItem) {
      return (item as any).resolveTreeItem();
    }
    return Promise.resolve(item);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}

// ---------------------------------------------------------------------------
// Tree-view item classes
// (inlined from foam-vscode utils/tree-views/tree-view-utils)
// ---------------------------------------------------------------------------

class BaseTreeItem extends vscode.TreeItem {
  resolveTreeItem(): Promise<vscode.TreeItem> {
    return Promise.resolve(this);
  }
  getChildren(): Promise<vscode.TreeItem[]> {
    return Promise.resolve([]);
  }
}

class UriTreeItem extends BaseTreeItem {
  public parent?: vscode.TreeItem;

  constructor(
    public readonly uri: URI,
    options: {
      collapsibleState?: vscode.TreeItemCollapsibleState;
      title?: string;
      parent?: vscode.TreeItem;
    } = {}
  ) {
    super(options?.title ?? uri.getName(), options.collapsibleState);
    this.parent = options.parent;
    this.description = uri.path.replace(
      vscode.workspace.getWorkspaceFolder(toVsCodeUri(uri))?.uri.path ?? '',
      ''
    );
    this.iconPath = new vscode.ThemeIcon('link');
  }
}

class ResourceTreeItem extends UriTreeItem {
  iconPath = vscode.ThemeIcon.File;
  contextValue = 'foam.resource';

  constructor(
    public readonly resource: Resource,
    private readonly ws: FoamWorkspace,
    options: {
      collapsibleState?: vscode.TreeItemCollapsibleState;
      parent?: vscode.TreeItem;
    } = {}
  ) {
    super(resource.uri, {
      title: resource.title,
      collapsibleState: options.collapsibleState,
      parent: options.parent,
    });
    this.command = {
      command: 'vscode.open',
      arguments: [toVsCodeUri(resource.uri)],
      title: 'Go to location',
    };
    this.resourceUri = toVsCodeUri(resource.uri);
  }

  async resolveTreeItem(): Promise<ResourceTreeItem> {
    const content = await this.ws.readAsMarkdown(this.resource.uri);
    this.tooltip = isSome(content)
      ? getNoteTooltip(content)
      : this.resource.title;
    return this;
  }
}

class ResourceRangeTreeItem extends BaseTreeItem {
  public value: unknown;
  constructor(
    public label: string,
    public variant: string,
    public readonly resource: Resource,
    public readonly range: Range,
    public readonly ws: FoamWorkspace
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = {
      command: 'vscode.open',
      arguments: [toVsCodeUri(resource.uri), { selection: range }],
      title: 'Go to location',
    };
  }

  static icons = {
    backlink: new vscode.ThemeIcon('arrow-left', new vscode.ThemeColor('charts.purple')),
    link: new vscode.ThemeIcon('arrow-right', new vscode.ThemeColor('charts.purple')),
  };

  async resolveTreeItem(): Promise<ResourceRangeTreeItem> {
    const markdown = (await this.ws.readAsMarkdown(this.resource.uri)) ?? '';
    const blockInfo = getBlockFor(markdown, this.range.start);
    const { nLines } = blockInfo;
    let { block } = blockInfo;
    if (nLines > 15) {
      const tmp = block.split('\n');
      tmp.splice(15, 1, '\n');
      block = tmp.join('\n');
    }
    this.tooltip = getNoteTooltip(block ?? this.label ?? '');
    return Promise.resolve(this);
  }

  static async createStandardItem(
    workspace: FoamWorkspace,
    resource: Resource,
    range: Range,
    variant: 'backlink' | 'link'
  ): Promise<ResourceRangeTreeItem> {
    const markdown = (await workspace.readAsMarkdown(resource.uri)) ?? '';
    const lines = markdown.split('\n');
    const line = lines[range.start.line];
    const start = Math.max(0, range.start.character - 15);
    const ellipsis = start === 0 ? '' : '...';
    const labelText = line
      ? `${range.start.line + 1}: ${ellipsis}${line.slice(start, start + 300)}`
      : Range.toString(range);

    const item = new ResourceRangeTreeItem(labelText, variant, resource, range, workspace);
    item.iconPath = ResourceRangeTreeItem.icons[variant];
    return item;
  }
}

// ---------------------------------------------------------------------------
// createConnectionItemsForResource (inlined from tree-view-utils)
// ---------------------------------------------------------------------------

async function createConnectionItemsForResource(
  workspace: FoamWorkspace,
  graph: FoamGraph,
  uri: URI,
  filter: (c: Connection) => boolean = () => true
): Promise<ResourceRangeTreeItem[]> {
  const connections = graph.getConnections(uri).filter(c => filter(c));

  const items = connections.map(async c => {
    const item = await ResourceRangeTreeItem.createStandardItem(
      workspace,
      workspace.get(c.source),
      c.link.range,
      c.source.asPlain().isEqual(uri) ? 'link' : 'backlink'
    );
    item.value = c;
    return item;
  });
  return Promise.all(items);
}

// ---------------------------------------------------------------------------
// ConnectionsTreeDataProvider
// ---------------------------------------------------------------------------

type BacklinkPanelTreeItem = ResourceTreeItem | ResourceRangeTreeItem;

export class ConnectionsTreeDataProvider extends BaseTreeProvider<vscode.TreeItem & { getChildren?: () => Promise<vscode.TreeItem[]> }> {
  public show: ContextMemento<'all links' | 'backlinks' | 'forward links'>;
  public include: ContextMemento<'notes-only' | 'all'>;
  public target?: URI = undefined;
  public nValues = 0;
  private connectionItems: ResourceRangeTreeItem[] = [];

  constructor(
    private workspace: FoamWorkspace,
    private graph: FoamGraph,
    public state: vscode.Memento,
    registerCommands = true
  ) {
    super();
    this.show = new ContextMemento<'all links' | 'backlinks' | 'forward links'>(
      this.state,
      `myst-notebook.views.connections.show`,
      'all links'
    );
    this.include = new ContextMemento<'notes-only' | 'all'>(
      this.state,
      `myst-notebook.views.connections.include`,
      'all'
    );
    if (!registerCommands) return;
    this.disposables.push(
      vscode.commands.registerCommand(`myst-notebook.views.connections.show:all-links`, () => {
        this.show.update('all links');
        this.refresh();
      }),
      vscode.commands.registerCommand(`myst-notebook.views.connections.show:backlinks`, () => {
        this.show.update('backlinks');
        this.refresh();
      }),
      vscode.commands.registerCommand(`myst-notebook.views.connections.show:forward-links`, () => {
        this.show.update('forward links');
        this.refresh();
      }),
      vscode.commands.registerCommand(`myst-notebook.views.connections.include:notes-only`, () => {
        this.include.update('notes-only');
        this.refresh();
      }),
      vscode.commands.registerCommand(`myst-notebook.views.connections.include:all`, () => {
        this.include.update('all');
        this.refresh();
      })
    );
  }

  async refresh(): Promise<void> {
    const uri = this.target;

    const connectionItems =
      isNone(uri) || isNone(this.workspace.find(uri))
        ? []
        : await createConnectionItemsForResource(
            this.workspace,
            this.graph,
            uri,
            (connection: Connection) => {
              const isBacklink = connection.target.asPlain().isEqual(this.target!);

              if (this.include.get() === 'notes-only') {
                const otherEnd = isBacklink ? connection.source : connection.target;
                const other = this.workspace.find(otherEnd);
                if (other && other.type !== 'note') {
                  return false;
                }
              }

              return (
                this.show.get() === 'all links' ||
                (isBacklink && this.show.get() === 'backlinks') ||
                (!isBacklink && this.show.get() === 'forward links')
              );
            }
          );

    this.connectionItems = connectionItems;
    this.nValues = connectionItems.length;
    super.refresh();
  }

  async getChildren(item?: BacklinkPanelTreeItem): Promise<vscode.TreeItem[]> {
    if (item && item instanceof BaseTreeItem) {
      return item.getChildren();
    }

    const byResource = this.connectionItems.reduce((acc, item) => {
      const connection = item.value as Connection;
      const isBacklink = connection.target.asPlain().isEqual(this.target!);
      const uri = isBacklink ? connection.source : connection.target;
      acc.set(uri.toString(), [...(acc.get(uri.toString()) ?? []), item]);
      return acc;
    }, new Map() as Map<string, ResourceRangeTreeItem[]>);

    const resourceItems: (ResourceTreeItem | UriTreeItem)[] = [];
    for (const [uriString, items] of byResource.entries()) {
      const uri = URI.parse(uriString, getWorkspaceDefaultScheme());
      const treeItem = uri.isPlaceholder()
        ? new UriTreeItem(uri, {
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
          })
        : new ResourceTreeItem(this.workspace.get(uri), this.workspace, {
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
          });
      const children = items.sort((a, b) => {
        return a.variant.localeCompare(b.variant) || Range.isBefore(a.range, b.range);
      });
      treeItem.getChildren = () => Promise.resolve(children);
      treeItem.description = `(${items.length}) ${treeItem.description}`;
      resourceItems.push(treeItem);
    }
    resourceItems.sort((a, b) => {
      const labelA = typeof a.label === 'string' ? a.label : '';
      const labelB = typeof b.label === 'string' ? b.label : '';
      return labelA.localeCompare(labelB);
    });
    return resourceItems;
  }
}

// ---------------------------------------------------------------------------
// Public registration entry-point
// ---------------------------------------------------------------------------

export function registerBacklinks(
  context: vscode.ExtensionContext,
  foam: Foam
): void {
  const provider = new ConnectionsTreeDataProvider(
    foam.workspace,
    foam.graph,
    context.globalState
  );
  const treeView = vscode.window.createTreeView('myst-notebook.connections', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  const onActiveTabChanged = async () => {
    const next = getActiveTabUri(foam.workspace);
    if (next === undefined) return;
    if (provider.target?.toString() === next.toString()) return;
    provider.target = next;
    await provider.refresh();
  };

  onActiveTabChanged();

  const titleMapping: Record<string, string> = {
    'all links': 'Connections - all',
    backlinks: 'Connections - backlinks',
    'forward links': 'Connections - links',
  };

  context.subscriptions.push(
    provider,
    treeView,
    foam.graph.onDidUpdate(() => provider.refresh()),
    onDidChangeActiveTab(() => onActiveTabChanged()),
    provider.onDidChangeTreeData(() => {
      treeView.title =
        (titleMapping[provider.show.get()] || 'Connections') +
        ` (${provider.nValues})`;
    })
  );
}
