import { screen } from 'electron';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { z } from 'zod';
import type { LibraryItem, Point, WidgetPatch, WidgetRenderState } from '../shared/ipc';
import { newWidget, type Config, type Widget } from './config/schema';
import type { ConfigStore } from './config/store';
import { desktopItems, type QuickshellDesktop } from './desktop-layer';
import { clampScale, ensureVisible, fitScale, initialBounds, scaleAroundCenter, type Rect } from './geometry';
import { kindFromPath } from './media';
import { mediaUrl } from './protocol';
import { WidgetWindow, type WidgetDebugState, type WidgetWindowDeps, type WindowMode } from './widget-window';

export type DesktopMode =
  | { kind: 'quickshell'; layer: QuickshellDesktop }
  | { kind: 'electron' }
  | { kind: 'unsupported'; reason: string };

const PatchSchema = z
  .object({
    hidden: z.boolean(),
    locked: z.boolean(),
    scale: z.number().positive().finite(),
    opacity: z.number().finite(),
    flipH: z.boolean(),
    flipV: z.boolean(),
    layer: z.enum(['overFullscreen', 'wallpaper']),
  })
  .partial()
  .strict();

const WHEEL_STEP = 1.1;
const INITIAL_FRACTION = 0.4;

export class WidgetManager extends EventEmitter {
  private readonly config: Config;
  private readonly windows = new Map<string, WidgetWindow>();
  private readonly byWebContents = new Map<number, string>();
  private readonly mediaErrors: string[] = [];
  private editing = false;
  private cascade = 0;

  constructor(
    private readonly store: ConfigStore,
    private readonly deps: WidgetWindowDeps,
    private readonly desktop: DesktopMode = { kind: 'electron' },
  ) {
    super();
    this.config = store.load();
    if (store.lastLoadIssue) console.warn(`[gifengine] ${store.lastLoadIssue}`);
  }

  get settings(): Config['settings'] {
    return this.config.settings;
  }

  get isEditing(): boolean {
    return this.editing;
  }

  desktopStatus(): { available: boolean; reason: string | null } {
    return this.desktop.kind === 'unsupported' ? { available: false, reason: this.desktop.reason } : { available: true, reason: null };
  }

  mediaPath(id: string): string | undefined {
    const w = this.find(id);
    return w ? (w.playPath ?? w.sourcePath) : undefined;
  }

  items(): LibraryItem[] {
    return this.config.widgets.map((w) => ({
      id: w.id,
      name: basename(w.sourcePath),
      sourcePath: w.sourcePath,
      kind: w.kind,
      mediaUrl: mediaUrl(w.id),
      hidden: w.hidden,
      missing: !existsSync(w.playPath ?? w.sourcePath),
      locked: w.locked,
      scale: w.scale,
      opacity: w.opacity,
      flipH: w.flipH,
      flipV: w.flipV,
      layer: w.layer === 'wallpaper' ? 'wallpaper' : 'overFullscreen',
      naturalWidth: w.naturalWidth,
      naturalHeight: w.naturalHeight,
    }));
  }

  restore(): void {
    for (const w of this.config.widgets) this.reconcile(w);
    this.syncDesktop();
  }

  add(paths: readonly string[]): { rejected: string[] } {
    const rejected: string[] = [];
    for (const path of paths) {
      const kind = kindFromPath(path);
      if (!kind) {
        rejected.push(path);
        console.error(`[gifengine] unsupported file type, skipped: ${path}`);
        continue;
      }
      const existing = this.config.widgets.find((w) => w.sourcePath === path);
      if (existing) {
        existing.hidden = false;
        this.reconcile(existing);
        continue;
      }
      const widget = newWidget(path, kind);
      this.config.widgets.push(widget);
      this.reconcile(widget);
    }
    this.commit();
    return { rejected };
  }

