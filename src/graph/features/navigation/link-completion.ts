/**
 * Wikilink and section completion providers.
 *
 * Adapted from foam-vscode `src/vscode/features/navigation/link-completion.ts`.
 * foam-vscode service/config imports replaced with inlined helpers.
 *
 * Note: `WikilinkCompletionProvider` is kept for completeness. Wikilink
 * syntax (`[[`) is not MyST-native, so it will rarely trigger in practice,
 * but the provider doesn't hurt and keeps the codebase complete.
 */

import * as vscode from 'vscode';
import {
  Foam,
  FoamWorkspace,
  FoamGraph,
  Resource,
  URI,
} from '../../core';
import { isCitationTarget } from '../../myst-citation-parser';

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
// getMystDocSelectors (inlined from foam-vscode services/editor)
// ---------------------------------------------------------------------------

function getMystDocSelectors(): vscode.DocumentSelector {
  return [
    { language: 'markdown', scheme: 'file' },
    { language: 'markdown', scheme: 'vscode-vfs' },
    { language: 'markdown', scheme: 'untitled' },
  ];
}

// ---------------------------------------------------------------------------
// Config helpers (inlined from foam-vscode config + vscode workspace API)
// ---------------------------------------------------------------------------

function getCompletionLabelSetting(): 'path' | 'title' | 'identifier' {
  return vscode.workspace
    .getConfiguration('myst-notebook')
    .get<'path' | 'title' | 'identifier'>('completion.label', 'path');
}

function getCompletionAliasSetting(): 'never' | 'whenPathDiffersFromTitle' {
  return vscode.workspace
    .getConfiguration('myst-notebook')
    .get<'never' | 'whenPathDiffersFromTitle'>('completion.useAlias', 'never');
}

function getCompletionLinkFormatSetting(): 'wikilink' | 'link' {
  return vscode.workspace
    .getConfiguration('myst-notebook')
    .get<'wikilink' | 'link'>('completion.linkFormat', 'wikilink');
}

function getLinksDirectoryMode(): 'resolve' | 'disabled' {
  return vscode.workspace
    .getConfiguration('myst-notebook')
    .get<'resolve' | 'disabled'>('links.directory.mode', 'resolve');
}

// ---------------------------------------------------------------------------
// Commit characters and cursor-move command
// ---------------------------------------------------------------------------

export const aliasCommitCharacters = ['#'];
export const linkCommitCharacters = ['#', '|'];
export const sectionCommitCharacters = ['|'];

const COMPLETION_CURSOR_MOVE = {
  command: 'myst-notebook.completion-move-cursor',
  title: 'MyST Notebook: Move cursor after completion',
};

// ---------------------------------------------------------------------------
// Regexes
// ---------------------------------------------------------------------------

