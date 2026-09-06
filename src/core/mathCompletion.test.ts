import { describe, it, expect } from 'vitest';
import { shouldSuppressMathCompletion } from './mathCompletion';

describe('shouldSuppressMathCompletion', () => {
  it('does not suppress for a single backslash (command start)', () => {
    expect(shouldSuppressMathCompletion('a \\')).toBe(false);
  });

  it('suppresses for a double backslash (line break)', () => {
    expect(shouldSuppressMathCompletion('a \\\\')).toBe(true);
  });

  it('does not suppress for a triple backslash (break + command)', () => {
    expect(shouldSuppressMathCompletion('a \\\\\\')).toBe(false);
  });

  it('suppresses for a quadruple backslash (two breaks)', () => {
    expect(shouldSuppressMathCompletion('a \\\\\\\\')).toBe(true);
  });

  it('does not suppress when the prefix has no backslash', () => {
    expect(shouldSuppressMathCompletion('x^2 + y^2')).toBe(false);
  });

  it('does not suppress when the prefix ends with other text', () => {
    expect(shouldSuppressMathCompletion('a \\alpha')).toBe(false);
  });

  it('does not suppress for an empty prefix', () => {
    expect(shouldSuppressMathCompletion('')).toBe(false);
  });
});
