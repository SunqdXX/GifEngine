import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { electronPath, PNG_40x20, ROOT, testEnv } from './fixtures';

const ODD_NAME = 'dot #1 ç.png';

interface DebugWidget {
  id: string;
  mode: 'top' | 'desktop';
  alwaysOnTop: boolean;
  title: string;
  editing: boolean;
  ignoreMouse: boolean;
  visible: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}

let dir: string;
let env: Record<string, string>;
let app: ElectronApplication | undefined;

function launch(...args: string[]): Promise<ElectronApplication> {
  return electron.launch({ executablePath: electronPath, args: [ROOT, '--ozone-platform=x11', ...args], cwd: dir, env });
}

function launchBackground(...files: string[]): Promise<ElectronApplication> {
  return launch('--background', ...files);
}

async function launcherPage(a: ElectronApplication): Promise<Page> {
  await expect.poll(async () => (await Promise.all(a.windows().map((w) => w.title()))).includes('GifEngine'), { timeout: 20_000 }).toBe(true);
  for (const w of a.windows()) if ((await w.title()) === 'GifEngine') return w;
  throw new Error('launcher window not found');
}

async function widgetPage(a: ElectronApplication): Promise<Page> {
  await expect.poll(async () => (await Promise.all(a.windows().map((w) => w.title()))).includes('GifEngine widget'), { timeout: 20_000 }).toBe(true);
  for (const w of a.windows()) if ((await w.title()) === 'GifEngine widget') return w;
  throw new Error('widget window not found');
}

function runCli(...args: string[]) {
  return spawnSync(electronPath, [ROOT, '--ozone-platform=x11', ...args], { cwd: dir, env, timeout: 30_000, encoding: 'utf8' });
}

async function widgets(a: ElectronApplication): Promise<DebugWidget[]> {
  return a.evaluate(() => (globalThis as any).__gifengine.widgets());
}

async function firstVisible(a: ElectronApplication): Promise<DebugWidget> {
  await expect.poll(async () => (await widgets(a))[0]?.visible, { timeout: 20_000 }).toBe(true);
  return (await widgets(a))[0]!;
}

async function toggleEdit(a: ElectronApplication): Promise<void> {
  await a.evaluate(() => (globalThis as any).__gifengine.toggleEdit());
}

test.beforeEach(() => {
  app = undefined;
  dir = mkdtempSync(join(tmpdir(), 'gifengine-e2e-'));
  env = testEnv(join(dir, 'userData'));
  writeFileSync(join(dir, ODD_NAME), PNG_40x20);
});

test.afterEach(async () => {
  await app?.close().catch(() => undefined);
  rmSync(dir, { recursive: true, force: true });
});

test('shows one click-through, always-on-top widget for a relative path with an unusual name', async () => {
  app = await launchBackground(ODD_NAME);
  const w = await firstVisible(app);
  expect(w).toMatchObject({ editing: false, ignoreMouse: true, bounds: { width: 40, height: 20 } });
  expect(w.title).toMatch(/^gifengine-[0-9a-f-]{36}$/);
  const onTop = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((x) => x.isAlwaysOnTop()));
  expect(onTop).toEqual([true]);
});

test('edit mode makes the widget interactive and shows the outline, then reverts', async () => {
  app = await launchBackground(ODD_NAME);
  const page = await widgetPage(app);
  await firstVisible(app);

  await toggleEdit(app);
  await expect(page.locator('body')).toHaveClass(/editing/);
  expect((await widgets(app))[0]).toMatchObject({ editing: true, ignoreMouse: false });

  await toggleEdit(app);
  await expect(page.locator('body')).not.toHaveClass(/editing/);
  expect((await widgets(app))[0]).toMatchObject({ editing: false, ignoreMouse: true });
});

