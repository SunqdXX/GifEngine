import { spawn, type ChildProcess } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MediaKind } from '../shared/ipc';
import type { Widget } from './config/schema';

type Env = Record<string, string | undefined>;

export type DesktopBackend =
  | { kind: 'quickshell'; qs: string }
  | { kind: 'electron' }
  | { kind: 'unsupported'; reason: string };

export function chooseDesktopBackend(input: { platform: NodeJS.Platform; env: Env; quickshell: string | null }): DesktopBackend {
  if (input.platform !== 'linux') return { kind: 'electron' };
  const wayland = Boolean(input.env.WAYLAND_DISPLAY) || input.env.XDG_SESSION_TYPE === 'wayland';
  if (!wayland) return { kind: 'electron' };
  if (input.quickshell) return { kind: 'quickshell', qs: input.quickshell };
  return {
    kind: 'unsupported',
    reason:
      'On Wayland the Desktop level needs quickshell, which draws on the layer under your windows. ' +
      'Install the "quickshell" package and restart GifEngine.',
  };
}

export function findOnPath(names: readonly string[], env: Env): string | null {
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = join(dir, name);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
      }
    }
  }
  return null;
}

export interface DesktopItem {
  id: string;
  url: string;
  kind: MediaKind;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  flipH: boolean;
  flipV: boolean;
}

export function desktopItems(widgets: readonly Widget[], editing: boolean, exists: (path: string) => boolean): DesktopItem[] {
  if (editing) return [];
  return widgets
    .filter((w) => w.layer === 'wallpaper' && !w.hidden && w.naturalWidth > 0 && exists(w.playPath ?? w.sourcePath))
    .map((w) => ({
      id: w.id,
      url: pathToFileURL(w.playPath ?? w.sourcePath).href,
      kind: w.kind,
      x: Math.round(w.x),
      y: Math.round(w.y),
      width: Math.max(1, Math.round(w.naturalWidth * w.scale)),
      height: Math.max(1, Math.round(w.naturalHeight * w.scale)),
      opacity: w.opacity,
      flipH: w.flipH,
      flipV: w.flipV,
    }));
}

export function quickshellQml(jsonPath: string, parentPid: number): string {
  return `import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland

ShellRoot {
  id: root
  property var byId: ({})
  property var ids: []

  function screenFor(x, y) {
    const list = Quickshell.screens;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (x >= s.x && x < s.x + s.width && y >= s.y && y < s.y + s.height) return s;
    }
    return list[0];
  }

  FileView {
    path: ${JSON.stringify(jsonPath)}
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      let items;
      try { items = JSON.parse(text()).items; } catch (e) { return; }
      const map = {};
      for (const it of items) map[it.id] = it;
      root.byId = map;
      root.ids = items.map(it => it.id);
    }
  }

  Process {
    id: alive
    command: ["kill", "-0", "${parentPid}"]
    onExited: (code) => { if (code !== 0) Qt.quit(); }
  }
  Timer { interval: 2000; running: true; repeat: true; onTriggered: alive.running = true }

  Variants {
    model: root.ids
    PanelWindow {
      id: win
      required property string modelData
      readonly property var d: root.byId[modelData] || null
      readonly property var target: d ? root.screenFor(d.x + d.width / 2, d.y + d.height / 2) : Quickshell.screens[0]
      screen: target
      visible: d !== null
      WlrLayershell.layer: WlrLayer.Bottom
      WlrLayershell.namespace: "gifengine"
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
      exclusionMode: ExclusionMode.Ignore
      anchors { top: true; left: true }
      margins { top: d ? d.y - target.y : 0; left: d ? d.x - target.x : 0 }
      implicitWidth: d ? d.width : 1
      implicitHeight: d ? d.height : 1
      color: "transparent"
      mask: Region {}

      Item {
        anchors.fill: parent
        opacity: win.d ? win.d.opacity : 1
        transform: Scale {
          origin.x: win.width / 2
          origin.y: win.height / 2
          xScale: win.d && win.d.flipH ? -1 : 1
          yScale: win.d && win.d.flipV ? -1 : 1
        }
        Loader {
          anchors.fill: parent
          active: win.d !== null && win.d.kind === "image"
          sourceComponent: AnimatedImage {
            source: win.d ? win.d.url : ""
            fillMode: Image.PreserveAspectFit
            playing: true
            smooth: true
            mipmap: true
          }
        }
        Loader {
          anchors.fill: parent
          active: win.d !== null && win.d.kind === "video"
          source: "DesktopVideo.qml"
          onLoaded: item.url = Qt.binding(() => win.d ? win.d.url : "")
        }
      }
    }
  }
}
`;
}

const DESKTOP_VIDEO_QML = `import QtQuick
import QtMultimedia

Video {
  property string url
  source: url
  fillMode: VideoOutput.PreserveAspectFit
  autoPlay: true
  muted: true
  loops: MediaPlayer.Infinite
}
`;

export class QuickshellDesktop {
  private child: ChildProcess | null = null;
  private stopped = false;
  private restarts = 0;
  private readonly jsonPath: string;

  constructor(
    private readonly qs: string,
    private readonly dir: string,
    private readonly log: (line: string) => void = () => undefined,
  ) {
    this.jsonPath = join(dir, 'desktop.json');
  }

  sync(items: readonly DesktopItem[]): void {
    if (this.stopped) return;
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.jsonPath, JSON.stringify({ items }));
    if (!this.child && items.length > 0) this.start();
  }

  stop(): void {
    this.stopped = true;
    this.child?.kill();
    this.child = null;
  }

  private start(): void {
    writeFileSync(join(this.dir, 'shell.qml'), quickshellQml(this.jsonPath, process.pid));
    writeFileSync(join(this.dir, 'DesktopVideo.qml'), DESKTOP_VIDEO_QML);
    if (!existsSync(this.jsonPath)) writeFileSync(this.jsonPath, '{"items":[]}');
    const child = spawn(this.qs, ['-p', join(this.dir, 'shell.qml')], { stdio: ['ignore', 'pipe', 'pipe'] });
    const forward = (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) if (line.trim()) this.log(line);
    };
    child.stdout?.on('data', forward);
    child.stderr?.on('data', forward);
    child.on('error', (err) => this.log(`could not start quickshell: ${err.message}`));
    child.on('exit', (code) => {
      this.child = null;
      if (this.stopped || this.restarts >= 3) return;
      this.restarts++;
      this.log(`quickshell exited (${code}); restarting`);
      setTimeout(() => !this.stopped && !this.child && this.start(), 1000 * this.restarts);
    });
    this.child = child;
  }
}

export function windowsBottomScript(hwnd: bigint): string {
  return (
    `Add-Type -Name W -Namespace GifEngine -MemberDefinition '[DllImport("user32.dll")] ` +
    `public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);'; ` +
    `[GifEngine.W]::SetWindowPos([IntPtr]${hwnd}, [IntPtr]1, 0, 0, 0, 0, 0x13) | Out-Null`
  );
}

export function sendToBottomWin32(handle: Buffer): void {
  const hwnd = handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowsBottomScript(hwnd)], {
    windowsHide: true,
    stdio: 'ignore',
  }).on('error', () => undefined);
}
