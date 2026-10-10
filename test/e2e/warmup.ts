import { _electron as electron } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { electronPath, PNG_40x20, ROOT, testEnv } from './fixtures';

export default async function warmup(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'gifengine-warmup-'));
  writeFileSync(join(dir, 'warmup.png'), PNG_40x20);
  const app = await electron.launch({
    executablePath: electronPath,
    args: [ROOT, '--ozone-platform=x11', '--background', 'warmup.png'],
    cwd: dir,
    env: testEnv(join(dir, 'userData')),
    timeout: 120_000,
  });
  try {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const visible = await app.evaluate(() => (globalThis as any).__gifengine?.widgets()[0]?.visible === true);
      if (visible) break;
      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    await app.close().catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
  }
}
