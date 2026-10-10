import { app } from 'electron';
import { join } from 'node:path';

export type Page = { url: string } | { file: string };

export function pageFor(name: 'widget' | 'launcher'): Page {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) return { url: `${devUrl}/${name}/index.html` };
  return { file: join(__dirname, `../renderer/${name}/index.html`) };
}

export function preloadFor(name: 'widget' | 'launcher'): string {
  return join(__dirname, `../preload/${name}.js`);
}

export function resourcePath(file: string): string {
  return app.isPackaged ? join(process.resourcesPath, 'resources', file) : join(app.getAppPath(), 'resources', file);
}

export function selfCommand(): string[] {
  if (app.isPackaged) return [process.env.APPIMAGE || process.execPath];
  return [process.execPath, app.getAppPath()];
}
