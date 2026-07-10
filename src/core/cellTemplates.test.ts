import { describe, it, expect } from 'vitest';
import { makeExecutableCell, makeDisplayCodeCell } from './cellTemplates';
import { cellsToText } from './serializer';
import { hasHideInputTag } from './tags';

describe('makeExecutableCell', () => {
  it('is a python code cell with an empty body', () => {
    const cell = makeExecutableCell();
    expect(cell.kind).toBe('code');
    expect(cell.language).toBe('python');
    expect(cell.value).toBe('');
  });

  it('carries a hide-input tag option so it collapses by default', () => {
    const options = (makeExecutableCell().metadata.myst as any).options;
    expect(options).toEqual([':tags: [hide-input]']);
    expect(hasHideInputTag(options)).toBe(true);
  });

  it('serializes to canonical collapsed {code-cell} MyST', () => {
    expect(cellsToText([makeExecutableCell()])).toBe(
      '```{code-cell} python\n:tags: [hide-input]\n```',
    );
  });
});

describe('makeDisplayCodeCell', () => {
  it('is a markup cell holding a plain fenced python block', () => {
    const cell = makeDisplayCodeCell();
    expect(cell.kind).toBe('markup');
    expect(cell.value).toBe('```python\n\n```');
  });

  it('serializes its markup value verbatim (display-only, never executed)', () => {
    expect(cellsToText([makeDisplayCodeCell()])).toBe('```python\n\n```');
  });
});

describe('cellTemplates round-trip', () => {
  it('joins the two authoring kinds with a single blank line', () => {
    expect(cellsToText([makeExecutableCell(), makeDisplayCodeCell()])).toBe(
      '```{code-cell} python\n:tags: [hide-input]\n```' + '\n\n' + '```python\n\n```',
    );
  });
});