  update(id: string, rawPatch: WidgetPatch): void {
    const widget = this.find(id);
    const parsed = PatchSchema.safeParse(rawPatch);
    if (!widget || !parsed.success) return;
    const patch = parsed.data;

    if (patch.locked !== undefined) widget.locked = patch.locked;
    if (patch.flipH !== undefined) widget.flipH = patch.flipH;
    if (patch.flipV !== undefined) widget.flipV = patch.flipV;
    if (patch.opacity !== undefined) widget.opacity = Math.min(1, Math.max(0.05, patch.opacity));
    if (patch.scale !== undefined && widget.naturalWidth > 0) this.rescale(widget, patch.scale);
    if (patch.hidden !== undefined) widget.hidden = patch.hidden;
    if (patch.layer !== undefined) widget.layer = patch.layer;
    this.reconcile(widget);
    this.rerender(widget);
    this.commit();
  }

  remove(id: string): void {
    this.close(id);
    this.config.widgets = this.config.widgets.filter((w) => w.id !== id);
    this.commit();
  }

  setAllHidden(hidden: boolean): void {
    for (const w of this.config.widgets) {
      w.hidden = hidden;
      this.reconcile(w);
    }
    this.commit();
  }

  setEditing(on: boolean): void {
    if (on === this.editing) return;
    this.editing = on;
    console.log(`[gifengine] edit mode ${on ? 'ON' : 'OFF'}`);
    this.syncDesktop();
    for (const w of this.config.widgets) {
      this.reconcile(w);
      this.rerender(w);
    }
    if (!on) this.store.flush();
    this.emit('editing', on);
  }

  toggleEditing(): void {
    this.setEditing(!this.editing);
  }

  setLaunchAtStartup(enabled: boolean): void {
    this.config.settings.launchAtStartup = enabled;
    this.commit();
  }

  flush(): void {
    this.store.flush();
  }

  shutdown(): void {
    if (this.desktop.kind === 'quickshell') this.desktop.layer.stop();
  }

  handleNaturalSize(webContentsId: number, width: number, height: number): void {
    const { widget, win } = this.lookup(webContentsId);
    if (!widget || !win) return;
    if (widget.naturalWidth === 0) {
      const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
      const natural = { width, height };
      const b = initialBounds(natural, area, INITIAL_FRACTION, this.cascade++ % 8);
      Object.assign(widget, { naturalWidth: width, naturalHeight: height, scale: fitScale(natural, area, INITIAL_FRACTION), x: b.x, y: b.y });
      console.log(`[gifengine] widget ${widget.id} (${width}x${height}) placed at ${b.x},${b.y} ${b.width}x${b.height}`);
    } else if (widget.naturalWidth !== width || widget.naturalHeight !== height) {
      widget.scale = (widget.naturalWidth * widget.scale) / width;
      widget.naturalWidth = width;
      widget.naturalHeight = height;
    }
    const visible = ensureVisible(this.boundsOf(widget), this.displayRects());
    widget.x = visible.x;
    widget.y = visible.y;
    win.place(visible);
    this.reconcile(widget);
    this.commit();
  }

  handleMediaError(webContentsId: number, message: string): void {
    const id = this.byWebContents.get(webContentsId) ?? 'unknown widget';
    const text = `${id}: ${message}`;
    this.mediaErrors.push(text);
    console.error(`[gifengine] media error: ${text}`);
  }

  handleDragStart(webContentsId: number, p: Point): void {
    this.lookup(webContentsId).win?.dragStart(p);
  }

  handleDragMove(webContentsId: number, p: Point): void {
    this.lookup(webContentsId).win?.dragMove(p);
  }

  handleDragEnd(webContentsId: number): void {
    const { widget, win } = this.lookup(webContentsId);
    const pos = win?.dragEnd();
    if (!widget || !pos) return;
    widget.x = pos.x;
    widget.y = pos.y;
    this.commit();
  }

  handleWheel(webContentsId: number, direction: 1 | -1): void {
    const { widget, win } = this.lookup(webContentsId);
    if (!widget || !win?.isInteractive || widget.naturalWidth === 0) return;
    this.rescale(widget, widget.scale * (direction > 0 ? WHEEL_STEP : 1 / WHEEL_STEP));
    this.commit();
  }

  debugWindows(): WidgetDebugState[] {
    return [...this.windows.values()].map((w) => w.debugState());
  }

