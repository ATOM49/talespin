import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      name: '@talespin/game-engine',
      fileName: 'index',
    },
    outDir: resolve(__dirname, 'dist'),
    rollupOptions: { external: ['@talespin/schema'] },
  },
  plugins: [dts()],
});
