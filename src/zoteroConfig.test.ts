import { describe, it, expect } from 'vitest';
import {
  caywUrlForRole,
  isMystCiteUrl,
  ZOTERO_EXTENSION_ID,
  ZOTERO_SETTING,
  type CiteRole,
} from './zoteroConfig';

const ROLES: CiteRole[] = ['cite', 'cite:p', 'cite:t'];

describe('caywUrlForRole', () => {
  it('returns a Better BibTeX CAYW eta-template URL for each role', () => {
    for (const role of ROLES) {
      const url = caywUrlForRole(role);
      expect(url).toContain('http://127.0.0.1:23119/better-bibtex/cayw');
      expect(url).toContain('format=eta');
      // uses the confirmed citationKey field
      expect(decodeURIComponent(url)).toContain('citationKey');
    }
  });

  it('encodes the correct role directive in the template', () => {
    // decoded template should contain the exact MyST role text
    expect(decodeURIComponent(caywUrlForRole('cite'))).toContain('{cite}`');
    expect(decodeURIComponent(caywUrlForRole('cite:p'))).toContain('{cite:p}`');
    expect(decodeURIComponent(caywUrlForRole('cite:t'))).toContain('{cite:t}`');
  });

  it('produces three distinct URLs differing only by role', () => {
    const urls = ROLES.map(caywUrlForRole);
    expect(new Set(urls).size).toBe(3);
  });

  it('is a valid, fully-encoded URL (no spaces)', () => {
    for (const role of ROLES) {
      expect(caywUrlForRole(role)).not.toMatch(/\s/);
    }
  });
});

describe('isMystCiteUrl', () => {
  it('recognises every URL that caywUrlForRole produces', () => {
    for (const role of ROLES) {
      expect(isMystCiteUrl(caywUrlForRole(role))).toBe(true);
    }
  });

  it('is false for undefined / empty', () => {
    expect(isMystCiteUrl(undefined)).toBe(false);
    expect(isMystCiteUrl('')).toBe(false);
  });

  it("is false for mblode.zotero's pandoc default", () => {
    expect(
      isMystCiteUrl('http://127.0.0.1:23119/better-bibtex/cayw?format=pandoc')
    ).toBe(false);
  });

  it('is false for an unrelated URL', () => {
    expect(isMystCiteUrl('https://example.com/whatever')).toBe(false);
  });
});

describe('constants', () => {
  it('exposes the mblode.zotero extension id and setting key', () => {
    expect(ZOTERO_EXTENSION_ID).toBe('mblode.zotero');
    expect(ZOTERO_SETTING).toBe('zotero-citation-picker.port');
  });
});
