/**
 * Hover provider — shows note content and back-references when hovering a link.
 *
 * Adapted from foam-vscode `src/vscode/features/navigation/hover-provider.ts`.
 * foam-vscode service/config imports replaced with inlined helpers.
 */

import { uniqWith } from 'lodash';
import * as vscode from 'vscode';
import {
  Foam,
  FoamWorkspace,
  FoamGraph,
  ResourceLink,
  ResourceParser,
  Range,
  Location,
  URI,
  isSome,
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

function toVsCodeRange(r: { start: { line: number; character: number }; end: { line: number; character: number } }): vscode.Range {
  return new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
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
// commandAsURI (inlined from foam-vscode utils/commands)
// ---------------------------------------------------------------------------

function commandAsURI(command: { name: string; params: unknown }): vscode.Uri {
  return vscode.Uri.parse(`command:${command.name}`, true).with({
    query: encodeURIComponent(JSON.stringify(command.params)),
  });
}

// ---------------------------------------------------------------------------
// getFoamDocSelectors (inlined from foam-vscode services/editor)
// ---------------------------------------------------------------------------

function getMystDocSelectors(): vscode.DocumentSelector {
  return [
    { language: 'markdown', scheme: 'file' },
    { language: 'markdown', scheme: 'vscode-vfs' },
    { language: 'markdown', scheme: 'untitled' },
  ];
}

// ---------------------------------------------------------------------------
// isHoverEnabled helper
// ---------------------------------------------------------------------------

function isHoverEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('myst-notebook')
    .get('links.hover.enable', true);
}

// ---------------------------------------------------------------------------
// HoverProvider
// ---------------------------------------------------------------------------

export class HoverProvider implements vscode.HoverProvider {
  constructor(
    private workspace: FoamWorkspace,
    private graph: FoamGraph,
    private parser: ResourceParser
  ) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    if (!isHoverEnabled()) return;

    const startResource = this.parser.parse(
      fromVsCodeUri(document.uri),
      document.getText()
    );

    const targetLink: ResourceLink | undefined = startResource.links.find(
      link =>
        Range.containsPosition(link.range, {
          line: position.line,
          character: position.character,
        })
    );
    if (!targetLink) return;

    const documentUri = fromVsCodeUri(document.uri);
    const targetUri = this.workspace.resolveLink(startResource, targetLink);
    const sources = uniqWith(
      this.graph
        .getBacklinks(targetUri)
        .filter(link => !link.source.isEqual(documentUri))
        .map(link => link.source),
      (u1, u2) => u1.isEqual(u2)
    );

    const links = sources.slice(0, 10).map(ref => {
      const command = { name: 'vscode.open', params: [toVsCodeUri(ref).toString()] };
      const resource = this.workspace.get(ref);
      return `- [${resource.title}](${commandAsURI(command).toString()})`;
    });

    const notes = `note${sources.length > 1 ? 's' : ''}`;
    let references: vscode.MarkdownString | null = null;
    if (sources.length > 0) {
      references = getNoteTooltip(
        [
          `Also referenced in ${sources.length} ${notes}:`,
          ...links,
          links.length === sources.length ? '' : '- ...',
        ].join('\n')
      );
    }

    let mdContent: vscode.MarkdownString | string | null = null;
    if (!targetUri.isPlaceholder()) {
      const content: string | null = await this.workspace.readAsMarkdown(targetUri);
      mdContent = isSome(content)
        ? getNoteTooltip(content)
        : this.workspace.get(targetUri).title;
    }

    // "Create note" link for placeholders
    let newNoteFromTemplate: vscode.MarkdownString | null = null;
    if (targetUri.isPlaceholder()) {
      const command = {
        name: 'vscode.open',
        params: [targetUri.path],
      };
      newNoteFromTemplate = new vscode.MarkdownString(
        `[Create note for '${targetUri.getBasename()}'](${commandAsURI(command).toString()})`
      );
      newNoteFromTemplate.isTrusted = true;
    }

    const hover: vscode.Hover = {
      contents: [mdContent, references, newNoteFromTemplate].filter(
        (c): c is NonNullable<typeof c> => c != null
      ),
      range: toVsCodeRange(targetLink.range),
    };
    return hover;
  }
}

function toVsCodeUri(u: URI): vscode.Uri {
  return vscode.Uri.from(u as Parameters<typeof vscode.Uri.from>[0]);
}

// ---------------------------------------------------------------------------
// Public registration entry-point
// ---------------------------------------------------------------------------

export function registerHover(
  context: vscode.ExtensionContext,
  foam: Foam
): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      getMystDocSelectors(),
      new HoverProvider(foam.workspace, foam.graph, foam.services.parser)
    )
  );
}
