import { protocol } from 'electron';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { mimeFromPath, parseRange } from './media';

export const MEDIA_SCHEME = 'gifengine-media';

export type MediaLookup = (id: string) => string | undefined;

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

export function mediaUrl(id: string): string {
  return `${MEDIA_SCHEME}://media/${encodeURIComponent(id)}`;
}

export function handleMediaProtocol(lookup: MediaLookup): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const id = decodeURIComponent(new URL(request.url).pathname.slice(1));
    const path = lookup(id);
    if (!path) return new Response('not found', { status: 404 });

    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      return new Response('not found', { status: 404 });
    }

    const range = parseRange(request.headers.get('range'), size);
    if (range === 'unsatisfiable') {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const { start, end } = range ?? { start: 0, end: size - 1 };
    const headers: Record<string, string> = {
      'Content-Type': mimeFromPath(path),
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    };
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    const body = size === 0 ? null : (Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream<Uint8Array>);
    return new Response(body, { status: range ? 206 : 200, headers });
  });
}
