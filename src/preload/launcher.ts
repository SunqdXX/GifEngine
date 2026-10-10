import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AppStatus, LauncherApi, LibraryItem } from '../shared/ipc';
import { LAUNCHER } from '../shared/launcher-channels';

const api: LauncherApi = {
  list: () => ipcRenderer.invoke(LAUNCHER.list),
  addViaDialog: () => ipcRenderer.invoke(LAUNCHER.addViaDialog),
  addFiles: (files) =>
    ipcRenderer.invoke(
      LAUNCHER.addPaths,
      files.map((f) => webUtils.getPathForFile(f)).filter((p) => p.length > 0),
    ),
  update: (id, patch) => ipcRenderer.invoke(LAUNCHER.update, id, patch),
  remove: (id) => ipcRenderer.invoke(LAUNCHER.remove, id),
  setAllHidden: (hidden) => ipcRenderer.invoke(LAUNCHER.setAllHidden, hidden),
  status: () => ipcRenderer.invoke(LAUNCHER.status),
  toggleEdit: () => ipcRenderer.invoke(LAUNCHER.toggleEdit),
  setLaunchAtStartup: (enabled) => ipcRenderer.invoke(LAUNCHER.setLaunchAtStartup, enabled),
  quit: () => ipcRenderer.invoke(LAUNCHER.quit),
  onChanged: (cb) => {
    ipcRenderer.on(LAUNCHER.changed, (_e, items: LibraryItem[]) => cb(items));
  },
  onStatus: (cb) => {
    ipcRenderer.on(LAUNCHER.statusChanged, (_e, status: AppStatus) => cb(status));
  },
};

contextBridge.exposeInMainWorld('launcher', api);
