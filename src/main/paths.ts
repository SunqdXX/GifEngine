import { app } from 'electron';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { kindFromPath } from './media';

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

export function exampleSources(): string[] {
  const dirs = app.isPackaged
    ? [join(process.resourcesPath, 'examples')]
    : [join(app.getAppPath(), 'ExampleGifs'), join(app.getAppPath(), 'media', 'samples')];
  return dirs
    .filter((dir) => existsSync(dir))
    .flatMap((dir) => readdirSync(dir).map((name) => join(dir, name)))
    .filter((path) => kindFromPath(path) !== null)
    .sort();
}
