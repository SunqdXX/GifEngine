import { describe, expect, it } from 'vitest';
import { newWidget, type Widget } from '../../src/main/config/schema';
import { chooseDesktopBackend, desktopItems, quickshellQml, windowsBottomScript } from '../../src/main/desktop-layer';

function widget(over: Partial<Widget>): Widget {
  return { ...newWidget('/m/a b#1.webp', 'image'), naturalWidth: 100, naturalHeight: 50, scale: 2, x: 10, y: 20, ...over };
}

describe('chooseDesktopBackend', () => {
  it('uses quickshell layer-shell on a Wayland session when qs is installed', () => {
    expect(chooseDesktopBackend({ platform: 'linux', env: { WAYLAND_DISPLAY: 'wayland-1' }, quickshell: '/usr/bin/qs' })).toEqual({
      kind: 'quickshell',
      qs: '/usr/bin/qs',
    });
  });

  it('reports why Desktop is unavailable on Wayland without quickshell', () => {
    const b = chooseDesktopBackend({ platform: 'linux', env: { XDG_SESSION_TYPE: 'wayland' }, quickshell: null });
    expect(b.kind).toBe('unsupported');
    expect(b.kind === 'unsupported' && b.reason).toMatch(/quickshell/);
  });

  it('uses desktop-type Electron windows on X11, macOS and Windows', () => {
    expect(chooseDesktopBackend({ platform: 'linux', env: { DISPLAY: ':0' }, quickshell: null }).kind).toBe('electron');
    expect(chooseDesktopBackend({ platform: 'darwin', env: {}, quickshell: null }).kind).toBe('electron');
    expect(chooseDesktopBackend({ platform: 'win32', env: {}, quickshell: null }).kind).toBe('electron');
  });
});

describe('desktopItems', () => {
  it('lists visible, placed desktop-layer widgets with file URLs and pixel bounds', () => {
    const w = widget({ layer: 'wallpaper', opacity: 0.5, flipH: true });
    expect(desktopItems([w], false, () => true)).toEqual([
      {
        id: w.id,
        url: 'file:///m/a%20b%231.webp',
        kind: 'image',
        x: 10,
        y: 20,
        width: 200,
        height: 100,
        opacity: 0.5,
        flipH: true,
        flipV: false,
      },
    ]);
  });

  it('skips on-top, hidden, missing and never-placed widgets', () => {
    const items = desktopItems(
      [
        widget({ layer: 'overFullscreen' }),
        widget({ layer: 'wallpaper', hidden: true }),
        widget({ layer: 'wallpaper', sourcePath: '/gone.webp' }),
        widget({ layer: 'wallpaper', naturalWidth: 0 }),
      ],
      false,
      (p) => p !== '/gone.webp',
    );
    expect(items).toEqual([]);
  });

  it('is empty in move mode, when every widget is a draggable top window', () => {
    expect(desktopItems([widget({ layer: 'wallpaper' })], true, () => true)).toEqual([]);
  });
});

describe('quickshellQml', () => {
  const qml = quickshellQml('/tmp/x/desktop.json', 4242);

  it('draws on the Bottom layer: above the wallpaper, below every window', () => {
    expect(qml).toContain('WlrLayershell.layer: WlrLayer.Bottom');
    expect(qml).toContain('mask: Region {}');
    expect(qml).toContain('exclusionMode: ExclusionMode.Ignore');
  });

  it('watches the JSON file and exits when GifEngine is gone', () => {
    expect(qml).toContain('path: "/tmp/x/desktop.json"');
    expect(qml).toContain('watchChanges: true');
    expect(qml).toContain('["kill", "-0", "4242"]');
  });
});

describe('windowsBottomScript', () => {
  it('sends the window to the bottom of the z-order without moving, sizing or activating it', () => {
    const s = windowsBottomScript(123456n);
    expect(s).toContain('SetWindowPos([IntPtr]123456, [IntPtr]1, 0, 0, 0, 0, 0x13)');
  });
});
