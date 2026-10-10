import { resolve } from 'node:path';

export const electronPath = require('electron') as string;
export const ROOT = resolve(__dirname, '../..');

export const PNG_40x20 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAYAAAD/Rn+7AAAAK0lEQVR42u3OsQ0AAAzCMP5/mj7BVDlSdqdpl2cdICAgICAgICAgIOBn4AEyc6uNOQ3vrgAAAABJRU5ErkJggg==',
  'base64',
);

export function testEnv(userData: string): Record<string, string> {
  const e: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) e[k] = v;
  delete e.WAYLAND_DISPLAY;
  delete e.HYPRLAND_INSTANCE_SIGNATURE;
  delete e.ELECTRON_RENDERER_URL;
  e.XDG_SESSION_TYPE = 'x11';
  e.GIFENGINE_TEST = '1';
  e.GIFENGINE_USER_DATA = userData;
  return e;
}
