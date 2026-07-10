import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'src/__stubs__/vscode.ts'),
    },
  },
  test: { include: ['src/**/*.test.ts'], exclude: ['src/test/**', 'node_modules/**'], environment: 'node' },
});
