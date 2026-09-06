/** Font-size control bounds and presets. Pure module — no VS Code imports. */

export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 32;
export const FONT_SIZE_STEP = 1;
export const FONT_SIZE_PRESETS = [12, 13, 14, 16, 18, 20, 24];

/** Clamp and round a requested font size into [FONT_SIZE_MIN, FONT_SIZE_MAX]. */
export function clampFontSize(n: number): number {
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)));
}

/**
 * Resolve the effective font size.
 *
 * `notebook.markup.fontSize` is `0` (or unset) when it should inherit from
 * `editor.fontSize`. Returns the markup value when it is a positive number,
 * otherwise the editor value when positive, otherwise the 14px fallback.
 */
export function resolveFontSize(
  markup: number | undefined,
  editor: number | undefined,
): number {
  if (typeof markup === 'number' && markup > 0) return markup;
  if (typeof editor === 'number' && editor > 0) return editor;
  return 14;
}
