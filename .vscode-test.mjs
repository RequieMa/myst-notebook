import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out-test/**/*.test.js',
  workspaceFolder: 'test-fixtures/smoke-workspace',
  mocha: { timeout: 60000 },
});