  errors(): string[] {
    return [...this.mediaErrors];
  }

  private find(id: string): Widget | undefined {
    return this.config.widgets.find((w) => w.id === id);
  }

  private lookup(webContentsId: number): { widget?: Widget; win?: WidgetWindow } {
    const id = this.byWebContents.get(webContentsId);
    return id ? { widget: this.find(id), win: this.windows.get(id) } : {};
  }

  private boundsOf(w: Widget): Rect {
    return {
      x: Math.round(w.x),
      y: Math.round(w.y),
      width: Math.max(1, Math.round(w.naturalWidth * w.scale)),
      height: Math.max(1, Math.round(w.naturalHeight * w.scale)),
    };
  }

  private displayRects(): Rect[] {
    const primary = screen.getPrimaryDisplay();
    const others = screen.getAllDisplays().filter((d) => d.id !== primary.id);
    return [primary, ...others].map((d) => d.workArea);
  }

  private rescale(widget: Widget, requested: number): void {
    const maxSide = Math.max(...screen.getAllDisplays().map((d) => Math.max(d.size.width, d.size.height)));
    const scale = clampScale(requested, { width: widget.naturalWidth, height: widget.naturalHeight }, maxSide);
    const scaled = scaleAroundCenter(this.boundsOf(widget), scale / widget.scale);
    widget.scale = scale;
    widget.x = scaled.x;
    widget.y = scaled.y;
    const win = this.windows.get(widget.id);
    if (win?.isShown) win.place(this.boundsOf(widget));
  }

  private renderState(w: Widget): WidgetRenderState {
    return {
      id: w.id,
      kind: w.kind,
      src: mediaUrl(w.id),
      editing: this.editing,
      locked: w.locked,
      opacity: w.opacity,
      flipH: w.flipH,
      flipV: w.flipV,
    };
  }

  private rerender(w: Widget): void {
    this.windows.get(w.id)?.render(this.renderState(w));
  }

  private windowModeFor(w: Widget): WindowMode | null {
    if (w.hidden || !existsSync(w.playPath ?? w.sourcePath)) return null;
    if (w.layer === 'wallpaper' && !this.editing && w.naturalWidth > 0) {
      if (this.desktop.kind === 'quickshell') return null;
      if (this.desktop.kind === 'electron') return 'desktop';
    }
    return 'top';
  }

  private reconcile(widget: Widget): void {
    const want = this.windowModeFor(widget);
    const current = this.windows.get(widget.id);
    if (current && current.mode === want) return;
    if (current) this.close(widget.id);
    if (want) this.open(widget, want);
    else if (!widget.hidden && !existsSync(widget.playPath ?? widget.sourcePath)) {
      console.warn(`[gifengine] widget ${widget.id}: file missing, not shown: ${widget.sourcePath}`);
    }
  }

  private syncDesktop(): void {
    if (this.desktop.kind !== 'quickshell') return;
    this.desktop.layer.sync(desktopItems(this.config.widgets, this.editing, existsSync));
  }

  private open(widget: Widget, mode: WindowMode): void {
    if (this.windows.has(widget.id)) return;
    const start =
      widget.naturalWidth > 0
        ? ensureVisible(this.boundsOf(widget), this.displayRects())
        : (() => {
            const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
            return { x: area.x + Math.round(area.width / 2) - 32, y: area.y + Math.round(area.height / 2) - 32, width: 64, height: 64 };
          })();
    const win = new WidgetWindow(this.renderState(widget), this.deps, start, mode);
    this.windows.set(widget.id, win);
    this.byWebContents.set(win.webContentsId, widget.id);
    win.win.on('closed', () => {
      if (this.windows.get(widget.id) === win) this.windows.delete(widget.id);
      this.byWebContents.delete(win.webContentsId);
    });
  }

  private close(id: string): void {
    const win = this.windows.get(id);
    if (!win) return;
    this.windows.delete(id);
    this.byWebContents.delete(win.webContentsId);
    win.close();
  }

  private commit(): void {
    this.store.scheduleSave(this.config);
    this.syncDesktop();
    this.emit('changed');
  }
}
