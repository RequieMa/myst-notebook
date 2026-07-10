import { describe, it, expect } from 'vitest';
import { hasHideInputTag, hideInputFromCellMetadata } from './tags';

describe('hasHideInputTag', () => {
  it('is true when :tags: contains hide-input', () => {
    expect(hasHideInputTag([':tags: [hide-input]'])).toBe(true);
  });

  it('is true when :tags: contains hide-cell', () => {
    expect(hasHideInputTag([':tags: [hide-cell]'])).toBe(true);
  });

  it('is true when hide-input sits among other tags', () => {
    expect(hasHideInputTag([':tags: [hide-input, remove-output]'])).toBe(true);
  });

  it('is true for a double-quoted hide-input', () => {
    expect(hasHideInputTag([':tags: ["hide-input"]'])).toBe(true);
  });

  it('is true for a single-quoted hide-input', () => {
    expect(hasHideInputTag([":tags: ['hide-input']"])).toBe(true);
  });

  it('is false when :tags: has no hide-input/hide-cell', () => {
    expect(hasHideInputTag([':tags: [raises-exception]'])).toBe(false);
  });

  it('ignores non-:tags: option lines', () => {
    expect(hasHideInputTag([':name: foo'])).toBe(false);
  });

  it('is false for empty options', () => {
    expect(hasHideInputTag([])).toBe(false);
  });

  it('is false for undefined options', () => {
    expect(hasHideInputTag(undefined)).toBe(false);
  });

  it('finds a :tags: line that is not first', () => {
    expect(hasHideInputTag([':name: foo', ':tags: [hide-input]'])).toBe(true);
  });
});

describe('hideInputFromCellMetadata', () => {
  it('is true when metadata.myst.options carries a hide-input tag', () => {
    expect(hideInputFromCellMetadata({ myst: { options: [':tags: [hide-input]'] } })).toBe(true);
  });

  it('is false for a non-hide option line', () => {
    expect(hideInputFromCellMetadata({ myst: { options: [':name: foo'] } })).toBe(false);
  });

  it('is false when myst has no options', () => {
    expect(hideInputFromCellMetadata({ myst: {} })).toBe(false);
  });

  it('is false when metadata has no myst', () => {
    expect(hideInputFromCellMetadata({})).toBe(false);
  });

  it('is false for undefined metadata', () => {
    expect(hideInputFromCellMetadata(undefined)).toBe(false);
  });
});
