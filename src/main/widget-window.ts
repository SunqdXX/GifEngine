import { app, BrowserWindow } from 'electron';
import { IPC, type Point, type WidgetRenderState } from '../shared/ipc';
import { dragPosition, type Rect } from './geometry';
import { sendToBottomWin32 } from './desktop-layer';
import { makeOverlay, setEditMode } from './hyprland';

export interface WidgetWindowDeps {
  preloadPath: string;
  page: { url: string } | { file: string };
}

export type WindowMode = 'top' | 'desktop';

export interface WidgetDebugState {
  id: string;
  mode: WindowMode;
  alwaysOnTop: boolean;
  title: string;
  editing: boolean;
  ignoreMouse: boolean;
  visible: boolean;
  bounds: Rect;
}

export class WidgetWindow {
  readonly win: BrowserWindow;
  readonly webContentsId: number;
  private state: WidgetRenderState;
  private interactive = false;
  private shown = false;
  private drag: { bounds: Rect; pointer: Point } | null = null;
  private hyprAddress: string | null = null;

  constructor(
    initial: WidgetRenderState,
    deps: WidgetWindowDeps,
    bounds: Rect,
    readonly mode: WindowMode = 'top',
  ) {
    this.state = initial;
    this.win = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      resizable: false,
      title: `gifengine-${initial.id}`,
      ...(mode === 'desktop' && process.platform !== 'win32' ? { type: 'desktop' } : {}),
      webPreferences: { preload: deps.preloadPath, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    this.webContentsId = this.win.webContents.id;
    this.win.on('page-title-updated', (e) => e.preventDefault());
    if (mode === 'top') this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setIgnoreMouseEvents(true);
    this.win.webContents.on('did-finish-load', () => this.send());
    if (!app.isPackaged) {
      this.win.webContents.on('console-message', (e) => console.log(`[widget ${initial.id.slice(0, 8)}] ${e.message}`));
    }
    if ('url' in deps.page) void this.win.loadURL(deps.page.url);
    else void this.win.loadFile(deps.page.file);
  }

  get id(): string {
    return this.state.id;
  }

  get isShown(): boolean {
    return this.shown;
  }

  get isInteractive(): boolean {
    return this.interactive;
  }

  render(state: WidgetRenderState): void {
    this.state = state;
    this.setInteractive(state.editing && !state.locked);
    this.send();
  }

  place(bounds: Rect): void {
    if (this.win.isDestroyed()) return;
    this.win.setBounds(bounds);
    if (this.shown) return;
    this.shown = true;
    this.win.showInactive();
    if (this.mode === 'desktop') {
      if (process.platform === 'win32') sendToBottomWin32(this.win.getNativeWindowHandle());
      return;
    }
    makeOverlay(this.win.getTitle(), bounds)
      .then((address) => {
        if (!address) return;
        this.hyprAddress = address;
        if (this.interactive) return setEditMode(address, true);
      })
      .catch((err: unknown) => console.warn(`[gifengine] widget ${this.id}: Hyprland overlay failed:`, err));
  }

  dragStart(pointer: Point): void {
    if (this.interactive) this.drag = { bounds: this.win.getBounds(), pointer };
  }

  dragMove(pointer: Point): void {
    if (!this.drag || this.win.isDestroyed()) return;
    const p = dragPosition(this.drag.bounds, this.drag.pointer, pointer);
    this.win.setPosition(p.x, p.y);
  }

  dragEnd(): Point | null {
    if (!this.drag) return null;
    this.drag = null;
    const b = this.win.getBounds();
    return { x: b.x, y: b.y };
  }

  close(): void {
    if (!this.win.isDestroyed()) this.win.destroy();
  }

  debugState(): WidgetDebugState {
    return {
      id: this.id,
      mode: this.mode,
      alwaysOnTop: this.win.isAlwaysOnTop(),
      title: this.win.getTitle(),
      editing: this.state.editing,
      ignoreMouse: !this.interactive,
      visible: this.win.isVisible(),
      bounds: this.win.getBounds(),
    };
  }

  private setInteractive(on: boolean): void {
    if (on === this.interactive || this.win.isDestroyed()) return;
    this.interactive = on;
    if (!on) this.drag = null;
    this.win.setIgnoreMouseEvents(!on);
    if (process.platform !== 'linux') this.win.setFocusable(on);
    if (this.hyprAddress) {
      setEditMode(this.hyprAddress, on).catch((err: unknown) =>
        console.warn(`[gifengine] widget ${this.id}: Hyprland edit-mode switch failed:`, err),
      );
    }
  }

  private send(): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(IPC.widgetState, this.state);
  }
}
