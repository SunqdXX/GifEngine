import { extname } from 'node:path';
import type { MediaKind } from '../shared/ipc';

const MIME: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.apng': 'image/apng',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
};

export function kindFromPath(path: string): MediaKind | null {
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime) return null;
  return mime.startsWith('image/') ? 'image' : 'video';
}

export function mimeFromPath(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

export type RangeResult = { start: number; end: number } | 'unsatisfiable' | null;

export function parseRange(header: string | null | undefined, size: number): RangeResult {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const a = m[1] ?? '';
  const b = m[2] ?? '';
  if (a === '' && b === '') return null;

  if (a === '') {
    const n = Number(b);
    if (n === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - n), end: size - 1 };
  }

  const start = Number(a);
  if (b !== '' && Number(b) < start) return null;
  if (start >= size) return 'unsatisfiable';
  const end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  return { start, end };
}
