/** Cell multi-selection extension. Pure module — no VS Code imports. */

export interface SelectionState {
  anchor: number;
  active: number;
  lastStart: number;
  lastEnd: number;
}

export interface SelectionInput {
  start: number;
  end: number;
  isEmpty: boolean;
}

export interface SelectionResult {
  state: SelectionState;
  start: number;
  end: number;
}

/**
 * Compute the next cell selection after an extend keypress.
 *
 * `anchor` is the fixed end of the selection; `active` is the end that moves.
 * Selection is `[min(anchor, active), max(anchor, active) + 1)`. The anchor is
 * reset lazily: when `current` does not equal the last selection we produced
 * (`prev.lastStart/lastEnd`), the user moved the selection, so we re-anchor
 * from `current`.
 */
export function extendCellSelection(
  prev: SelectionState | undefined,
  current: SelectionInput,
  cellCount: number,
  delta: -1 | 1,
): SelectionResult {
  if (cellCount <= 0) {
    return {
      state: prev ?? { anchor: 0, active: 0, lastStart: 0, lastEnd: 0 },
      start: 0,
      end: 0,
    };
  }

  if (current.isEmpty) {
    const idx = Math.min(Math.max(0, current.start), cellCount - 1);
    return {
      state: { anchor: idx, active: idx, lastStart: idx, lastEnd: idx + 1 },
      start: idx,
      end: idx + 1,
    };
  }

  const unchanged =
    prev !== undefined &&
    current.start === prev.lastStart &&
    current.end === prev.lastEnd;

  const anchor = unchanged ? prev.anchor : current.start;
  const activeBase = unchanged ? prev.active : current.end - 1;
  const active = Math.min(Math.max(0, activeBase + delta), cellCount - 1);

  const start = Math.min(anchor, active);
  const end = Math.max(anchor, active) + 1;

  return {
    state: { anchor, active, lastStart: start, lastEnd: end },
    start,
    end,
  };
}
