import { describe, expect, it } from 'vitest';
import { needsX11Relaunch, relaunchCommand } from '../../src/main/linux-backend';

const waylandEnv = { WAYLAND_DISPLAY: 'wayland-1', DISPLAY: ':0' };
const base = { platform: 'linux' as NodeJS.Platform, argv: ['/opt/g/gifengine', 'a.webp'], env: waylandEnv, wantWayland: false };

describe('needsX11Relaunch', () => {
  it('relaunches on a Wayland session with XWayland available', () => {
    expect(needsX11Relaunch(base)).toBe(true);
  });

  it('detects Wayland from XDG_SESSION_TYPE alone', () => {
    expect(needsX11Relaunch({ ...base, env: { XDG_SESSION_TYPE: 'wayland', DISPLAY: ':0' } })).toBe(true);
  });

  it('never relaunches off Linux', () => {
    expect(needsX11Relaunch({ ...base, platform: 'win32' })).toBe(false);
    expect(needsX11Relaunch({ ...base, platform: 'darwin' })).toBe(false);
  });

  it('respects an explicit native-Wayland request', () => {
    expect(needsX11Relaunch({ ...base, wantWayland: true })).toBe(false);
  });

  it('respects any ozone switch already on the command line', () => {
    expect(needsX11Relaunch({ ...base, argv: [...base.argv, '--ozone-platform=x11'] })).toBe(false);
    expect(needsX11Relaunch({ ...base, argv: [...base.argv, '--ozone-platform=wayland'] })).toBe(false);
  });

  it('does nothing on an X11 session', () => {
    expect(needsX11Relaunch({ ...base, env: { DISPLAY: ':0', XDG_SESSION_TYPE: 'x11' } })).toBe(false);
  });

  it('stays on Wayland when XWayland is unavailable', () => {
    expect(needsX11Relaunch({ ...base, env: { WAYLAND_DISPLAY: 'wayland-1' } })).toBe(false);
  });
});

describe('relaunchCommand', () => {
  it('re-runs the executable with the x11 flag appended', () => {
    expect(relaunchCommand('/opt/g/gifengine', ['/opt/g/gifengine', 'a.webp'], {})).toEqual({
      command: '/opt/g/gifengine',
      args: ['a.webp', '--ozone-platform=x11'],
    });
  });

  it('re-runs the AppImage itself, not the binary inside its mount', () => {
    expect(
      relaunchCommand('/tmp/.mount_GifEngABC/gifengine', ['/tmp/.mount_GifEngABC/gifengine'], {
        APPIMAGE: '/home/u/GifEngine.AppImage',
      }),
    ).toEqual({ command: '/home/u/GifEngine.AppImage', args: ['--ozone-platform=x11'] });
  });
});
