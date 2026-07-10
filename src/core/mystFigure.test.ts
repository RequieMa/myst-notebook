import { describe, it, expect } from 'vitest';
import { parseFigureBody } from './mystFigure';

describe('parseFigureBody — separates option lines from caption', () => {
  it('extracts leading :key: value options', () => {
    const { options } = parseFigureBody(':alt: a cat\n:width: 400px');
    expect(options).toEqual({ alt: 'a cat', width: '400px' });
  });

  it('treats trailing text as caption, not options', () => {
    const { options, caption } = parseFigureBody(
      ':alt: a cat\n:width: 400px\n\nA caption paragraph.'
    );
    expect(options).toEqual({ alt: 'a cat', width: '400px' });
    expect(caption).toBe('A caption paragraph.');
  });

  it('does not misparse a colon-looking line inside the caption as an option', () => {
    const { options, caption } = parseFigureBody(
      ':alt: a cat\n\nSee :ref:`foo` for details.'
    );
    expect(options).toEqual({ alt: 'a cat' });
    expect(caption).toBe('See :ref:`foo` for details.');
  });

  it('keeps a caption line that STARTS with a colon-word as caption (true MyST edge)', () => {
    // The option block ends at the first blank line; a following line that
    // begins with a colon-word (`:ref:`) is caption, NOT another option.
    const { options, caption } = parseFigureBody(
      ':alt: cat\n\n:ref:`x` is neat.'
    );
    expect(options).toEqual({ alt: 'cat' });
    expect(caption).toBe(':ref:`x` is neat.');
  });

  it('accepts an empty option value', () => {
    const { options, caption } = parseFigureBody(':alt:');
    expect(options).toEqual({ alt: '' });
    expect(caption).toBe('');
  });

  it('handles a body with no options (all caption)', () => {
    const { options, caption } = parseFigureBody('Just a caption.');
    expect(options).toEqual({});
    expect(caption).toBe('Just a caption.');
  });

  it('handles an options-only body (image, no caption)', () => {
    const { options, caption } = parseFigureBody(':alt: logo');
    expect(options).toEqual({ alt: 'logo' });
    expect(caption).toBe('');
  });

  it('preserves multi-line caption content', () => {
    const { caption } = parseFigureBody(':alt: x\n\nLine one\nLine two');
    expect(caption).toBe('Line one\nLine two');
  });

  it('trims whitespace around option values', () => {
    const { options } = parseFigureBody(':align:   center   ');
    expect(options).toEqual({ align: 'center' });
  });
});
