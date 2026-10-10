import { BrowserWindow, type WebContents } from 'electron';
import type { Page } from './paths';

export class Launcher {
  private win: BrowserWindow | null = null;
  private quitting = false;

  constructor(private readonly deps: { preloadPath: string; page: Page; iconPath: string }) {}

  get window(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null;
  }

  show(): void {
    const win = this.ensure();
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  isFrom(sender: WebContents): boolean {
    return this.window?.webContents.id === sender.id;
  }

  send(channel: string, payload: unknown): void {
    this.window?.webContents.send(channel, payload);
  }

  allowQuit(): void {
    this.quitting = true;
  }

  private ensure(): BrowserWindow {
    if (this.window) return this.window;
    const win = new BrowserWindow({
      width: 1040,
      height: 720,
      minWidth: 560,
      minHeight: 420,
      show: false,
      title: 'GifEngine',
      backgroundColor: '#0e0f13',
      autoHideMenuBar: true,
      icon: this.deps.iconPath,
      webPreferences: { preload: this.deps.preloadPath, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    win.on('close', (e) => {
      if (this.quitting) return;
      e.preventDefault();
      win.hide();
    });
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    if ('url' in this.deps.page) void win.loadURL(this.deps.page.url);
    else void win.loadFile(this.deps.page.file);
    this.win = win;
    return win;
  }
}
