declare module 'remark-wiki-link' {
  import { Plugin } from 'unified';
  interface WikiLinkOptions {
    pageResolver?: (name: string) => string[];
    hrefTemplate?: (permalink: string) => string;
    wikiLinkClassName?: string;
    newClassName?: string;
    aliasDivider?: string;
  }
  const wikiLinkPlugin: Plugin<[WikiLinkOptions?]>;
  export = wikiLinkPlugin;
}
