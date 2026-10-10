import { app, dialog, globalShortcut, ipcMain, Menu } from 'electron';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { IPC, LAUNCHER, type AppStatus, type Point, type WidgetPatch } from '../shared/ipc';
import { setLaunchAtStartup } from './autostart';
import { parseArgs, userArgv, type CliArgs } from './cli';
import { ConfigStore } from './config/store';
import { chooseDesktopBackend, findOnPath, QuickshellDesktop } from './desktop-layer';
import { registerToggleEditBind, unregisterToggleEditBind } from './hyprland';
import { Launcher } from './launcher';
import { integrateAppImage } from './linux-desktop';
import { needsX11Relaunch, relaunchCommand } from './linux-backend';
import { pageFor, preloadFor, resourcePath, selfCommand } from './paths';
import { handleMediaProtocol, registerMediaScheme } from './protocol';
import { createTray } from './tray';
import { WidgetManager, type DesktopMode } from './widget-manager';

const EDIT_SHORTCUT = 'CommandOrControl+Alt+G';
const SHORTCUT_LABEL = process.platform === 'darwin' ? '⌘⌥G' : 'Ctrl+Alt+G';
const MEDIA_EXTENSIONS = ['gif', 'webp', 'png', 'apng', 'jpg', 'jpeg', 'avif', 'webm', 'mp4', 'm4v', 'mov', 'mkv'];

interface SecondInstanceData {
  args: CliArgs;
  cwd: string;
}

const pendingOpenFiles: string[] = [];
let openFileSink: ((path: string) => void) | null = null;

function main(): void {
  const userData = process.env.GIFENGINE_USER_DATA;
  if (userData) app.setPath('userData', userData);

  const args = parseArgs(userArgv(process.argv, app.isPackaged));
  const wantWayland = args.wayland || process.env.GIFENGINE_WAYLAND === '1';

  const lockData: SecondInstanceData = { args, cwd: process.cwd() };
  if (!app.requestSingleInstanceLock(lockData)) {
    app.quit();
    return;
  }

  if (needsX11Relaunch({ platform: process.platform, argv: process.argv, env: process.env, wantWayland })) {
    app.releaseSingleInstanceLock();
    const cmd = relaunchCommand(process.execPath, process.argv, process.env);
    spawn(cmd.command, cmd.args, { detached: true, stdio: 'inherit' }).unref();
    app.exit(0);
    return;
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => app.quit());
  app.on('open-file', (e, path) => {
    e.preventDefault();
    if (openFileSink) openFileSink(path);
    else pendingOpenFiles.push(path);
  });

  registerMediaScheme();
  app
    .whenReady()
    .then(() => start(args))
    .catch((err: unknown) => {
      console.error('[gifengine] startup failed:', err);
      app.exit(1);
    });
}

function start(args: CliArgs): void {
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  addToAppMenu();

  const store = new ConfigStore(join(app.getPath('userData'), 'config.json'));
  const backend = chooseDesktopBackend({
    platform: process.platform,
    env: process.env,
    quickshell: findOnPath(['qs', 'quickshell'], process.env),
  });
  const desktop: DesktopMode =
    backend.kind === 'quickshell'
      ? {
          kind: 'quickshell',
          layer: new QuickshellDesktop(backend.qs, join(app.getPath('userData'), 'desktop-layer'), (line) => {
            if (!app.isPackaged) console.log(`[desktop-layer] ${line}`);
          }),
        }
      : backend;
  console.log(`[gifengine] desktop level: ${backend.kind}`);
  const manager = new WidgetManager(store, { preloadPath: preloadFor('widget'), page: pageFor('widget') }, desktop);
  handleMediaProtocol((id) => manager.mediaPath(id));
  const launcher = new Launcher({ preloadPath: preloadFor('launcher'), page: pageFor('launcher'), iconPath: resourcePath('icon.png') });

  const status = (): AppStatus => ({
    editing: manager.isEditing,
    launchAtStartup: manager.settings.launchAtStartup,
    shortcut: SHORTCUT_LABEL,
    platform: process.platform,
    desktop: manager.desktopStatus(),
  });

  const tray = createTray(resourcePath('tray.png'), {
    openLauncher: () => launcher.show(),
    toggleEdit: () => manager.toggleEditing(),
    setAllHidden: (hidden) => manager.setAllHidden(hidden),
    quit: () => app.quit(),
    isEditing: () => manager.isEditing,
    shortcut: SHORTCUT_LABEL,
  });

  manager.on('changed', () => launcher.send(LAUNCHER.changed, manager.items()));
  manager.on('editing', () => {
    launcher.send(LAUNCHER.statusChanged, status());
    tray?.refresh();
  });

  wireWidgetIpc(manager);

  const handle = (channel: string, fn: (...args: unknown[]) => unknown) =>
    ipcMain.handle(channel, (e, ...a) => (launcher.isFrom(e.sender) ? fn(...a) : undefined));

  handle(LAUNCHER.list, () => manager.items());
  handle(LAUNCHER.addViaDialog, async () => {
    const opts: Electron.OpenDialogOptions = {
      title: 'Add media',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Animations, images & videos', extensions: MEDIA_EXTENSIONS },
        { name: 'All files', extensions: ['*'] },
      ],
    };
    const parent = launcher.window;
    const result = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
    if (!result.canceled) manager.add(result.filePaths);
  });
  handle(LAUNCHER.addPaths, (paths) => {
    if (Array.isArray(paths)) manager.add(paths.filter((p): p is string => typeof p === 'string' && p.length > 0));
  });
  handle(LAUNCHER.update, (id, patch) => {
    if (typeof id === 'string' && patch !== null && typeof patch === 'object') manager.update(id, patch as WidgetPatch);
  });
  handle(LAUNCHER.remove, (id) => {
    if (typeof id === 'string') manager.remove(id);
  });
  handle(LAUNCHER.setAllHidden, (hidden) => {
    if (typeof hidden === 'boolean') manager.setAllHidden(hidden);
  });
  handle(LAUNCHER.status, () => status());
  handle(LAUNCHER.toggleEdit, () => manager.toggleEditing());
  handle(LAUNCHER.setLaunchAtStartup, (enabled) => {
    if (typeof enabled !== 'boolean') return;
    try {
      setLaunchAtStartup(enabled, selfCommand());
      manager.setLaunchAtStartup(enabled);
    } catch (err) {
      console.warn('[gifengine] could not change launch at startup:', err);
    }
    launcher.send(LAUNCHER.statusChanged, status());
  });
  handle(LAUNCHER.quit, () => app.quit());

  if (!globalShortcut.register(EDIT_SHORTCUT, () => manager.toggleEditing())) {
    console.warn(`[gifengine] could not register ${EDIT_SHORTCUT}; use "gifengine --toggle-edit" instead`);
  }
  registerHyprlandBind();

  app.on('second-instance', (_e, _argv, cwd, data) => {
    const d = data as Partial<SecondInstanceData> | undefined;
    const a = d?.args;
    if (a?.toggleEdit) return manager.toggleEditing();
    if (a?.files?.length) manager.add(a.files.map((f) => resolve(d?.cwd ?? cwd, f)));
    else if (!a?.background) launcher.show();
  });
  openFileSink = (path) => manager.add([path]);
  app.on('activate', () => launcher.show());
  app.on('window-all-closed', () => undefined);
  app.on('before-quit', () => {
    launcher.allowQuit();
    manager.flush();
    manager.shutdown();
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());

  manager.restore();
  const startupFiles = [...args.files.map((f) => resolve(f)), ...pendingOpenFiles.splice(0)];
  if (startupFiles.length) manager.add(startupFiles);
  if (!args.background) launcher.show();

  if (process.env.GIFENGINE_TEST === '1') {
    (globalThis as Record<string, unknown>).__gifengine = {
      toggleEdit: () => manager.toggleEditing(),
      widgets: () => manager.debugWindows(),
      errors: () => manager.errors(),
      items: () => manager.items(),
      add: (paths: string[]) => manager.add(paths),
      update: (id: string, patch: WidgetPatch) => manager.update(id, patch),
      flush: () => manager.flush(),
    };
  }
}

