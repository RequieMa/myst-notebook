import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

function extensionId(): string {
  // The smoke workspace is test-fixtures/smoke-workspace; the extension manifest
  // is two levels up. Derive the id from publisher+name so this test tracks the
  // publisher rename that happens as a documented pre-publish step.
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'no workspace folder');
  const manifestPath = path.join(folder!.uri.fsPath, '..', '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return `${pkg.publisher}.${pkg.name}`;
}

suite('MyST Notebook smoke', () => {
  test('extension activates', async () => {
    const ext = vscode.extensions.getExtension(extensionId());
    assert.ok(ext, `extension not found: ${extensionId()}`);
    await ext!.activate();
    assert.strictEqual(ext!.isActive, true);
  });

  test('openWith opens the myst-notebook editor and serializes cells', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'no workspace folder');
    const uri = vscode.Uri.joinPath(folder!.uri, 'chapter.md');
    const doc = await vscode.workspace.openNotebookDocument(uri);
    assert.strictEqual(doc.notebookType, 'myst-notebook');
    // "# Chapter One" heading + two prose paragraphs -> at least 2 cells.
    assert.ok(doc.getCells().length >= 2, `expected >=2 cells, got ${doc.getCells().length}`);
  });
});
