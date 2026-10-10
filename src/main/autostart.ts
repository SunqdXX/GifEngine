import { app } from 'electron';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function quoteExecArg(arg: string): string {
  const quoted = arg.replace(/(["`$\\])/g, '\\$1');
  return `"${quoted.replace(/\\/g, '\\\\')}"`;
}

export function desktopEntry(command: readonly string[]): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=GifEngine',
    'Comment=Animated desktop overlay widgets',
    `Exec=${command.map(quoteExecArg).join(' ')} --background`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

export function setLaunchAtStartup(enabled: boolean, command: readonly string[]): void {
  if (process.platform === 'linux') {
    const dir = join(app.getPath('appData'), 'autostart');
    const file = join(dir, 'gifengine.desktop');
    if (enabled) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, desktopEntry(command));
    } else {
      rmSync(file, { force: true });
    }
    return;
  }
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--background'] });
}
