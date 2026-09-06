import { describe, it, expect } from 'vitest';
import { extendCellSelection, type SelectionState } from './cellSelection';

describe('extendCellSelection', () => {
  it('first press grows downward from a single cell', () => {
    const r = extendCellSelection(undefined, { start: 3, end: 4, isEmpty: false }, 10, 1);
    expect(r.start).toBe(3);
    expect(r.end).toBe(5);
    expect(r.state).toEqual({ anchor: 3, active: 4, lastStart: 3, lastEnd: 5 });
  });

  it('continues growing downward', () => {
    const prev: SelectionState = { anchor: 3, active: 4, lastStart: 3, lastEnd: 5 };
    const r = extendCellSelection(prev, { start: 3, end: 5, isEmpty: false }, 10, 1);
    expect(r.start).toBe(3);
    expect(r.end).toBe(6);
  });

  it('shrinks from the bottom on up', () => {
    const prev: SelectionState = { anchor: 3, active: 5, lastStart: 3, lastEnd: 6 };
    const r = extendCellSelection(prev, { start: 3, end: 6, isEmpty: false }, 10, -1);
    expect(r.start).toBe(3);
    expect(r.end).toBe(5);
    expect(r.state.active).toBe(4);
  });

  it('returns to a single cell on further up', () => {
    const prev: SelectionState = { anchor: 3, active: 4, lastStart: 3, lastEnd: 5 };
    const r = extendCellSelection(prev, { start: 3, end: 5, isEmpty: false }, 10, -1);
    expect(r.start).toBe(3);
    expect(r.end).toBe(4);
  });

  it('crosses the anchor to grow upward', () => {
    const prev: SelectionState = { anchor: 3, active: 3, lastStart: 3, lastEnd: 4 };
    const r = extendCellSelection(prev, { start: 3, end: 4, isEmpty: false }, 10, -1);
    expect(r.start).toBe(2);
    expect(r.end).toBe(4);
  });

  it('re-anchors when the selection was changed by the user', () => {
    const prev: SelectionState = { anchor: 3, active: 5, lastStart: 3, lastEnd: 6 };
    const r = extendCellSelection(prev, { start: 7, end: 8, isEmpty: false }, 10, 1);
    expect(r.start).toBe(7);
    expect(r.end).toBe(9);
    expect(r.state.anchor).toBe(7);
  });

  it('clamps at the top boundary', () => {
    const prev: SelectionState = { anchor: 0, active: 0, lastStart: 0, lastEnd: 1 };
    const r = extendCellSelection(prev, { start: 0, end: 1, isEmpty: false }, 10, -1);
    expect(r.start).toBe(0);
    expect(r.end).toBe(1);
  });

  it('clamps at the bottom boundary', () => {
    const prev: SelectionState = { anchor: 9, active: 9, lastStart: 9, lastEnd: 10 };
    const r = extendCellSelection(prev, { start: 9, end: 10, isEmpty: false }, 10, 1);
    expect(r.start).toBe(9);
    expect(r.end).toBe(10);
  });

  it('selects a single cell from an empty selection', () => {
    const r = extendCellSelection(undefined, { start: 3, end: 3, isEmpty: true }, 10, 1);
    expect(r.start).toBe(3);
    expect(r.end).toBe(4);
    expect(r.state.anchor).toBe(3);
  });

  it('clamps an empty selection to cell 0', () => {
    const r = extendCellSelection(undefined, { start: -1, end: -1, isEmpty: true }, 10, 1);
    expect(r.start).toBe(0);
    expect(r.end).toBe(1);
  });

  it('continues from a mouse multi-selection', () => {
    const r = extendCellSelection(undefined, { start: 2, end: 5, isEmpty: false }, 10, 1);
    expect(r.start).toBe(2);
    expect(r.end).toBe(6);
    expect(r.state.anchor).toBe(2);
  });

  it('no-ops for an empty notebook', () => {
    const r = extendCellSelection(undefined, { start: 0, end: 0, isEmpty: true }, 0, 1);
    expect(r.start).toBe(0);
    expect(r.end).toBe(0);
  });
});
