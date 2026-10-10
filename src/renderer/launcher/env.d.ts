import type { LauncherApi } from '../../shared/ipc';

declare global {
  interface Window {
    launcher: LauncherApi;
  }
}

export {};
