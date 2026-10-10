import { describe, expect, it } from 'vitest';
import { batch, bindConflict, editModeCommands, findClientByTitle, hyprSocketPath, overlayCommands, toggleEditBind } from '../../src/main/hyprland';

describe('hyprSocketPath', () => {
  it('builds the request socket path from the instance signature', () => {
    expect(hyprSocketPath({ HYPRLAND_INSTANCE_SIGNATURE: 'abc', XDG_RUNTIME_DIR: '/run/user/1000' })).toBe(
      '/run/user/1000/hypr/abc/.socket.sock',
    );
  });

  it('returns null outside Hyprland', () => {
    expect(hyprSocketPath({ XDG_RUNTIME_DIR: '/run/user/1000' })).toBeNull();
    expect(hyprSocketPath({ HYPRLAND_INSTANCE_SIGNATURE: 'abc' })).toBeNull();
  });
});

describe('findClientByTitle', () => {
  const clients = [
    { address: '0x1', title: 'kitty', floating: false, pinned: false },
    { address: '0x2', title: 'gifengine-aaa', floating: true, pinned: false },
  ];

  it('finds the exact title', () => {
    expect(findClientByTitle(clients, 'gifengine-aaa')).toEqual({ address: '0x2', title: 'gifengine-aaa', floating: true, pinned: false });
  });

  it('returns null when absent or when the payload is not a client list', () => {
    expect(findClientByTitle(clients, 'gifengine-bbb')).toBeNull();
    expect(findClientByTitle({ error: 'nope' }, 'gifengine-aaa')).toBeNull();
    expect(findClientByTitle([{ title: 'gifengine-aaa' }], 'gifengine-aaa')).toBeNull();
  });
});

describe('overlayCommands', () => {
  const at = { x: 10, y: 20 };

  it('strips decorations and focus, positions and pins a floating window', () => {
    expect(overlayCommands({ address: '0x2', title: 't', floating: true, pinned: false }, at)).toEqual([
      'dispatch setprop address:0x2 no_blur on',
      'dispatch setprop address:0x2 no_shadow on',
      'dispatch setprop address:0x2 border_size 0',
      'dispatch setprop address:0x2 rounding 0',
      'dispatch setprop address:0x2 no_focus on',
      'dispatch setprop address:0x2 no_anim on',
      'dispatch movewindowpixel exact 10 20,address:0x2',
      'dispatch pin address:0x2',
    ]);
  });

  it('floats a tiled window first', () => {
    expect(overlayCommands({ address: '0x2', title: 't', floating: false, pinned: false }, at)[0]).toBe('dispatch setfloating address:0x2');
  });

  it('does not toggle pin off on an already pinned window', () => {
    expect(overlayCommands({ address: '0x2', title: 't', floating: true, pinned: true }, at)).not.toContain('dispatch pin address:0x2');
  });
});

describe('batch', () => {
  it('joins commands into one batched socket request', () => {
    expect(batch(['dispatch a', 'dispatch b'])).toBe('[[BATCH]]dispatch a;dispatch b');
  });
});

describe('editModeCommands', () => {
  it('lets the pointer reach the widget while editing (no_focus blocks pointer input too)', () => {
    expect(editModeCommands('0x2', true)).toEqual(['dispatch setprop address:0x2 no_focus off']);
  });

  it('restores no_focus when leaving edit mode', () => {
    expect(editModeCommands('0x2', false)).toEqual(['dispatch setprop address:0x2 no_focus on']);
  });
});

describe('toggleEditBind', () => {
  it('binds CTRL ALT G to re-run the app with --toggle-edit, quoting every path', () => {
    expect(toggleEditBind(["/opt/Gif Engine/gifengine"])).toBe(
      "keyword bind CTRL ALT, G, exec, '/opt/Gif Engine/gifengine' --toggle-edit",
    );
    expect(toggleEditBind(['/x/electron', "/home/u/it's/GifEngine"])).toBe(
      "keyword bind CTRL ALT, G, exec, '/x/electron' '/home/u/it'\\''s/GifEngine' --toggle-edit",
    );
  });
});

describe('bindConflict', () => {
  const ours = { modmask: 12, key: 'G', dispatcher: 'exec', arg: "'/x/gifengine' --toggle-edit" };

  it('is free when nothing uses CTRL+ALT+G', () => {
    expect(bindConflict([{ modmask: 64, key: 'Q', dispatcher: 'exec', arg: 'kitty' }])).toBe('free');
  });

  it('recognises a leftover bind from an earlier GifEngine run', () => {
    expect(bindConflict([ours])).toBe('ours');
  });

  it('reports a foreign bind on the same combo, whatever the key case', () => {
    expect(bindConflict([{ modmask: 12, key: 'g', dispatcher: 'exec', arg: 'something-else' }])).toBe('taken');
  });

  it('treats a malformed payload as free', () => {
    expect(bindConflict({ error: 'x' })).toBe('free');
  });
});
