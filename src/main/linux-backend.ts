type Env = Record<string, string | undefined>;

export interface BackendInput {
  platform: NodeJS.Platform;
  argv: readonly string[];
  env: Env;
  wantWayland: boolean;
}

export const X11_FLAG = '--ozone-platform=x11';

export function needsX11Relaunch({ platform, argv, env, wantWayland }: BackendInput): boolean {
  if (platform !== 'linux' || wantWayland) return false;
  if (argv.some((a) => a.startsWith('--ozone-platform'))) return false;
  const onWayland = Boolean(env.WAYLAND_DISPLAY) || env.XDG_SESSION_TYPE === 'wayland';
  return onWayland && Boolean(env.DISPLAY);
}

export function relaunchCommand(execPath: string, argv: readonly string[], env: Env): { command: string; args: string[] } {
  return { command: env.APPIMAGE || execPath, args: [...argv.slice(1), X11_FLAG] };
}
