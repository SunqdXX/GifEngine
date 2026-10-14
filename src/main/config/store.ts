import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseConfig, type Config } from './schema';

const SAVE_DEBOUNCE_MS = 500;

export class ConfigStore {
  lastLoadIssue: string | null = null;
  isNew = false;
  private pending: Config | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly file: string) {}

  load(): Config {
    this.lastLoadIssue = null;
    this.isNew = !existsSync(this.file);
    if (this.isNew) return parseConfig({}).config;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(this.file, 'utf8'));
    } catch {
      const aside = `${this.file}.corrupt-${Date.now()}`;
      renameSync(this.file, aside);
      this.lastLoadIssue = `config was corrupt; moved to ${aside} and started empty`;
      return parseConfig({}).config;
    }
    const { config, dropped } = parseConfig(raw);
    if (dropped > 0) this.lastLoadIssue = `${dropped} invalid widget entr${dropped === 1 ? 'y was' : 'ies were'} dropped`;
    return config;
  }

  scheduleSave(config: Config): void {
    this.pending = config;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SAVE_DEBOUNCE_MS);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.pending) return;
    const json = `${JSON.stringify(this.pending, null, 2)}\n`;
    this.pending = null;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}`;
    writeFileSync(tmp, json);
    renameSync(tmp, this.file);
  }
}
