import type { AppStatus, LibraryItem, WidgetLevel, WidgetPatch } from '../../shared/ipc';

const api = window.launcher;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const grid = $<HTMLElement>('grid');
const empty = $<HTMLElement>('empty');
const summary = $<HTMLElement>('summary');
const moveBtn = $<HTMLButtonElement>('move');
const moveLabel = $<HTMLElement>('moveLabel');
const kbd = $<HTMLElement>('kbd');
const banner = $<HTMLElement>('banner');
const menu = $<HTMLElement>('menu');
const moreBtn = $<HTMLButtonElement>('moreBtn');
const autostart = $<HTMLInputElement>('autostart');
const drop = $<HTMLElement>('drop');

const ICONS = {
  flipH: '<svg viewBox="0 0 24 24"><path d="M11 3h2v18h-2zM9 7v10L3 12zm6 0l6 5-6 5z"/></svg>',
  flipV: '<svg viewBox="0 0 24 24"><path d="M3 11h18v2H3zM7 9h10L12 3zm0 6h10l-5 6z"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><path d="M12 2a5 5 0 0 0-5 5v3H5v12h14V10h-2V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3z"/></svg>',
  remove: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z"/></svg>',
};

interface CardRefs {
  root: HTMLElement;
  name: HTMLElement;
  levels: Record<WidgetLevel, HTMLButtonElement>;
  visible: HTMLInputElement;
  size: HTMLInputElement;
  sizeOut: HTMLOutputElement;
  opacity: HTMLInputElement;
  opacityOut: HTMLOutputElement;
  flipH: HTMLButtonElement;
  flipV: HTMLButtonElement;
  lock: HTMLButtonElement;
  missing: HTMLElement;
}

const cards = new Map<string, CardRefs>();
let lastItems: LibraryItem[] = [];
let desktop: AppStatus['desktop'] = { available: true, reason: null };
const pending = new Map<string, WidgetPatch>();
let flushScheduled = false;

function queueUpdate(id: string, patch: WidgetPatch): void {
  pending.set(id, { ...pending.get(id), ...patch });
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    flushScheduled = false;
    for (const [pid, p] of pending) void api.update(pid, p);
    pending.clear();
  });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html) node.innerHTML = html;
  return node;
}

