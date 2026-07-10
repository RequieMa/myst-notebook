import * as vscode from 'vscode';
import { Foam, URI } from '../../core';
import { Logger } from '../../core';
import { isSome } from '../../core';
import { buildGraphData } from '../../core';
import { isCitationTarget } from '../../myst-citation-parser';
import type {
  GraphStyle,
  GraphViewConfig,
  ShowGraphArgs,
} from '../../webview-src/protocol';

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

// ---------------------------------------------------------------------------
// Active-tab helpers (inlined from foam-vscode services/editor)
// ---------------------------------------------------------------------------

function getActiveTabUri(fWorkspace?: Foam['workspace']): URI | undefined {
  const tab = vscode.window.tabGroups?.activeTabGroup?.activeTab;
  const input = tab?.input;
  if (input && typeof input === 'object' && 'uri' in input && input.uri != null) {
    return fromVsCodeUri(input.uri as vscode.Uri);
  }
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  return activeUri ? fromVsCodeUri(activeUri) : undefined;
}

function onDidChangeActiveTab(listener: () => void): vscode.Disposable {
  const subscriptions = [
    vscode.window.onDidChangeActiveTextEditor(() => listener()),
    vscode.window.tabGroups.onDidChangeTabs(() => listener()),
    vscode.window.tabGroups.onDidChangeTabGroups(() => listener()),
  ];
  return { dispose: () => subscriptions.forEach(s => s.dispose()) };
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

export function getGraphStyle(): GraphStyle {
  const styleConfig =
    vscode.workspace.getConfiguration('myst-notebook.graph').get('style') ?? {};
  return { style: styleConfig as GraphStyle['style'] };
}

export function viewConfigToStyle(config: GraphViewConfig): GraphStyle {
  const nodeColors = config.show
    ? Object.fromEntries(
        Object.entries(config.show)
          .filter(([, cfg]) => cfg.color)
          .map(([type, cfg]) => [type, cfg.color!])
      )
    : undefined;

  const showNodesOfType = config.show
    ? Object.fromEntries(
        Object.entries(config.show).map(([type, cfg]) => [
          type,
          cfg.enabled ?? true,
        ])
      )
    : undefined;

  const styleProps: Record<string, unknown> = {};
  if (config.background !== undefined) styleProps.background = config.background;
  if (config.fontSize !== undefined) styleProps.fontSize = config.fontSize;
  if (config.fontFamily !== undefined) styleProps.fontFamily = config.fontFamily;
  if (config.lineColor !== undefined) styleProps.lineColor = config.lineColor;
  if (nodeColors && Object.keys(nodeColors).length > 0)
    styleProps.node = nodeColors;

  return {
    ...(config.colorBy !== undefined ? { colorMode: config.colorBy } : {}),
    ...(config.groups !== undefined ? { groups: config.groups } : {}),
    ...(showNodesOfType !== undefined ? { showNodesOfType } : {}),
    ...(Object.keys(styleProps).length > 0 ? { style: styleProps as GraphStyle['style'] } : {}),
  };
}

export function mergeStyles(base: GraphStyle, patch: GraphStyle): GraphStyle {
  return {
    colorMode: patch.colorMode ?? base.colorMode,
    groups: patch.groups ?? base.groups,
    showNodesOfType: { ...base.showNodesOfType, ...patch.showNodesOfType },
    style: { ...base.style, ...patch.style },
  };
}

export function resolveViewStyle(args?: ShowGraphArgs): {
  style: GraphStyle;
  view?: string;
} {
  const views: GraphViewConfig[] =
    vscode.workspace
      .getConfiguration('myst-notebook.graph')
      .get('views') ?? [];

  let style: GraphStyle = getGraphStyle();

  const namedView = args?.view ?? (args?.config ? undefined : 'Default');

  if (namedView) {
    const view = views.find(v => v.name === namedView);
    if (view) {
      style = mergeStyles(style, viewConfigToStyle(view));
    }
  }

  if (args?.config) {
    style = mergeStyles(style, viewConfigToStyle(args.config));
  }

  return { style, view: args?.view };
}

// ---------------------------------------------------------------------------
// Graph data
// ---------------------------------------------------------------------------

function cutTitle(title: string): string {
  const maxLen = vscode.workspace
    .getConfiguration('myst-notebook.graph')
    .get('titleMaxLength', 24);
  if (maxLen > 0 && title.length > maxLen) {
    return title.substring(0, maxLen).concat('...');
  }
  return title;
}

function generateGraphData(foam: Foam) {
  const data = buildGraphData(
    foam.workspace.list(),
    foam.graph.getAllConnections(),
    {
      resourceToId: uri => uri.path,
      transformTitle: title => cutTitle(title),
      includePlaceholders: true,
    }
  );

  for (const id of Object.keys(data.nodeInfo)) {
    const node = data.nodeInfo[id];
    if (node.type === 'placeholder') {
      if (isCitationTarget(id)) {
        node.type = 'citation';
      } else {
        delete data.nodeInfo[id];
        data.links = data.links.filter(l => l.source !== id && l.target !== id);
      }
    }
  }

  return data;
}

// ---------------------------------------------------------------------------
// Panel helpers
// ---------------------------------------------------------------------------

function updateGraph(panel: vscode.WebviewPanel, foam: Foam) {
  const graph = generateGraphData(foam);
  panel.webview.postMessage({
    type: 'didUpdateGraphData',
    payload: graph,
  });
}

export function handleActiveResourceChange(
  panel: vscode.WebviewPanel | undefined,
  foam: Foam,
  uri: URI | undefined
) {
  if (panel && uri && uri.scheme !== 'untitled') {
    const note = foam.workspace.find(uri);
    if (isSome(note)) {
      panel.webview.postMessage({
        type: 'didSelectNote',
        payload: note.uri.path,
      });
    }
  }
}

export function getNodeNavigationCommand(
  uriPath: string,
  navigateToPreview: boolean
): string {
  if (navigateToPreview && uriPath.endsWith('.md')) {
    return 'markdown.showPreview';
  }
  return 'vscode.open';
}

// ---------------------------------------------------------------------------
// Webview HTML
// ---------------------------------------------------------------------------

async function getWebviewContent(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel
): Promise<string> {
  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'graph', 'webview.js')
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'unsafe-eval' ${panel.webview.cspSource};
             style-src 'unsafe-inline' ${panel.webview.cspSource};
             font-src ${panel.webview.cspSource};
             img-src ${panel.webview.cspSource} data:;" />
  <title>MyST Graph</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
  </style>
</head>
<body>
  <div id="app" style="width:100%;height:100%;"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Panel lifecycle
// ---------------------------------------------------------------------------

async function setupGraphPanel(
  panel: vscode.WebviewPanel,
  foam: Foam,
  context: vscode.ExtensionContext,
  initialStyle?: GraphStyle
) {
  panel.webview.html = await getWebviewContent(context, panel);

  panel.webview.onDidReceiveMessage(
    async message => {
      switch (message.type) {
        case 'webviewDidLoad': {
          const style = initialStyle ?? getGraphStyle();
          panel.webview.postMessage({ type: 'didUpdateStyle', payload: style });
          updateGraph(panel, foam);
          break;
        }
        case 'webviewDidSelectNode': {
          const noteUri = vscode.Uri.parse(message.payload);
          const selectedNote = foam.workspace.get(fromVsCodeUri(noteUri));

          if (isSome(selectedNote)) {
            const navigateToPreview = vscode.workspace
              .getConfiguration('myst-notebook.graph')
              .get('navigateToPreview', false);
            const command = getNodeNavigationCommand(
              noteUri.path,
              navigateToPreview
            );
            if (command === 'markdown.showPreview') {
              vscode.commands.executeCommand(command, noteUri);
            } else {
              vscode.commands.executeCommand(
                command,
                noteUri,
                vscode.ViewColumn.One
              );
            }
          }
          break;
        }
        case 'error': {
          Logger.error('An error occurred in the graph view', message.payload);
          break;
        }
      }
    },
    undefined,
    context.subscriptions
  );
}

async function createGraphPanel(
  foam: Foam,
  context: vscode.ExtensionContext,
  options: { initialStyle?: GraphStyle; view?: string } = {}
) {
  const title = options.view ? `MyST Graph: ${options.view}` : 'MyST Graph';
  const panel = vscode.window.createWebviewPanel(
    'myst-graph',
    title,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  await setupGraphPanel(panel, foam, context, options.initialStyle);
  return panel;
}

// ---------------------------------------------------------------------------
// Public registration entry-point
// ---------------------------------------------------------------------------

export function registerGraphWebview(
  context: vscode.ExtensionContext,
  foamPromise: Promise<Foam>
): void {
  let panel: vscode.WebviewPanel | undefined = undefined;

  vscode.workspace.onDidChangeConfiguration(event => {
    if (panel) {
      if (event.affectsConfiguration('myst-notebook.graph.style')) {
        const style = getGraphStyle();
        panel.webview.postMessage({ type: 'didUpdateStyle', payload: style });
      }
    }
  });

  const attachPanelListeners = (p: vscode.WebviewPanel, foam: Foam) => {
    const onFoamChanged = (_: unknown) => {
      updateGraph(p, foam);
    };
    const noteUpdatedListener = foam.graph.onDidUpdate(onFoamChanged);
    const editorListener = onDidChangeActiveTab(() => {
      handleActiveResourceChange(p, foam, getActiveTabUri(foam.workspace));
    });
    p.onDidDispose(() => {
      noteUpdatedListener.dispose();
      editorListener.dispose();
      panel = undefined;
    });
  };

  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('myst-graph', {
      async deserializeWebviewPanel(
        webviewPanel: vscode.WebviewPanel,
        _state: unknown
      ) {
        panel = webviewPanel;
        const foam = await foamPromise;
        await setupGraphPanel(webviewPanel, foam, context, undefined);
        attachPanelListeners(webviewPanel, foam);
      },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'myst-notebook.graph.show',
      async (args?: ShowGraphArgs) => {
        const { style, view } = resolveViewStyle(args);
        if (panel) {
          panel.title = view ? `MyST Graph: ${view}` : 'MyST Graph';
          panel.webview.postMessage({ type: 'didUpdateStyle', payload: style });
          panel.reveal();
        } else {
          const foam = await foamPromise;
          panel = await createGraphPanel(foam, context, {
            initialStyle: style,
            view,
          });
          attachPanelListeners(panel, foam);
        }
      }
    )
  );

  const shouldOpenOnStartup = vscode.workspace
    .getConfiguration('myst-notebook.graph')
    .get('onStartup', false);
  if (shouldOpenOnStartup) {
    vscode.commands.executeCommand('myst-notebook.graph.show');
  }
}