test('drag moves the window only in edit mode and ignores invalid coordinates', async () => {
  app = await launchBackground(ODD_NAME);
  const page = await widgetPage(app);
  const start = (await firstVisible(app)).bounds;

  const drag = (dx: number, dy: number) =>
    page.evaluate(
      ([dx, dy]) => {
        const api = (globalThis as any).gifengine;
        api.dragStart({ x: 100, y: 100 });
        api.dragMove({ x: 100 + dx, y: 100 + dy });
        api.dragEnd();
      },
      [dx, dy] as const,
    );

  await drag(50, 30);
  await page.waitForTimeout(300);
  expect((await widgets(app))[0]!.bounds).toMatchObject({ x: start.x, y: start.y });

  await toggleEdit(app);
  await expect(page.locator('body')).toHaveClass(/editing/);
  await page.evaluate(() => {
    const api = (globalThis as any).gifengine;
    api.dragStart({ x: 0, y: 0 });
    api.dragMove({ x: Number.NaN, y: 5 });
    api.dragEnd();
  });
  await drag(50, 30);
  await expect.poll(async () => (await widgets(app!))[0]!.bounds).toMatchObject({ x: start.x + 50, y: start.y + 30 });
});

test('a second launch forwards --toggle-edit; a bare relaunch opens the launcher', async () => {
  app = await launchBackground(ODD_NAME);
  await firstVisible(app);

  expect(runCli('--toggle-edit').status).toBe(0);
  await expect.poll(async () => (await widgets(app!))[0]!.editing).toBe(true);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

  expect(runCli().status).toBe(0);
  await launcherPage(app);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2);
  expect((await widgets(app)).length).toBe(1);
});

test('unloadable media is reported and never shown', async () => {
  writeFileSync(join(dir, 'broken.png'), 'definitely not a png');
  app = await launchBackground('broken.png');
  await expect
    .poll(async () => (await app!.evaluate(() => (globalThis as any).__gifengine.errors() as string[])).length, { timeout: 20_000 })
    .toBe(1);
  expect((await widgets(app))[0]!.visible).toBe(false);
});

test('unsupported files are skipped and never enter the library', async () => {
  writeFileSync(join(dir, 'notes.txt'), 'hello');
  app = await launchBackground('notes.txt');
  const stderr: string[] = [];
  app.process().stderr?.on('data', (d: Buffer) => stderr.push(d.toString()));
  await expect.poll(() => app!.evaluate(() => (globalThis as any).__gifengine?.items().length), { timeout: 20_000 }).toBe(0);
  expect((await widgets(app)).length).toBe(0);
});

test('the launcher lists added media and its switch takes a widget off and back on screen', async () => {
  app = await launch();
  const launcher = await launcherPage(app);
  await expect(launcher.getByRole('heading', { name: 'Drop your GIFs here' })).toBeVisible();

  await app.evaluate((_e, p) => (globalThis as any).__gifengine.add([p]), join(dir, ODD_NAME));
  const card = launcher.locator('article.card');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.name')).toHaveText(ODD_NAME);
  const placed = await firstVisible(app);

  await card.locator('.switch').click();
  await expect.poll(async () => (await widgets(app!)).length).toBe(0);
  await expect(card).toHaveClass(/off/);

  await card.locator('.switch').click();
  await expect.poll(async () => (await widgets(app!))[0]?.visible, { timeout: 20_000 }).toBe(true);
  expect((await widgets(app))[0]!.bounds).toEqual(placed.bounds);
});

test('the launcher opacity slider and flip button reach the widget', async () => {
  app = await launch(ODD_NAME);
  const launcher = await launcherPage(app);
  await firstVisible(app);
  const widget = await widgetPage(app);
  const card = launcher.locator('article.card');

  await card.locator('input[type=range]').nth(1).fill('40');
  await expect.poll(() => widget.evaluate(() => (globalThis as any).document.getElementById('stage').style.opacity)).toBe('0.4');

  await card.getByRole('button', { name: 'Flip horizontally' }).click();
  await expect.poll(() => widget.evaluate(() => (globalThis as any).document.getElementById('stage').style.transform)).toBe('scale(-1, 1)');
  await expect(card.getByRole('button', { name: 'Flip horizontally' })).toHaveAttribute('aria-pressed', 'true');
});