function addToAppMenu(): void {
  const appImage = process.env.APPIMAGE;
  if (process.platform !== 'linux' || !appImage) return;
  const dataHome = process.env.XDG_DATA_HOME || join(app.getPath('home'), '.local', 'share');
  const systemEntryDirs = (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share')
    .split(':')
    .filter((d) => d && resolve(d) !== resolve(dataHome))
    .map((d) => join(d, 'applications'));
  try {
    const result = integrateAppImage({ appImage, dataHome, iconSource: resourcePath('icon.png'), systemEntryDirs });
    if (result === 'installed') console.log('[gifengine] added GifEngine to the app menu');
  } catch (err) {
    console.warn('[gifengine] could not add GifEngine to the app menu:', err);
  }
}

function wireWidgetIpc(manager: WidgetManager): void {
  const point = (x: unknown, y: unknown): Point | null =>
    Number.isFinite(x) && Number.isFinite(y) ? { x: x as number, y: y as number } : null;

  ipcMain.on(IPC.naturalSize, (e, w: unknown, h: unknown) => {
    const size = point(w, h);
    if (size && size.x > 0 && size.y > 0) manager.handleNaturalSize(e.sender.id, size.x, size.y);
  });
  ipcMain.on(IPC.mediaError, (e, message: unknown) => manager.handleMediaError(e.sender.id, String(message)));
  ipcMain.on(IPC.dragStart, (e, x: unknown, y: unknown) => {
    const p = point(x, y);
    if (p) manager.handleDragStart(e.sender.id, p);
  });
  ipcMain.on(IPC.dragMove, (e, x: unknown, y: unknown) => {
    const p = point(x, y);
    if (p) manager.handleDragMove(e.sender.id, p);
  });
  ipcMain.on(IPC.dragEnd, (e) => manager.handleDragEnd(e.sender.id));
  ipcMain.on(IPC.wheelResize, (e, direction: unknown) => {
    if (direction === 1 || direction === -1) manager.handleWheel(e.sender.id, direction);
  });
}

function registerHyprlandBind(): void {
  let bound = false;
  let unbinding = false;
  registerToggleEditBind(selfCommand())
    .then((ok) => {
      bound = ok;
      if (ok) console.log('[gifengine] Hyprland bind CTRL+ALT+G → toggle edit mode registered');
      else if (process.env.HYPRLAND_INSTANCE_SIGNATURE) console.warn('[gifengine] CTRL+ALT+G is already bound in Hyprland; not overriding it');
    })
    .catch((err: unknown) => console.warn('[gifengine] could not register the Hyprland bind:', err));
  app.on('before-quit', (e) => {
    if (!bound || unbinding) return;
    e.preventDefault();
    unbinding = true;
    unregisterToggleEditBind()
      .catch(() => undefined)
      .finally(() => {
        bound = false;
        app.quit();
      });
  });
}

main();
