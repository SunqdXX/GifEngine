import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { MediaKind } from '../../shared/ipc';

export const LayerSchema = z.enum(['wallpaper', 'normal', 'top', 'overFullscreen']);

export const WidgetSchema = z.object({
  id: z.string().min(1),
  sourcePath: z.string().min(1),
  playPath: z.string().nullable().default(null),
  kind: z.enum(['image', 'video']),
  x: z.number().default(0),
  y: z.number().default(0),
  displayId: z.number().nullable().default(null),
  naturalWidth: z.number().min(0).default(0),
  naturalHeight: z.number().min(0).default(0),
  scale: z.number().positive().default(1),
  flipH: z.boolean().default(false),
  flipV: z.boolean().default(false),
  opacity: z.number().min(0.05).max(1).default(1),
  layer: LayerSchema.default('overFullscreen'),
  z: z.number().int().default(0),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  speed: z.number().min(0.25).max(4).default(1),
  volume: z.number().min(0).max(1).default(1),
  muted: z.boolean().default(true),
  chroma: z
    .object({
      enabled: z.boolean().default(false),
      color: z.string().default('#00ff00'),
      tolerance: z.number().min(0).max(1).default(0.3),
      softness: z.number().min(0).max(1).default(0.1),
    })
    .prefault({}),
});

export const SettingsSchema = z.object({
  editShortcut: z.string().default('CommandOrControl+Alt+G'),
  ffmpegPath: z.string().nullable().default(null),
  launchAtStartup: z.boolean().default(false),
});

const EnvelopeSchema = z.object({
  version: z.literal(1).default(1),
  settings: SettingsSchema.prefault({}),
  widgets: z.array(z.unknown()).default([]),
});

export type Widget = z.infer<typeof WidgetSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export interface Config {
  version: 1;
  settings: Settings;
  widgets: Widget[];
}

export function parseConfig(raw: unknown): { config: Config; dropped: number } {
  const input = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const envelope = EnvelopeSchema.safeParse(input);
  const base = envelope.success ? envelope.data : EnvelopeSchema.parse({});
  const widgets: Widget[] = [];
  let dropped = 0;
  for (const w of base.widgets) {
    const parsed = WidgetSchema.safeParse(w);
    if (parsed.success) widgets.push(parsed.data);
    else dropped++;
  }
  return { config: { version: 1, settings: base.settings, widgets }, dropped };
}

export function newWidget(sourcePath: string, kind: MediaKind): Widget {
  return WidgetSchema.parse({ id: randomUUID(), sourcePath, kind });
}
