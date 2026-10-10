import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { quoteExecArg } from './autostart';

const ENTRY_NAME = 'gifengine.desktop';

export function appImageLauncherEntry(appImage: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=GifEngine',
    'GenericName=Desktop widgets',
    'Comment=Animated GIF and video widgets on your desktop',
    `Exec=${quoteExecArg(appImage)} %U`,
    'Icon=gifengine',
    'Terminal=false',
    'Categories=Graphics;',
    'Keywords=gif;webp;overlay;widget;desktop;',
    'StartupWMClass=gifengine',
    '',
  ].join('\n');
}

export interface IntegrationOptions {
  appImage: string;
  dataHome: string;
  iconSource: string;
  systemEntryDirs: readonly string[];
}

export function integrateAppImage(o: IntegrationOptions): 'installed' | 'unchanged' | 'skipped' {
  if (o.systemEntryDirs.some((dir) => existsSync(join(dir, ENTRY_NAME)))) return 'skipped';

  const entryPath = join(o.dataHome, 'applications', ENTRY_NAME);
  const iconPath = join(o.dataHome, 'icons', 'hicolor', '512x512', 'apps', 'gifengine.png');
  const entry = appImageLauncherEntry(o.appImage);
  let changed = false;

  if (!existsSync(entryPath) || readFileSync(entryPath, 'utf8') !== entry) {
    mkdirSync(join(o.dataHome, 'applications'), { recursive: true });
    writeFileSync(entryPath, entry);
    changed = true;
  }
  if (!existsSync(iconPath) || !readFileSync(iconPath).equals(readFileSync(o.iconSource))) {
    mkdirSync(join(o.dataHome, 'icons', 'hicolor', '512x512', 'apps'), { recursive: true });
    copyFileSync(o.iconSource, iconPath);
    changed = true;
  }
  return changed ? 'installed' : 'unchanged';
}
