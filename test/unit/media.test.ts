import { describe, expect, it } from 'vitest';
import { kindFromPath, mimeFromPath, parseRange } from '../../src/main/media';

describe('kindFromPath', () => {
  it.each([
    ['a.webp', 'image'],
    ['A.WEBP', 'image'],
    ['x.apng', 'image'],
    ['x.gif', 'image'],
    ['x.jpeg', 'image'],
    ['clip.webm', 'video'],
    ['clip.MP4', 'video'],
    ['clip.mov', 'video'],
    ['clip.mkv', 'video'],
  ])('%s is %s', (path, kind) => {
    expect(kindFromPath(path)).toBe(kind);
  });

  it('rejects unknown or missing extensions', () => {
    expect(kindFromPath('notes.txt')).toBeNull();
    expect(kindFromPath('/dir.webp/noext')).toBeNull();
  });
});

describe('mimeFromPath', () => {
  it('maps known types', () => {
    expect(mimeFromPath('a.webp')).toBe('image/webp');
    expect(mimeFromPath('a.apng')).toBe('image/apng');
    expect(mimeFromPath('a.mov')).toBe('video/quicktime');
    expect(mimeFromPath('a.webm')).toBe('video/webm');
  });

  it('falls back to octet-stream', () => {
    expect(mimeFromPath('a.bin')).toBe('application/octet-stream');
  });
});

describe('parseRange', () => {
  it('returns null when there is no header (serve whole file)', () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange(undefined, 1000)).toBeNull();
  });

  it('parses open-ended and closed ranges', () => {
    expect(parseRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 });
    expect(parseRange('bytes=0-0', 1000)).toEqual({ start: 0, end: 0 });
  });

  it('clamps the end to the file size', () => {
    expect(parseRange('bytes=990-2000', 1000)).toEqual({ start: 990, end: 999 });
  });

  it('parses suffix ranges', () => {
    expect(parseRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999 });
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('reports unsatisfiable ranges', () => {
    expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=0-', 0)).toBe('unsatisfiable');
  });

  it('ignores malformed, reversed and multi-range headers', () => {
    expect(parseRange('bytes=abc', 1000)).toBeNull();
    expect(parseRange('bytes=-', 1000)).toBeNull();
    expect(parseRange('bytes=200-100', 1000)).toBeNull();
    expect(parseRange('bytes=0-1,5-6', 1000)).toBeNull();
    expect(parseRange('items=0-1', 1000)).toBeNull();
  });
});
