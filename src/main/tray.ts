import { Menu, nativeImage, Tray } from 'electron';

export interface TrayActions {
  openLauncher(): void;
  toggleEdit(): void;
  setAllHidden(hidden: boolean): void;
  quit(): void;
  isEditing(): boolean;
  shortcut: string;
}

export function createTray(iconPath: string, actions: TrayActions): { refresh(): void } | null {
  try {
    const size = process.platform === 'darwin' ? 18 : 22;
    const tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: size, height: size }));
    tray.setToolTip('GifEngine');
    const build = () =>
      Menu.buildFromTemplate([
        { label: 'Open GifEngine', click: () => actions.openLauncher() },
        { type: 'separator' },
        { label: `Move mode (${actions.shortcut})`, type: 'checkbox', checked: actions.isEditing(), click: () => actions.toggleEdit() },
        { label: 'Show all widgets', click: () => actions.setAllHidden(false) },
        { label: 'Hide all widgets', click: () => actions.setAllHidden(true) },
        { type: 'separator' },
        { label: 'Quit GifEngine', click: () => actions.quit() },
      ]);
    tray.setContextMenu(build());
    tray.on('click', () => actions.openLauncher());
    return { refresh: () => tray.setContextMenu(build()) };
  } catch (err) {
    console.warn('[gifengine] tray unavailable:', err);
    return null;
  }
}
