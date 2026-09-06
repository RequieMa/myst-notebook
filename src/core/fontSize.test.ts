import { describe, it, expect } from 'vitest';
import {
  clampFontSize,
  resolveFontSize,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_PRESETS,
} from './fontSize';

describe('clampFontSize', () => {
  it('clamps below the minimum', () => {
    expect(clampFontSize(7)).toBe(8);
  });

  it('clamps above the maximum', () => {
    expect(clampFontSize(33)).toBe(32);
  });

  it('rounds fractional values', () => {
    expect(clampFontSize(14.6)).toBe(15);
  });

  it('passes in-range integer values through unchanged', () => {
    expect(clampFontSize(16)).toBe(16);
  });

  it('clamps and rounds together at the top', () => {
    expect(clampFontSize(32.4)).toBe(32);
  });
});

describe('resolveFontSize', () => {
  it('returns markup when it is a positive number', () => {
    expect(resolveFontSize(16, 14)).toBe(16);
  });

  it('falls back to editor when markup is 0 (inherit)', () => {
    expect(resolveFontSize(0, 14)).toBe(14);
  });

  it('falls back to editor when markup is undefined', () => {
    expect(resolveFontSize(undefined, 14)).toBe(14);
  });

  it('defaults to 14 when both are undefined', () => {
    expect(resolveFontSize(undefined, undefined)).toBe(14);
  });

  it('ignores a non-positive editor and defaults to 14', () => {
    expect(resolveFontSize(undefined, -1)).toBe(14);
  });
});

describe('FONT_SIZE_PRESETS', () => {
  it('stays within the clamp range', () => {
    for (const p of FONT_SIZE_PRESETS) {
      expect(p).toBeGreaterThanOrEqual(FONT_SIZE_MIN);
      expect(p).toBeLessThanOrEqual(FONT_SIZE_MAX);
    }
  });
});
