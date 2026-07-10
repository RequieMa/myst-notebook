import { describe, it, expect } from 'vitest';
import { matchClosedShorthandFence } from './shorthand';

describe('matchClosedShorthandFence — defers until the closing ```', () => {
  it('matches a closed ```run fence and returns keyword + body', () => {
    expect(matchClosedShorthandFence('```run\nx = 1\n```')).toEqual({ keyword: 'run', body: 'x = 1' });
  });

  it('matches a closed ```show fence and returns keyword + body', () => {
    expect(matchClosedShorthandFence('```show\nx = 1\n```')).toEqual({ keyword: 'show', body: 'x = 1' });
  });

  it('returns empty body for an empty closed fence', () => {
    expect(matchClosedShorthandFence('```run\n\n```')).toEqual({ keyword: 'run', body: '' });
    expect(matchClosedShorthandFence('```show\n\n```')).toEqual({ keyword: 'show', body: '' });
  });

  it('captures multi-line bodies', () => {
    expect(matchClosedShorthandFence('```run\nx = 1\ny = 2\n```')).toEqual({ keyword: 'run', body: 'x = 1\ny = 2' });
  });

  it('tolerates surrounding whitespace on the slice', () => {
    expect(matchClosedShorthandFence('\n```run\nx = 1\n```\n')).toEqual({ keyword: 'run', body: 'x = 1' });
  });

  it('matches 4+ backtick opener with a matching closer', () => {
    expect(matchClosedShorthandFence('````show\nx = 1\n````')).toEqual({ keyword: 'show', body: 'x = 1' });
  });

  // ── Deferral: the call site passes textBeforeCursor, so an open fence never matches.
  // VS Code auto-inserts the closing ``` when you type the opener, leaving the buffer
  // ```run\n│\n``` with the cursor on the middle line — the slice below the cursor has
  // no closer, so nothing expands until the writer moves past the final ```.
  it('returns null for a bare opener (nothing typed yet)', () => {
    expect(matchClosedShorthandFence('```run')).toBeNull();
    expect(matchClosedShorthandFence('```show')).toBeNull();
  });

  it('returns null for the auto-closed slice (cursor on empty middle line)', () => {
    expect(matchClosedShorthandFence('```run\n')).toBeNull();
    expect(matchClosedShorthandFence('```show\n')).toBeNull();
  });

  it('returns null while the cursor sits inside the body before the closer', () => {
    expect(matchClosedShorthandFence('```run\nx = 1\n')).toBeNull();
    expect(matchClosedShorthandFence('```show\nx = 1\n')).toBeNull();
  });

  it('returns null for a regular python fence (not a shorthand keyword)', () => {
    expect(matchClosedShorthandFence('```python\nx = 1\n```')).toBeNull();
  });

  it('returns null for keyword suffixes', () => {
    expect(matchClosedShorthandFence('```runner\nx = 1\n```')).toBeNull();
    expect(matchClosedShorthandFence('```shown\nx = 1\n```')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(matchClosedShorthandFence('')).toBeNull();
  });
});