function slider(label: string, min: number, max: number): { row: HTMLElement; input: HTMLInputElement; out: HTMLOutputElement } {
  const row = el('label', 'ctrl');
  const input = el('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  const out = el('output');
  row.append(document.createTextNode(label), input, out);
  return { row, input, out };
}

function tool(cls: string, icon: string, title: string): HTMLButtonElement {
  const b = el('button', `tool ${cls}`, icon);
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  return b;
}

function createCard(item: LibraryItem): CardRefs {
  const root = el('article', 'card');
  root.dataset.id = item.id;

  const thumb = el('div', 'thumb');
  const missing = el('span', 'badge missing');
  missing.textContent = 'File missing';
  if (item.kind === 'video') {
    const v = el('video');
    Object.assign(v, { muted: true, loop: true, autoplay: true, playsInline: true, src: item.mediaUrl });
    thumb.append(v);
  } else {
    const img = el('img');
    img.loading = 'lazy';
    img.alt = '';
    img.src = item.mediaUrl;
    thumb.append(img);
  }
  thumb.append(missing);

  const body = el('div', 'body');
  const head = el('div', 'head');
  const name = el('span', 'name');
  const sw = el('label', 'switch');
  const visible = el('input');
  visible.type = 'checkbox';
  sw.title = 'Show on screen';
  sw.append(visible, el('span'));
  head.append(name, sw);

  const seg = el('div', 'seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Level');
  const levelButton = (level: WidgetLevel, label: string, title: string) => {
    const b = el('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.dataset.level = level;
    b.addEventListener('click', () => void api.update(item.id, { layer: level }));
    seg.append(b);
    return b;
  };
  const levels = {
    overFullscreen: levelButton('overFullscreen', 'On top', 'Above every window, games included'),
    wallpaper: levelButton('wallpaper', 'Desktop', 'On the wallpaper: your apps cover it'),
  };

  const size = slider('Size', 5, 200);
  const opacity = slider('Opacity', 5, 100);

  const tools = el('div', 'tools');
  const flipH = tool('flip-h', ICONS.flipH, 'Flip horizontally');
  const flipV = tool('flip-v', ICONS.flipV, 'Flip vertically');
  const lock = tool('lock', ICONS.lock, 'Lock in place (stays click-through in move mode)');
  const remove = tool('remove', ICONS.remove, 'Remove from library');
  tools.append(flipH, flipV, lock, remove);

  body.append(head, seg, size.row, opacity.row, tools);
  root.append(thumb, body);

  const id = item.id;
  visible.addEventListener('change', () => void api.update(id, { hidden: !visible.checked }));
  size.input.addEventListener('input', () => {
    size.out.value = `${size.input.value}%`;
    queueUpdate(id, { scale: Number(size.input.value) / 100 });
  });
  opacity.input.addEventListener('input', () => {
    opacity.out.value = `${opacity.input.value}%`;
    queueUpdate(id, { opacity: Number(opacity.input.value) / 100 });
  });
  flipH.addEventListener('click', () => void api.update(id, { flipH: flipH.getAttribute('aria-pressed') !== 'true' }));
  flipV.addEventListener('click', () => void api.update(id, { flipV: flipV.getAttribute('aria-pressed') !== 'true' }));
  lock.addEventListener('click', () => void api.update(id, { locked: lock.getAttribute('aria-pressed') !== 'true' }));
  remove.addEventListener('click', () => void api.remove(id));

  return {
    root,
    name,
    levels,
    visible,
    size: size.input,
    sizeOut: size.out,
    opacity: opacity.input,
    opacityOut: opacity.out,
    flipH,
    flipV,
    lock,
    missing,
  };
}

function patchCard(c: CardRefs, item: LibraryItem): void {
  c.name.textContent = item.name;
  c.name.title = item.sourcePath;
  c.visible.checked = !item.hidden && !item.missing;
  c.visible.disabled = item.missing;
  c.root.classList.toggle('off', item.hidden || item.missing);
  c.missing.hidden = !item.missing;
  if (document.activeElement !== c.size) {
    c.size.value = String(Math.round(item.scale * 100));
    c.sizeOut.value = `${c.size.value}%`;
  }
  c.size.disabled = item.naturalWidth === 0;
  if (document.activeElement !== c.opacity) {
    c.opacity.value = String(Math.round(item.opacity * 100));
    c.opacityOut.value = `${c.opacity.value}%`;
  }
  for (const [level, button] of Object.entries(c.levels) as [WidgetLevel, HTMLButtonElement][]) {
    button.setAttribute('aria-pressed', String(item.layer === level));
  }
  c.levels.wallpaper.disabled = !desktop.available;
  c.levels.wallpaper.title = desktop.available ? 'On the wallpaper: your apps cover it' : (desktop.reason ?? 'Not available here');
  c.flipH.setAttribute('aria-pressed', String(item.flipH));
  c.flipV.setAttribute('aria-pressed', String(item.flipV));
  c.lock.setAttribute('aria-pressed', String(item.locked));
}

function render(items: LibraryItem[]): void {
  lastItems = items;
  const seen = new Set<string>();
  items.forEach((item, index) => {
    seen.add(item.id);
    let c = cards.get(item.id);
    if (!c) {
      c = createCard(item);
      cards.set(item.id, c);
    }
    patchCard(c, item);
    if (grid.children[index] !== c.root) grid.insertBefore(c.root, grid.children[index] ?? null);
  });
  for (const [id, c] of cards) {
    if (seen.has(id)) continue;
    c.root.remove();
    cards.delete(id);
  }
  const onScreen = items.filter((i) => !i.hidden && !i.missing).length;
  empty.hidden = items.length > 0;
  grid.hidden = items.length === 0;
  summary.textContent =
    items.length === 0 ? 'Your desktop widgets' : `${items.length} in library · ${onScreen} on screen`;
}

function renderStatus(s: AppStatus): void {
  moveBtn.setAttribute('aria-pressed', String(s.editing));
  moveLabel.textContent = s.editing ? 'Done moving' : 'Move widgets';
  kbd.textContent = s.shortcut;
  banner.hidden = !s.editing;
  autostart.checked = s.launchAtStartup;
  desktop = s.desktop;
  render(lastItems);
}

moveBtn.addEventListener('click', () => void api.toggleEdit());
$<HTMLButtonElement>('done').addEventListener('click', () => void api.toggleEdit());
$<HTMLButtonElement>('add').addEventListener('click', () => void api.addViaDialog());
$<HTMLButtonElement>('emptyAdd').addEventListener('click', () => void api.addViaDialog());

function setMenu(open: boolean): void {
  menu.hidden = !open;
  moreBtn.setAttribute('aria-expanded', String(open));
}
moreBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setMenu(menu.hidden);
});
document.addEventListener('click', (e) => {
  if (!menu.hidden && !menu.contains(e.target as Node)) setMenu(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setMenu(false);
});
menu.addEventListener('click', (e) => {
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
  if (!act) return;
  setMenu(false);
  if (act === 'show-all') void api.setAllHidden(false);
  else if (act === 'hide-all') void api.setAllHidden(true);
  else if (act === 'quit') void api.quit();
});
autostart.addEventListener('change', () => void api.setLaunchAtStartup(autostart.checked));

let dragDepth = 0;
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
document.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  drop.hidden = false;
});
document.addEventListener('dragover', (e) => {
  if (hasFiles(e)) e.preventDefault();
});
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) drop.hidden = true;
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  drop.hidden = true;
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (files.length) void api.addFiles(files);
});

api.onChanged(render);
api.onStatus(renderStatus);
void api.list().then(render);
void api.status().then(renderStatus);
