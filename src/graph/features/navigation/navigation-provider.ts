/**
 * Navigation provider — definition, document links, hover (footnotes), and
 * reference providers for Foam-style links in MyST markdown files.
 *
 * Adapted from foam-vscode `src/vscode/features/navigation/navigation-provider.ts`.
 * foam-vscode service imports replaced with inlined helpers.
 */

import * as vscode from 'vscode';
import {
  Foam,
  FoamWorkspace,
  FoamGraph,
  FoamTags,
  Block,
  Footnote,
  Resource,
  ResourceLink,
  ResourceParser,
  URI,
  Range,
  Position,
  Location,
} from '../../core';
import type { Section } from '../../core';

// ---------------------------------------------------------------------------
// URI / range conversion helpers (inlined from foam-vscode vsc-utils)
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
// commandAsURI (inlined from foam-vscode utils/commands)
// ---------------------------------------------------------------------------

function commandAsURI(command: { name: string; params: unknown }): vscode.Uri {
  return vscode.Uri.parse(`command:${command.name}`, true).with({
    query: encodeURIComponent(JSON.stringify(command.params)),
  });
}

// ---------------------------------------------------------------------------
// fileExists (inlined from foam-vscode services/editor)
// ---------------------------------------------------------------------------

async function fileExists(uri: URI): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(toVsCodeUri(uri));
    return stat.type === vscode.FileType.File;
  } catch {
    return false;
  }
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
// NavigationProvider
// ---------------------------------------------------------------------------

/**
 * Provides navigation and references for Foam links.
 * - We create definitions for existing wikilinks but not placeholders
 * - We create links for both
 * - We create references for both
 *
 * Placeholders are created as links so that when clicking on them a new note
 * will be created. Definitions are automatically invoked by VS Code on hover,
 * whereas links require the user to explicitly click — we want note creation
 * to be explicit.
 */
