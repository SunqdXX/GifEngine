import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newWidget, parseConfig } from '../../src/main/config/schema';
import { ConfigStore } from '../../src/main/config/store';

describe('parseConfig', () => {
  it('fills every default for an empty object', () => {
    const { config, dropped } = parseConfig({});
    expect(dropped).toBe(0);
    expect(config).toEqual({
      version: 1,
      settings: { editShortcut: 'CommandOrControl+Alt+G', ffmpegPath: null, launchAtStartup: false },
      widgets: [],
    });
  });

  it('fills widget defaults, including fields for upcoming features', () => {
    const { config } = parseConfig({ widgets: [{ id: 'a', sourcePath: '/m/a.webp', kind: 'image' }] });
    expect(config.widgets[0]).toMatchObject({
      id: 'a',
      x: 0,
      y: 0,
      naturalWidth: 0,
      scale: 1,
      opacity: 1,
      flipH: false,
      hidden: false,
      locked: false,
      layer: 'overFullscreen',
      muted: true,
      chroma: { enabled: false, color: '#00ff00', tolerance: 0.3, softness: 0.1 },
    });
  });

  it('drops only the invalid widgets and counts them', () => {
    const { config, dropped } = parseConfig({
      widgets: [
        { id: 'ok', sourcePath: '/m/a.webp', kind: 'image' },
        { id: 'bad-kind', sourcePath: '/m/b.txt', kind: 'document' },
        { sourcePath: '/m/no-id.webp', kind: 'image' },
        'garbage',
      ],
    });
    expect(config.widgets.map((w) => w.id)).toEqual(['ok']);
    expect(dropped).toBe(3);
  });

  it('treats a non-object as an empty config', () => {
    expect(parseConfig(null).config.widgets).toEqual([]);
    expect(parseConfig([1, 2]).config.widgets).toEqual([]);
  });
});

describe('newWidget', () => {
  it('creates an unplaced, visible widget with a unique id', () => {
    const a = newWidget('/m/a.webp', 'image');
    const b = newWidget('/m/a.webp', 'image');
    expect(a.id).not.toBe(b.id);
    expect(a).toMatchObject({ sourcePath: '/m/a.webp', kind: 'image', naturalWidth: 0, hidden: false });
  });
});

describe('ConfigStore', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gifengine-config-'));
    file = join(dir, 'config.json');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts empty when no file exists', () => {
    expect(new ConfigStore(file).load().widgets).toEqual([]);
  });

  it('debounces saves and writes valid JSON atomically (no temp files left behind)', () => {
    const store = new ConfigStore(file);
    const config = store.load();
    config.widgets.push(newWidget('/m/a.webp', 'image'));
    store.scheduleSave(config);
    store.scheduleSave(config);
    expect(readdirSync(dir)).toEqual([]);
    vi.advanceTimersByTime(600);
    expect(readdirSync(dir)).toEqual(['config.json']);
    expect(JSON.parse(readFileSync(file, 'utf8')).widgets).toHaveLength(1);
  });

  it('flush writes a pending save immediately', () => {
    const store = new ConfigStore(file);
    const config = store.load();
    config.settings.launchAtStartup = true;
    store.scheduleSave(config);
    store.flush();
    expect(JSON.parse(readFileSync(file, 'utf8')).settings.launchAtStartup).toBe(true);
  });

  it('round-trips through load', () => {
    const store = new ConfigStore(file);
    const config = store.load();
    const w = newWidget('/m/clip.webm', 'video');
    w.x = 120;
    w.scale = 0.4;
    config.widgets.push(w);
    store.scheduleSave(config);
    store.flush();
    expect(new ConfigStore(file).load().widgets[0]).toMatchObject({ id: w.id, x: 120, scale: 0.4, kind: 'video' });
  });

  it('moves a corrupt file aside and starts empty', () => {
    writeFileSync(file, '{ not json');
    const store = new ConfigStore(file);
    expect(store.load().widgets).toEqual([]);
    expect(store.lastLoadIssue).toMatch(/corrupt/);
    const names = readdirSync(dir);
    expect(names.some((n) => n.startsWith('config.json.corrupt-'))).toBe(true);
    expect(names).not.toContain('config.json');
  });
});

describe('ConfigStore first run', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gifengine-first-run-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('knows when it is a fresh install and when it is not', () => {
    const file = join(dir, 'config.json');
    const first = new ConfigStore(file);
    const config = first.load();
    expect(first.isNew).toBe(true);
    first.scheduleSave(config);
    first.flush();

    const second = new ConfigStore(file);
    second.load();
    expect(second.isNew).toBe(false);
  });
});
