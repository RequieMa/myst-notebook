import * as vscode from 'vscode';

/**
 * Shared diagnostic channel. Temporary instrumentation to pin down why ```run
 * auto-execution does not reach the controller / kernel. Visible under
 * Output → "MyST Notebook". Remove once the auto-run path is confirmed.
 *
 * Created eagerly via `initLog()` at activation so the channel always appears in the
 * Output dropdown, even before the first log line.
 */
let channel: vscode.OutputChannel | undefined;

export function initLog(context: vscode.ExtensionContext): void {
  if (!channel) {
    channel = vscode.window.createOutputChannel('MyST Notebook');
    context.subscriptions.push(channel);
    channel.appendLine('[init] MyST Notebook diagnostic channel ready');
  }
}

export function log(message: string): void {
  if (!channel) channel = vscode.window.createOutputChannel('MyST Notebook');
  channel.appendLine(message);
}
