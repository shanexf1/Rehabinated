import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' makes the build work from any sub-path (e.g. GitHub Pages at /rehabinated/).
export default defineConfig({
  base: './',
  plugins: [react()],
  optimizeDeps: { exclude: ['onnxruntime-web', 'onnxruntime-web/wasm'] },
  test: { include: ['tests/**/*.test.ts'] },
});
