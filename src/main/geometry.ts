import type { Point } from '../shared/ipc';

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

const CASCADE_PX = 48;

export function fitScale(natural: Size, area: Size, fraction = 0.4): number {
  const target = fraction * Math.min(area.width, area.height);
  return Math.min(1, target / Math.max(natural.width, natural.height));
}

export function initialBounds(natural: Size, workArea: Rect, fraction = 0.4, index = 0): Rect {
  const scale = fitScale(natural, workArea, fraction);
  const width = Math.max(1, Math.round(natural.width * scale));
  const height = Math.max(1, Math.round(natural.height * scale));
  const offset = index * CASCADE_PX;
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2) + offset,
    y: workArea.y + Math.round((workArea.height - height) / 2) + offset,
    width,
    height,
  };
}

export function dragPosition(start: Rect, startPointer: Point, pointer: Point): Point {
  return {
    x: start.x + Math.round(pointer.x - startPointer.x),
    y: start.y + Math.round(pointer.y - startPointer.y),
  };
}

export function scaleAroundCenter(r: Rect, factor: number): Rect {
  const width = Math.max(1, Math.round(r.width * factor));
  const height = Math.max(1, Math.round(r.height * factor));
  return {
    x: Math.round(r.x + (r.width - width) / 2),
    y: Math.round(r.y + (r.height - height) / 2),
    width,
    height,
  };
}

const MIN_SIDE_PX = 32;

export function clampScale(scale: number, natural: Size, maxDisplaySide: number): number {
  const min = MIN_SIDE_PX / Math.min(natural.width, natural.height);
  const max = (2 * maxDisplaySide) / Math.max(natural.width, natural.height);
  return Math.min(max, Math.max(min, scale));
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function ensureVisible(r: Rect, displays: readonly Rect[]): Rect {
  if (displays.length === 0 || displays.some((d) => overlaps(r, d))) return r;
  const p = displays[0]!;
  return {
    ...r,
    x: p.x + Math.round((p.width - r.width) / 2),
    y: p.y + Math.round((p.height - r.height) / 2),
  };
}
