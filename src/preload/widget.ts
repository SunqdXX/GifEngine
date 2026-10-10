import { contextBridge, ipcRenderer } from 'electron';
import type { WidgetApi, WidgetRenderState } from '../shared/ipc';
import { IPC } from '../shared/widget-channels';

const api: WidgetApi = {
  onState: (cb) => {
    ipcRenderer.on(IPC.widgetState, (_e, state: WidgetRenderState) => cb(state));
  },
  reportNaturalSize: (width, height) => ipcRenderer.send(IPC.naturalSize, width, height),
  reportMediaError: (message) => ipcRenderer.send(IPC.mediaError, message),
  dragStart: (p) => ipcRenderer.send(IPC.dragStart, p.x, p.y),
  dragMove: (p) => ipcRenderer.send(IPC.dragMove, p.x, p.y),
  dragEnd: () => ipcRenderer.send(IPC.dragEnd),
  wheelResize: (direction) => ipcRenderer.send(IPC.wheelResize, direction),
};

contextBridge.exposeInMainWorld('gifengine', api);
