import { describe, expect, it } from 'vitest';
import { parseArgs, userArgv } from '../../src/main/cli';

describe('userArgv', () => {
  it('drops only the executable when packaged', () => {
    expect(userArgv(['/opt/GifEngine/gifengine', 'a.webp'], true)).toEqual(['a.webp']);
  });

  it('drops the executable and the app entry when unpackaged (electron-vite shape)', () => {
    expect(userArgv(['/x/electron', '.', '--ozone-platform=x11', '/m/a.webp'], false)).toEqual([
      '--ozone-platform=x11',
      '/m/a.webp',
    ]);
  });

  it('finds the app entry after leading switches (Playwright shape)', () => {
    expect(
      userArgv(['/x/electron', '--remote-debugging-port=0', '/repo', '--ozone-platform=x11', 'a.png'], false),
    ).toEqual(['--remote-debugging-port=0', '--ozone-platform=x11', 'a.png']);
  });

  it('returns nothing when only the executable is present', () => {
    expect(userArgv(['/x/electron'], false)).toEqual([]);
  });
});

describe('parseArgs', () => {
  it('collects bare arguments as files and skips foreign switches', () => {
    expect(parseArgs(['--ozone-platform=x11', 'a.webp', 'b c.webm', '-psn_0_12345'])).toEqual({
      files: ['a.webp', 'b c.webm'],
      toggleEdit: false,
      wayland: false,
      panel: false,
      background: false,
    });
  });

  it('recognises its own flags', () => {
    expect(parseArgs(['--toggle-edit', '--wayland', '--panel'])).toMatchObject({
      files: [],
      toggleEdit: true,
      wayland: true,
      panel: true,
    });
  });

  it('takes the value after --add as a file, even if it looks like a switch-free name', () => {
    expect(parseArgs(['--add', 'x.gif', 'y.png']).files).toEqual(['x.gif', 'y.png']);
  });

  it('ignores a trailing --add without a value', () => {
    expect(parseArgs(['a.png', '--add']).files).toEqual(['a.png']);
  });
});

describe('parseArgs --background', () => {
  it('starts without opening the launcher when asked', () => {
    expect(parseArgs(['--background']).background).toBe(true);
    expect(parseArgs([]).background).toBe(false);
  });
});
