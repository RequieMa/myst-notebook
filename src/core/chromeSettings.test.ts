import { describe, it, expect } from 'vitest';
import { desiredChromeSettings } from './chromeSettings';

describe('desiredChromeSettings', () => {
  it('hides the global toolbar and the insert-cell toolbar', () => {
    expect(desiredChromeSettings()).toEqual({
      'notebook.globalToolbar': false,
      'notebook.insertToolbarLocation': 'hidden',
    });
  });
});
