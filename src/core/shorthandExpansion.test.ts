import { describe, it, expect } from 'vitest';
import { planShorthandExpansion } from './shorthandExpansion';

describe('planShorthandExpansion — maps a matched shorthand to an expansion plan', () => {
  it('run → executable code cell carrying the body, no edit-mode, auto-runs', () => {
    const plan = planShorthandExpansion({ keyword: 'run', body: 'x = 1' });
    expect(plan.cell.kind).toBe('code');
    expect(plan.cell.language).toBe('python');
    expect(plan.cell.value).toBe('x = 1');
    expect(plan.enterEdit).toBe(false);
    expect(plan.autoRun).toBe(true);
  });

  it('run with multi-line body preserves the whole body and auto-runs', () => {
    const plan = planShorthandExpansion({ keyword: 'run', body: 'x = 1\ny = 2' });
    expect(plan.cell.value).toBe('x = 1\ny = 2');
    expect(plan.autoRun).toBe(true);
  });

  it('run with an EMPTY body does NOT auto-run (no spurious no-op execution)', () => {
    const plan = planShorthandExpansion({ keyword: 'run', body: '' });
    expect(plan.cell.kind).toBe('code');
    expect(plan.autoRun).toBe(false);
  });

  it('run with a whitespace-only body does NOT auto-run', () => {
    const plan = planShorthandExpansion({ keyword: 'run', body: '   \n  ' });
    expect(plan.autoRun).toBe(false);
  });

  it('show → display-only markup cell wrapping the body, enters edit-mode, never runs', () => {
    const plan = planShorthandExpansion({ keyword: 'show', body: 'x = 1' });
    expect(plan.cell.kind).toBe('markup');
    expect(plan.cell.value).toBe('```python\nx = 1\n```');
    expect(plan.enterEdit).toBe(true);
    expect(plan.autoRun).toBe(false);
  });

  it('show with an empty body still produces a valid display cell and never runs', () => {
    const plan = planShorthandExpansion({ keyword: 'show', body: '' });
    expect(plan.cell.kind).toBe('markup');
    expect(plan.cell.value).toBe('```python\n\n```');
    expect(plan.autoRun).toBe(false);
    expect(plan.enterEdit).toBe(true);
  });
});