test('scroll-resize in edit mode keeps the centre, and position + size survive a restart', async () => {
  app = await launchBackground(ODD_NAME);
  const widget = await widgetPage(app);
  const before = (await firstVisible(app)).bounds;

  await widget.evaluate(() => (globalThis as any).gifengine.wheelResize(1));
  await widget.waitForTimeout(300);
  expect((await widgets(app))[0]!.bounds).toEqual(before);

  await toggleEdit(app);
  await expect(widget.locator('body')).toHaveClass(/editing/);
  await widget.evaluate(() => {
    const api = (globalThis as any).gifengine;
    api.dragStart({ x: 10, y: 10 });
    api.dragMove({ x: 70, y: 50 });
    api.dragEnd();
    api.wheelResize(1);
  });
  await expect.poll(async () => (await widgets(app!))[0]!.bounds).toMatchObject({ width: 64, height: 32 });
  const after = (await widgets(app))[0]!.bounds;
  const cx = (r: { x: number; width: number }) => r.x + r.width / 2;
  expect(Math.abs(cx(after) - (cx(before) + 60))).toBeLessThanOrEqual(1);

  await app.evaluate(() => (globalThis as any).__gifengine.flush());
  await app.close();
  app = await launchBackground();
  await expect.poll(async () => (await widgets(app!))[0]?.visible, { timeout: 20_000 }).toBe(true);
  expect((await widgets(app))[0]!.bounds).toEqual(after);
});

test('a widget can live on the desktop level and becomes draggable in move mode', async () => {
  app = await launchBackground(ODD_NAME);
  const w = await firstVisible(app);
  expect(w).toMatchObject({ mode: 'top', alwaysOnTop: true });

  await app.evaluate((_e, id) => (globalThis as any).__gifengine.update(id, { layer: 'wallpaper' }), w.id);
  await expect.poll(async () => (await widgets(app!))[0]?.mode).toBe('desktop');
  await expect.poll(async () => (await widgets(app!))[0]?.visible, { timeout: 20_000 }).toBe(true);
  expect((await widgets(app))[0]).toMatchObject({ alwaysOnTop: false, ignoreMouse: true, bounds: w.bounds });

  await toggleEdit(app);
  await expect.poll(async () => (await widgets(app!))[0]?.mode).toBe('top');
  await expect.poll(async () => (await widgets(app!))[0]?.ignoreMouse).toBe(false);

  await toggleEdit(app);
  await expect.poll(async () => (await widgets(app!))[0]?.mode).toBe('desktop');
  expect((await app.evaluate(() => (globalThis as any).__gifengine.items()))[0].layer).toBe('wallpaper');
});

test('the launcher level toggle switches a widget between On top and Desktop', async () => {
  app = await launch(ODD_NAME);
  const launcher = await launcherPage(app);
  await firstVisible(app);
  const card = launcher.locator('article.card');
  const onTop = card.getByRole('button', { name: 'On top', exact: true });
  const desktop = card.getByRole('button', { name: 'Desktop', exact: true });

  await expect(onTop).toHaveAttribute('aria-pressed', 'true');
  await desktop.click();
  await expect(desktop).toHaveAttribute('aria-pressed', 'true');
  await expect(onTop).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await widgets(app!))[0]?.mode).toBe('desktop');

  await onTop.click();
  await expect.poll(async () => (await widgets(app!))[0]?.mode).toBe('top');
});

test('a fresh install comes with the example animations in the library, switched off', async () => {
  delete env.GIFENGINE_NO_EXAMPLES;
  app = await launchBackground();
  const names = async () =>
    ((await app!.evaluate(() => (globalThis as any).__gifengine.items())) as { name: string; hidden: boolean }[])
      .map((i) => `${i.name}:${i.hidden ? 'off' : 'on'}`)
      .sort();
  await expect.poll(names, { timeout: 20_000 }).toEqual(['gifengine-blob.webp:off', 'hatsune-miku.webp:off', 'kasane-teto.webp:off']);
  expect((await widgets(app)).length).toBe(0);
  const paths = (await app.evaluate(() => (globalThis as any).__gifengine.items())) as { sourcePath: string }[];
  for (const p of paths) expect(p.sourcePath.startsWith(join(dir, 'userData', 'examples'))).toBe(true);

  await app.evaluate(() => (globalThis as any).__gifengine.flush());
  await app.close();
  app = await launchBackground();
  await expect.poll(async () => (await app!.evaluate(() => (globalThis as any).__gifengine.items())).length, { timeout: 20_000 }).toBe(3);
});
