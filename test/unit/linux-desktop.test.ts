import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appImageLauncherEntry, integrateAppImage } from '../../src/main/linux-desktop';

describe('appImageLauncherEntry', () => {
  const entry = appImageLauncherEntry('/home/u/Applications/Gif Engine.AppImage');

  it('is a launchable application entry with the GifEngine icon', () => {
    expect(entry).toContain('[Desktop Entry]\n');
    expect(entry).toContain('Type=Application\n');
    expect(entry).toContain('Name=GifEngine\n');
    expect(entry).toContain('Icon=gifengine\n');
    expect(entry).toContain('Terminal=false\n');
    expect(entry).toContain('Categories=Graphics;\n');
    expect(entry).toContain('StartupWMClass=gifengine\n');
  });

  it('runs the AppImage itself, quoted, and accepts files', () => {
    expect(entry).toContain('Exec="/home/u/Applications/Gif Engine.AppImage" %U\n');
  });
});

describe('integrateAppImage', () => {
  let home: string;
  let icon: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'gifengine-xdg-'));
    icon = join(home, 'source-icon.png');
    writeFileSync(icon, 'PNG-BYTES');
  });

  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const paths = () => ({
    entry: join(home, 'data', 'applications', 'gifengine.desktop'),
    icon: join(home, 'data', 'icons', 'hicolor', '512x512', 'apps', 'gifengine.png'),
  });

  it('adds the app menu entry and icon on first run', () => {
    const r = integrateAppImage({ appImage: '/a/GifEngine.AppImage', dataHome: join(home, 'data'), iconSource: icon, systemEntryDirs: [] });
    expect(r).toBe('installed');
    expect(readFileSync(paths().entry, 'utf8')).toContain('Exec="/a/GifEngine.AppImage" %U');
    expect(readFileSync(paths().icon, 'utf8')).toBe('PNG-BYTES');
  });

  it('does nothing when everything is already up to date', () => {
    const opts = { appImage: '/a/GifEngine.AppImage', dataHome: join(home, 'data'), iconSource: icon, systemEntryDirs: [] };
    integrateAppImage(opts);
    expect(integrateAppImage(opts)).toBe('unchanged');
  });

  it('follows the AppImage when it is moved', () => {
    integrateAppImage({ appImage: '/a/GifEngine.AppImage', dataHome: join(home, 'data'), iconSource: icon, systemEntryDirs: [] });
    const r = integrateAppImage({ appImage: '/b/GifEngine-new.AppImage', dataHome: join(home, 'data'), iconSource: icon, systemEntryDirs: [] });
    expect(r).toBe('installed');
    expect(readFileSync(paths().entry, 'utf8')).toContain('Exec="/b/GifEngine-new.AppImage" %U');
  });

  it('stays out of the way when a system package (.deb/.rpm) already provides the entry', () => {
    const system = join(home, 'usr-share-applications');
    mkdirSync(system);
    writeFileSync(join(system, 'gifengine.desktop'), '[Desktop Entry]');
    const r = integrateAppImage({ appImage: '/a/GifEngine.AppImage', dataHome: join(home, 'data'), iconSource: icon, systemEntryDirs: [system] });
    expect(r).toBe('skipped');
    expect(existsSync(paths().entry)).toBe(false);
  });
});
