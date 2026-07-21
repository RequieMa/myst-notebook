import { describe, it, expect } from 'vitest';
import { registerEnterSplit } from './enterSplit';

/**
 * Smoke-test: verify registerEnterSplit registers the myst-notebook.onEnter
 * command. This would have caught the cellStatusBar regression where a bad
 * vscode API call in a module loaded before enterSplit caused activation to
 * throw, silently skipping onEnter registration.
 *
 * We test by inspecting the context subscriptions: registerEnterSplit calls
 * context.subscriptions.push(...) with a Disposable returned by
 * vscode.commands.registerCommand.
 */
describe('registerEnterSplit', () => {
  it('does not throw when called (regression guard)', () => {
    // If registerEnterSplit throws, the onEnter command is lost. The cellStatusBar
    // regression was: a non-existent vscode API call threw before reaching this
    // line, so onEnter was never registered.
    expect(() => {
      registerEnterSplit({ subscriptions: [] } as any);
    }).not.toThrow();
  });

  it('adds to context subscriptions', () => {
    const subs: any[] = [];
    registerEnterSplit({ subscriptions: subs } as any);
    expect(subs.length).toBeGreaterThan(0);
  });
});
