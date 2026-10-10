export { IPC } from './widget-channels';

export { LAUNCHER } from './launcher-channels';

export type MediaKind = 'image' | 'video';

export interface Point {
  x: number;
  y: number;
}

export interface WidgetRenderState {
  id: string;
  kind: MediaKind;
  src: string;
  editing: boolean;
  locked: boolean;
  opacity: number;
  flipH: boolean;
  flipV: boolean;
}

export interface WidgetApi {
  onState(cb: (state: WidgetRenderState) => void): void;
  reportNaturalSize(width: number, height: number): void;
  reportMediaError(message: string): void;
  dragStart(screen: Point): void;
  dragMove(screen: Point): void;
  dragEnd(): void;
  wheelResize(direction: 1 | -1): void;
}

export type WidgetLevel = 'overFullscreen' | 'wallpaper';

export interface LibraryItem {
  id: string;
  name: string;
  sourcePath: string;
  kind: MediaKind;
  mediaUrl: string;
  hidden: boolean;
  missing: boolean;
  locked: boolean;
  scale: number;
  opacity: number;
  flipH: boolean;
  flipV: boolean;
  layer: WidgetLevel;
  naturalWidth: number;
  naturalHeight: number;
}

export type WidgetPatch = Partial<Pick<LibraryItem, 'hidden' | 'locked' | 'scale' | 'opacity' | 'flipH' | 'flipV' | 'layer'>>;

export interface AppStatus {
  editing: boolean;
  launchAtStartup: boolean;
  shortcut: string;
  platform: string;
  desktop: { available: boolean; reason: string | null };
}

export interface LauncherApi {
  list(): Promise<LibraryItem[]>;
  addViaDialog(): Promise<void>;
  addFiles(files: File[]): Promise<void>;
  update(id: string, patch: WidgetPatch): Promise<void>;
  remove(id: string): Promise<void>;
  setAllHidden(hidden: boolean): Promise<void>;
  status(): Promise<AppStatus>;
  toggleEdit(): Promise<void>;
  setLaunchAtStartup(enabled: boolean): Promise<void>;
  quit(): Promise<void>;
  onChanged(cb: (items: LibraryItem[]) => void): void;
  onStatus(cb: (status: AppStatus) => void): void;
}
