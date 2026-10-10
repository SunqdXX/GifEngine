import { createConnection } from 'node:net';
import { join } from 'node:path';
import type { Point } from '../shared/ipc';

type Env = Record<string, string | undefined>;

export interface HyprClient {
  address: string;
  title: string;
  floating: boolean;
  pinned: boolean;
}

export function hyprSocketPath(env: Env): string | null {
  const sig = env.HYPRLAND_INSTANCE_SIGNATURE;
  const runtime = env.XDG_RUNTIME_DIR;
  return sig && runtime ? join(runtime, 'hypr', sig, '.socket.sock') : null;
}

export function findClientByTitle(clients: unknown, title: string): HyprClient | null {
  if (!Array.isArray(clients)) return null;
  for (const c of clients as Record<string, unknown>[]) {
    if (c.title !== title || typeof c.address !== 'string') continue;
    return { address: c.address, title, floating: c.floating === true, pinned: c.pinned === true };
  }
  return null;
}

const OVERLAY_PROPS = ['no_blur on', 'no_shadow on', 'border_size 0', 'rounding 0', 'no_focus on', 'no_anim on'];

export function overlayCommands(client: HyprClient, at: Point): string[] {
  const a = `address:${client.address}`;
  const cmds: string[] = [];
  if (!client.floating) cmds.push(`dispatch setfloating ${a}`);
  for (const prop of OVERLAY_PROPS) cmds.push(`dispatch setprop ${a} ${prop}`);
  cmds.push(`dispatch movewindowpixel exact ${at.x} ${at.y},${a}`);
  if (!client.pinned) cmds.push(`dispatch pin ${a}`);
  return cmds;
}

export function editModeCommands(address: string, editing: boolean): string[] {
  return [`dispatch setprop address:${address} no_focus ${editing ? 'off' : 'on'}`];
}

const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

export function toggleEditBind(command: readonly string[]): string {
  return `keyword bind CTRL ALT, G, exec, ${command.map(shellQuote).join(' ')} --toggle-edit`;
}

export const UNBIND_TOGGLE_EDIT = 'keyword unbind CTRL ALT, G';

const MOD_CTRL_ALT = 4 | 8;

export function bindConflict(binds: unknown): 'free' | 'ours' | 'taken' {
  if (!Array.isArray(binds)) return 'free';
  const hit = (binds as Record<string, unknown>[]).find(
    (b) => b.modmask === MOD_CTRL_ALT && typeof b.key === 'string' && b.key.toLowerCase() === 'g',
  );
  if (!hit) return 'free';
  return typeof hit.arg === 'string' && hit.arg.includes('--toggle-edit') ? 'ours' : 'taken';
}

export function batch(cmds: readonly string[]): string {
  return `[[BATCH]]${cmds.join(';')}`;
}

export function request(socketPath: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = createConnection(socketPath);
    const chunks: Buffer[] = [];
    sock.setTimeout(2000, () => sock.destroy(new Error('hyprland socket timeout')));
    sock.on('connect', () => sock.end(body));
    sock.on('data', (d) => chunks.push(d));
    sock.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    sock.on('error', reject);
  });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function makeOverlay(title: string, at: Point, env: Env = process.env): Promise<string | null> {
  const socketPath = hyprSocketPath(env);
  if (!socketPath) return null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const client = findClientByTitle(JSON.parse(await request(socketPath, 'j/clients')), title);
    if (client) {
      await request(socketPath, batch(overlayCommands(client, at)));
      return client.address;
    }
    await delay(50);
  }
  return null;
}

export async function setEditMode(address: string, editing: boolean, env: Env = process.env): Promise<void> {
  const socketPath = hyprSocketPath(env);
  if (socketPath) await request(socketPath, batch(editModeCommands(address, editing)));
}

export async function registerToggleEditBind(command: readonly string[], env: Env = process.env): Promise<boolean> {
  const socketPath = hyprSocketPath(env);
  if (!socketPath) return false;
  const state = bindConflict(JSON.parse(await request(socketPath, 'j/binds')));
  if (state === 'taken') return false;
  if (state === 'ours') await request(socketPath, UNBIND_TOGGLE_EDIT);
  await request(socketPath, toggleEditBind(command));
  return true;
}

export async function unregisterToggleEditBind(env: Env = process.env): Promise<void> {
  const socketPath = hyprSocketPath(env);
  if (socketPath) await request(socketPath, UNBIND_TOGGLE_EDIT);
}
