import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/tests/extension/**/*.test.js',
});
