import type { WidgetApi } from '../../shared/ipc';

declare global {
  interface Window {
    gifengine: WidgetApi;
  }
}

export {};
