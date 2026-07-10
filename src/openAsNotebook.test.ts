import { describe, it, expect } from 'vitest';
import { shouldOfferNotebook } from './openAsNotebook';

describe('shouldOfferNotebook', () => {
  const base = { isMarkdown: true, inMystWorkspace: true, alreadyNotebook: false, dismissed: false };
  it('offers for a markdown text doc in a MyST workspace, not dismissed', () => {
    expect(shouldOfferNotebook(base)).toBe(true);
  });
  it('does not offer for non-markdown', () => {
    expect(shouldOfferNotebook({ ...base, isMarkdown: false })).toBe(false);
  });
  it('does not offer outside a MyST workspace', () => {
    expect(shouldOfferNotebook({ ...base, inMystWorkspace: false })).toBe(false);
  });
  it('does not offer when the doc is already the notebook editor', () => {
    expect(shouldOfferNotebook({ ...base, alreadyNotebook: true })).toBe(false);
  });
  it('does not offer once the user dismissed', () => {
    expect(shouldOfferNotebook({ ...base, dismissed: true })).toBe(false);
  });
});
