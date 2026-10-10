import { describe, expect, it } from 'vitest';
import { clampScale, dragPosition, ensureVisible, fitScale, initialBounds, scaleAroundCenter } from '../../src/main/geometry';

const qhd = { x: 0, y: 0, width: 2560, height: 1440 };

describe('fitScale', () => {
  it('fits the longer side to a fraction of the shorter display side', () => {
    expect(fitScale({ width: 1080, height: 1440 }, qhd, 0.4)).toBeCloseTo(0.4);
  });

  it('never upscales small media', () => {
    expect(fitScale({ width: 40, height: 20 }, qhd, 0.4)).toBe(1);
  });
});

describe('initialBounds', () => {
  it('centres the scaled media in the work area', () => {
    expect(initialBounds({ width: 1080, height: 1440 }, qhd)).toEqual({ x: 1064, y: 432, width: 432, height: 576 });
  });

  it('respects a work area that does not start at the origin', () => {
    const second = { x: 2560, y: 100, width: 1920, height: 1080 };
    expect(initialBounds({ width: 100, height: 50 }, second)).toEqual({ x: 2560 + 910, y: 100 + 515, width: 100, height: 50 });
  });

  it('cascades later widgets by 48px each', () => {
    const a = initialBounds({ width: 100, height: 100 }, qhd, 0.4, 0);
    const c = initialBounds({ width: 100, height: 100 }, qhd, 0.4, 2);
    expect(c).toEqual({ ...a, x: a.x + 96, y: a.y + 96 });
  });

  it('never produces a zero-sized window', () => {
    const b = initialBounds({ width: 10_000, height: 1 }, qhd);
    expect(b.width).toBeGreaterThanOrEqual(1);
    expect(b.height).toBeGreaterThanOrEqual(1);
  });
});

describe('dragPosition', () => {
  it('moves the window by the pointer delta since drag start', () => {
    const start = { x: 100, y: 200, width: 50, height: 50 };
    expect(dragPosition(start, { x: 10, y: 10 }, { x: 25, y: -5 })).toEqual({ x: 115, y: 185 });
  });

  it('rounds fractional pointer positions', () => {
    const start = { x: 0, y: 0, width: 1, height: 1 };
    expect(dragPosition(start, { x: 0, y: 0 }, { x: 1.6, y: -1.6 })).toEqual({ x: 2, y: -2 });
  });
});

describe('scaleAroundCenter', () => {
  it('scales the rect keeping its centre fixed', () => {
    expect(scaleAroundCenter({ x: 100, y: 100, width: 200, height: 100 }, 1.5)).toEqual({ x: 50, y: 75, width: 300, height: 150 });
  });
});

describe('clampScale', () => {
  const natural = { width: 1080, height: 1440 };

  it('keeps the shorter rendered side at least 32px', () => {
    expect(clampScale(0.001, natural, 2560)).toBeCloseTo(32 / 1080);
  });

  it('keeps the longer rendered side at most twice the largest display side', () => {
    expect(clampScale(50, natural, 2560)).toBeCloseTo((2 * 2560) / 1440);
  });

  it('passes sensible values through', () => {
    expect(clampScale(0.4, natural, 2560)).toBe(0.4);
  });
});

describe('ensureVisible', () => {
  const displays = [
    { x: 0, y: 0, width: 2560, height: 1440 },
    { x: 2560, y: 0, width: 1920, height: 1080 },
  ];

  it('leaves a rect that overlaps any display alone', () => {
    const r = { x: 3000, y: 100, width: 200, height: 200 };
    expect(ensureVisible(r, displays)).toEqual(r);
  });

  it('centres an off-screen rect on the primary (first) display', () => {
    expect(ensureVisible({ x: 9000, y: 9000, width: 200, height: 100 }, displays)).toEqual({ x: 1180, y: 670, width: 200, height: 100 });
  });

  it('treats a rect that only touches an edge as off-screen', () => {
    expect(ensureVisible({ x: -200, y: 0, width: 200, height: 100 }, displays).x).toBe(1180);
  });
});
