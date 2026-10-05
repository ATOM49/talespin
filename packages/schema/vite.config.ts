import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      name: '@talespin/schema',
      fileName: 'index',
    },
    outDir: resolve(__dirname, 'dist'),
    rollupOptions: {
      external: ['zod'],
    },
  },
  resolve: { alias: { src: resolve('src/') } },
  plugins: [dts()],
});