export const WIKILINK_REGEX = /\[\[[^[\]]*(?!.*\]\])/;
export const SECTION_REGEX = /\[\[([^[\]]*#(?!.*\]\]))/;

// ---------------------------------------------------------------------------
// SectionCompletionProvider
// ---------------------------------------------------------------------------

export class SectionCompletionProvider
  implements vscode.CompletionItemProvider<vscode.CompletionItem>
{
  constructor(private ws: FoamWorkspace) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionList<vscode.CompletionItem>> {
    const cursorPrefix = document
      .lineAt(position)
      .text.substr(0, position.character);

    const match = cursorPrefix.match(SECTION_REGEX);
    if (!match) return null;

    const resourceId =
      match[1] === '#' ? fromVsCodeUri(document.uri) : match[1].slice(0, -1);

    const resource = this.ws.find(resourceId);
    const replacementRange = new vscode.Range(
      position.line,
      cursorPrefix.lastIndexOf('#') + 1,
      position.line,
      position.character
    );
    if (resource) {
      const fragmentSoFar = cursorPrefix.slice(
        cursorPrefix.lastIndexOf('#') + 1
      );
      if (fragmentSoFar.startsWith('^')) {
        // Block anchor completions
        const items = resource.blocks.map(b => {
          const label = `^${b.id}`;
          const item = new ResourceCompletionItem(
            label,
            vscode.CompletionItemKind.Text,
            resource.uri.with({ fragment: `^${b.id}` })
          );
          item.detail = b.type;
          item.sortText = String(b.range.start.line).padStart(5, '0');
          item.range = replacementRange;
          item.commitCharacters = sectionCommitCharacters;
          item.command = COMPLETION_CURSOR_MOVE;
          return item;
        });
        return new vscode.CompletionList(items);
      }
      // Section completions
      const items = resource.sections.map(b => {
        const item = new ResourceCompletionItem(
          b.label,
          vscode.CompletionItemKind.Text,
          resource.uri.with({ fragment: b.label })
        );
        item.sortText = String(b.range.start.line).padStart(5, '0');
        item.range = replacementRange;
        item.commitCharacters = sectionCommitCharacters;
        item.command = COMPLETION_CURSOR_MOVE;
        return item;
      });
      return new vscode.CompletionList(items);
    }
  }

  resolveCompletionItem(
    item: ResourceCompletionItem | vscode.CompletionItem
  ): vscode.ProviderResult<vscode.CompletionItem> {
    if (item instanceof ResourceCompletionItem) {
      return this.ws.readAsMarkdown(item.resourceUri).then(text => {
        if (text != null) item.documentation = getNoteTooltip(text);
        return item;
      });
    }
    return item;
  }
}

// ---------------------------------------------------------------------------
// WikilinkCompletionProvider
// ---------------------------------------------------------------------------

export class WikilinkCompletionProvider
  implements vscode.CompletionItemProvider<vscode.CompletionItem>
{
  constructor(private ws: FoamWorkspace, private graph: FoamGraph) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionList<vscode.CompletionItem>> {
    const cursorPrefix = document
      .lineAt(position)
      .text.substr(0, position.character);

    const requiresAutocomplete = cursorPrefix.match(WIKILINK_REGEX);
    if (!requiresAutocomplete || requiresAutocomplete[0].indexOf('#') >= 0) {
      return null;
    }

    const text = requiresAutocomplete[0];
    const labelStyle = getCompletionLabelSetting();
    const aliasSetting = getCompletionAliasSetting();
    const linkFormat = getCompletionLinkFormatSetting();

    const replacementRange = new vscode.Range(
      position.line,
      position.character - (text.length - 2),
      position.line,
      position.character
    );

    const directoryMode = getLinksDirectoryMode();

    const resources = this.ws.list().map(resource => {
      const resourceIsDocument =
        ['attachment', 'image'].indexOf(resource.type) === -1;

      const directoryIdentifier =
        resourceIsDocument && directoryMode === 'resolve'
          ? this.ws.getDirectoryIdentifier(resource.uri)
          : null;
      const identifier =
        directoryIdentifier && !this.ws.find(directoryIdentifier)
          ? directoryIdentifier
          : this.ws.getIdentifier(resource.uri);

      const label = !resourceIsDocument
        ? identifier
        : labelStyle === 'path'
        ? vscode.workspace.asRelativePath(toVsCodeUri(resource.uri))
        : labelStyle === 'title'
        ? resource.title
        : identifier;

      const item = new ResourceCompletionItem(
        label,
        vscode.CompletionItemKind.File,
        resource.uri
      );

      item.detail = vscode.workspace.asRelativePath(toVsCodeUri(resource.uri));
      item.sortText = resourceIsDocument
        ? `0-${item.label}`
        : `1-${item.label}`;

      const useAlias =
        resourceIsDocument &&
        linkFormat !== 'link' &&
        aliasSetting !== 'never' &&
        wikilinkRequiresAlias(resource, this.ws.defaultExtension);

      item.insertText = useAlias
        ? `${identifier}|${resource.title}`
        : identifier;
      item.commitCharacters =
        useAlias || linkFormat === 'link' ? [] : linkCommitCharacters;
      item.range = replacementRange;
      item.command = COMPLETION_CURSOR_MOVE;
      return item;
    });

    const aliases = this.ws.list().flatMap(resource =>
      resource.aliases.map(a => {
        const item = new ResourceCompletionItem(
          a.title,
          vscode.CompletionItemKind.Reference,
          resource.uri
        );

        const identifier = this.ws.getIdentifier(resource.uri);
        item.insertText = `${identifier}|${a.title}`;
        item.commitCharacters =
          linkFormat === 'link' ? [] : aliasCommitCharacters;
        item.range = replacementRange;
        item.command = COMPLETION_CURSOR_MOVE;
        item.detail = `Alias of ${vscode.workspace.asRelativePath(
          toVsCodeUri(resource.uri)
        )}`;
        return item;
      })
    );

    const placeholders = Array.from(this.graph.placeholders.values())
      .filter(uri => !isCitationTarget(uri.path))
      .map(uri => {
        const item = new vscode.CompletionItem(
          uri.path,
          vscode.CompletionItemKind.Interface
        );
        item.insertText = uri.path;
        item.command = COMPLETION_CURSOR_MOVE;
        item.range = replacementRange;
        return item;
      });

    return new vscode.CompletionList([
      ...resources,
      ...aliases,
      ...placeholders,
    ]);
  }

  resolveCompletionItem(
    item: ResourceCompletionItem | vscode.CompletionItem
  ): vscode.ProviderResult<vscode.CompletionItem> {
    if (item instanceof ResourceCompletionItem) {
      return this.ws.readAsMarkdown(item.resourceUri).then(text => {
        if (text != null) item.documentation = getNoteTooltip(text);
        return item;
      });
    }
    return item;
  }
}

// ---------------------------------------------------------------------------
// ResourceCompletionItem
// ---------------------------------------------------------------------------

class ResourceCompletionItem extends vscode.CompletionItem {
  constructor(
    label: string,
    type: vscode.CompletionItemKind,
    public resourceUri: URI
  ) {
    super(label, type);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const normalize = (text: string) => text.toLocaleLowerCase().trim();

function wikilinkRequiresAlias(resource: Resource, defaultExtension: string) {
  const nameWithoutExt = resource.uri.getName();
  const titleWithoutExt = resource.title.endsWith(defaultExtension)
    ? resource.title.slice(0, -defaultExtension.length)
    : resource.title;
  return normalize(nameWithoutExt) !== normalize(titleWithoutExt);
}

// ---------------------------------------------------------------------------
// Public registration entry-point
// ---------------------------------------------------------------------------

export function registerLinkCompletion(
  context: vscode.ExtensionContext,
  foam: Foam
): void {
  const selectors = getMystDocSelectors();

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selectors,
      new WikilinkCompletionProvider(foam.workspace, foam.graph),
      '['
    ),
    vscode.languages.registerCompletionItemProvider(
      selectors,
      new SectionCompletionProvider(foam.workspace),
      '#',
      '^'
    ),

    /**
     * Always jump to the closing bracket, but jump back the cursor when
     * committed by alias divider `|` or section divider `#`.
     * See https://github.com/foambubble/foam/issues/962
     */
    vscode.commands.registerCommand(
      COMPLETION_CURSOR_MOVE.command,
      async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) return;
        const document = activeEditor.document;
        const currentPosition = activeEditor.selection.active;
        const cursorChange = vscode.window.onDidChangeTextEditorSelection(
          async e => {
            const changedPosition = e.selections[0].active;
            const preChar = document
              .lineAt(changedPosition.line)
              .text.charAt(changedPosition.character - 1);

            const { character: selectionChar, line: selectionLine } =
              e.selections[0].active;

            const { line: completionLine, character: completionChar } =
              currentPosition;

            const inCompleteBySectionDivider =
              linkCommitCharacters.includes(preChar) &&
              selectionLine === completionLine &&
              selectionChar === completionChar + 1;

            cursorChange.dispose();
            if (inCompleteBySectionDivider) {
              await vscode.commands.executeCommand('cursorMove', {
                to: 'left',
                by: 'character',
                value: 2,
              });
            }
          }
        );

        await vscode.commands.executeCommand('cursorMove', {
          to: 'right',
          by: 'character',
          value: 2,
        });
      }
    )
  );
}