export class NavigationProvider
  implements
    vscode.DefinitionProvider,
    vscode.DocumentLinkProvider,
    vscode.HoverProvider,
    vscode.ReferenceProvider
{
  constructor(
    private workspace: FoamWorkspace,
    private graph: FoamGraph,
    private parser: ResourceParser,
    private tags: FoamTags
  ) {}

  // -------------------------------------------------------------------------
  // References
  // -------------------------------------------------------------------------

  public provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Location[]> {
    const resource = this.parser.parse(
      fromVsCodeUri(document.uri),
      document.getText()
    );

    // Check if position is on a tag first
    const targetTag = resource.tags.find(tag =>
      Range.containsPosition(tag.range, position)
    );
    if (targetTag) {
      return this.getTagReferences(targetTag.label);
    }

    // Check if position is on a link
    const targetLink: ResourceLink | undefined = resource.links.find(link =>
      Range.containsPosition(link.range, position)
    );
    if (targetLink) {
      const uri = this.workspace.resolveLink(resource, targetLink);
      return this.graph
        .getBacklinks(uri)
        .map(
          connection =>
            new vscode.Location(
              toVsCodeUri(connection.source),
              toVsCodeRange(connection.link.range)
            )
        );
    }

    return;
  }

  private getTagReferences(tagLabel: string): vscode.Location[] {
    const references: vscode.Location[] = [];
    const tagLocations = this.tags.tags.get(tagLabel) ?? [];
    for (const tagLocation of tagLocations) {
      references.push(
        new vscode.Location(
          toVsCodeUri(tagLocation.uri),
          toVsCodeRange(tagLocation.range)
        )
      );
    }
    return references;
  }

  // -------------------------------------------------------------------------
  // Definition (Ctrl+Click navigation)
  // -------------------------------------------------------------------------

  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.LocationLink[] | undefined> {
    const resource = this.parser.parse(
      fromVsCodeUri(document.uri),
      document.getText()
    );
    const targetLink: ResourceLink | undefined = resource.links.find(link =>
      Range.containsPosition(link.range, position)
    );
    if (!targetLink) {
      const footnote = Footnote.findByPosition(resource, position);
      if (footnote?.definitionRange) {
        return [
          {
            originSelectionRange: toVsCodeRange(
              footnote.references.find(r =>
                Range.containsPosition(r, position)
              )!
            ),
            targetUri: document.uri,
            targetRange: toVsCodeRange(footnote.definitionRange),
            targetSelectionRange: toVsCodeRange(footnote.definitionRange),
          },
        ];
      }
      return;
    }

    // Resolved reference-style links are handled by provideDocumentLinks;
    // avoid a duplicate "2 definitions" picker.
    if (ResourceLink.isResolvedReference(targetLink)) {
      return;
    }

    const uri = this.workspace.resolveLink(resource, targetLink);
    if (targetLink.type === 'external') return;

    if (uri.isPlaceholder()) {
      // For direct path links, check if the file exists on disk even though
      // it's not indexed (e.g. extensionless dotfiles like .editorconfig).
      if (targetLink.type === 'link') {
        const realUri = uri.with({ scheme: 'file' });
        if (await fileExists(realUri)) {
          return [
            {
              originSelectionRange: new vscode.Range(
                targetLink.range.start.line,
                targetLink.range.start.character,
                targetLink.range.end.line,
                targetLink.range.end.character
              ),
              targetUri: toVsCodeUri(realUri),
              targetRange: new vscode.Range(0, 0, 0, 0),
              targetSelectionRange: new vscode.Range(0, 0, 0, 0),
            },
          ];
        }
      }
      return;
    }

    const targetResource = this.workspace.get(uri);
    const fragmentRange = resolveFragmentRange(targetResource, uri.fragment);

    const targetRange =
      fragmentRange ??
      Range.createFromPosition(Position.create(0, 0), Position.create(0, 0));
    const targetSelectionRange =
      fragmentRange ?? Range.createFromPosition(targetRange.start);

    const result: vscode.LocationLink = {
      originSelectionRange: new vscode.Range(
        targetLink.range.start.line,
        targetLink.range.start.character +
          (targetLink.type === 'wikilink' ? 2 : 0),
        targetLink.range.end.line,
        targetLink.range.end.character -
          (targetLink.type === 'wikilink' ? 2 : 0)
      ),
      targetUri: toVsCodeUri(uri.asPlain()),
      targetRange: toVsCodeRange(targetRange),
      targetSelectionRange: toVsCodeRange(targetSelectionRange),
    };
    return [result];
  }

  // -------------------------------------------------------------------------
  // Document links
  // -------------------------------------------------------------------------

  public async provideDocumentLinks(
    document: vscode.TextDocument
  ): Promise<vscode.DocumentLink[]> {
    const documentUri = fromVsCodeUri(document.uri);
    const resource = this.parser.parse(documentUri, document.getText());

    const targets: { link: ResourceLink; target: URI }[] = resource.links.map(
      link => ({
        link,
        target: this.workspace.resolveLink(resource, link),
      })
    );

    const placeholders = targets.filter(o => o.target.isPlaceholder());

    // For resolved reference-style links (wikilinks and markdown links), VS Code's
    // built-in Markdown provider intercepts cmd+click; we override it with an
    // explicit DocumentLink pointing at the resolved target.
    const resolvedReferenceLinks: vscode.DocumentLink[] = targets
      .filter(
        o =>
          ResourceLink.isResolvedReference(o.link) &&
          !o.target.isPlaceholder()
      )
      .map(o => {
        const dl = new vscode.DocumentLink(
          toVsCodeRange(o.link.range),
          toVsCodeUri(o.target.asPlain())
        );
        dl.tooltip = o.target.getBasename();
        return dl;
      });

    const links: vscode.DocumentLink[] = (
      await Promise.all(
        placeholders.map(async o => {
          // Skip if the file exists on disk but isn't indexed.
          if (o.link.type === 'link') {
            const realUri = o.target.with({ scheme: 'file' });
            if (await fileExists(realUri)) return null;
          }

          // Create-note command for placeholders
          const command = {
            name: 'vscode.open',
            params: [o.target.path],
          };

          const documentLink = new vscode.DocumentLink(
            new vscode.Range(
              o.link.range.start.line,
              o.link.range.start.character + 2,
              o.link.range.end.line,
              o.link.range.end.character - 2
            ),
            commandAsURI(command)
          );
          documentLink.tooltip = `Create note for '${o.target.path}'`;
          return documentLink;
        })
      )
    ).filter((x): x is vscode.DocumentLink => x != null);

    const tags: vscode.DocumentLink[] = resource.tags.map(tag => {
      const command = {
        name: 'myst-notebook.views.tags-explorer.focus',
        params: [tag.label, documentUri],
      };

      const documentLink = new vscode.DocumentLink(
        new vscode.Range(
          tag.range.start.line,
          tag.range.start.character,
          tag.range.end.line,
          tag.range.end.character
        ),
        commandAsURI(command)
      );
      documentLink.tooltip = `Explore tag '${tag.label}'`;
      return documentLink;
    });

    return links.concat(resolvedReferenceLinks).concat(tags);
  }

  // -------------------------------------------------------------------------
  // Hover (footnotes only)
  // -------------------------------------------------------------------------

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    const resource = this.parser.parse(
      fromVsCodeUri(document.uri),
      document.getText()
    );
    const footnote = Footnote.findByPosition(resource, position);
    if (!footnote?.definitionRange) return;
    const defLine = document.lineAt(footnote.definitionRange.start.line).text;
    const content = defLine.replace(/\[/g, '\\[');
    return new vscode.Hover(
      new vscode.MarkdownString(content),
      toVsCodeRange(
        footnote.references.find(r => Range.containsPosition(r, position))!
      )
    );
  }
}

// ---------------------------------------------------------------------------
// Fragment-range resolver
// ---------------------------------------------------------------------------

/**
 * Returns the Range for a URI fragment, handling both section links
 * (`#Heading`) and block anchor links (`#^blockid`).
 * Returns null if the fragment is empty or not found.
 */
function resolveFragmentRange(
  resource: Resource,
  fragment: string
): (Section | Block)['range'] | null {
  if (!fragment) return null;
  if (fragment.startsWith('^')) {
    return Resource.findBlock(resource, fragment.slice(1))?.range ?? null;
  }
  return Resource.findSection(resource, fragment)?.range ?? null;
}

// ---------------------------------------------------------------------------
// Public registration entry-point
// ---------------------------------------------------------------------------

export function registerNavigation(
  context: vscode.ExtensionContext,
  foam: Foam
): void {
  const navigationProvider = new NavigationProvider(
    foam.workspace,
    foam.graph,
    foam.services.parser,
    foam.tags
  );

  const selectors = getMystDocSelectors();
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selectors, navigationProvider),
    vscode.languages.registerDocumentLinkProvider(selectors, navigationProvider),
    vscode.languages.registerHoverProvider(selectors, navigationProvider),
    vscode.languages.registerReferenceProvider(selectors, navigationProvider)
  );
}
