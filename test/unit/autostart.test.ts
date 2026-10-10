import { describe, expect, it } from 'vitest';
import { desktopEntry } from '../../src/main/autostart';

describe('desktopEntry', () => {
  it('starts the app in the background on login', () => {
    const entry = desktopEntry(['/home/u/Apps/GifEngine.AppImage']);
    expect(entry).toContain('[Desktop Entry]');
    expect(entry).toContain('Type=Application');
    expect(entry).toContain('Name=GifEngine');
    expect(entry).toContain('Exec="/home/u/Apps/GifEngine.AppImage" --background\n');
  });

  it('escapes reserved characters with the spec unambiguous double-escaped forms', () => {
    expect(desktopEntry(['/opt/Gif "Engine"/run$1`x\\y'])).toContain(
      'Exec="/opt/Gif \\\\"Engine\\\\"/run\\\\$1\\\\`x\\\\\\\\y" --background',
    );
  });

  it('quotes every argument (dev mode: electron binary + app dir)', () => {
    expect(desktopEntry(['/x/electron', '/home/u/GifEngine'])).toContain('Exec="/x/electron" "/home/u/GifEngine" --background');
  });
});
