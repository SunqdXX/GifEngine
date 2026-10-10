import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { app: resolve('src/main/app.ts') } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { widget: resolve('src/preload/widget.ts'), launcher: resolve('src/preload/launcher.ts') },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    build: {
      rollupOptions: {
        input: {
          widget: resolve('src/renderer/widget/index.html'),
          launcher: resolve('src/renderer/launcher/index.html'),
        },
      },
    },
  },
});
