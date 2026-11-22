import type { Shape } from './types';
import { LINE_HEIGHT, measureTextBox } from './mathtext';

export { LINE_HEIGHT };

export interface Pt {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot' | 'p0' | 'p1';
export type ResizeHandle = Exclude<HandleId, 'rot' | 'p0' | 'p1'>;

export const MIN_SIZE = 1;
export const ROT_OFFSET = 28;

const DIRS: Record<ResizeHandle, [number, number]> = {
  nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0],
  se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0],
};

export function centerOf(b: Box): Pt {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export function rotatePt(p: Pt, c: Pt, deg: number): Pt {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

export function corners(s: Shape): Pt[] {
  const c = centerOf(s);
  return [
    { x: s.x, y: s.y },
    { x: s.x + s.w, y: s.y },
    { x: s.x + s.w, y: s.y + s.h },
    { x: s.x, y: s.y + s.h },
  ].map((p) => rotatePt(p, c, s.rot));
}

export function boundsOf(shapes: Shape[]): Box | null {
  if (shapes.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of shapes) {
    for (const p of corners(s)) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function hitTest(s: Shape, p: Pt, tol: number): boolean {
  const c = centerOf(s);
  if (s.kind === 'line' || s.kind === 'path') {
    const pts = (s.points ?? []).map(([px, py]) => rotatePt({ x: s.x + px, y: s.y + py }, c, s.rot));
    const limit = tol + s.strokeWidth / 2;
    if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= limit;
    for (let i = 0; i + 1 < pts.length; i++) {
      if (distToSeg(p, pts[i], pts[i + 1]) <= limit) return true;
    }
    return false;
  }
  const q = rotatePt(p, c, -s.rot);
  return q.x >= s.x - tol && q.x <= s.x + s.w + tol && q.y >= s.y - tol && q.y <= s.y + s.h + tol;
}

/** rotOffset：旋转手柄距上边的距离（世界坐标，缩放时由调用方换算） */
/** 线段两端点（世界坐标，已考虑旋转） */
export function lineEnds(s: Shape): [Pt, Pt] {
  const pts = s.points ?? [[0, 0], [0, 0]];
  const c = centerOf(s);
  const a = pts[0];
  const b = pts[pts.length - 1];
  return [rotatePt({ x: s.x + a[0], y: s.y + a[1] }, c, s.rot), rotatePt({ x: s.x + b[0], y: s.y + b[1] }, c, s.rot)];
}

export function handlePos(s: Shape, id: Exclude<HandleId, 'p0' | 'p1'>, rotOffset = ROT_OFFSET): Pt {
  const c = centerOf(s);
  if (id === 'rot') return rotatePt({ x: c.x, y: s.y - rotOffset }, c, s.rot);
  const [dx, dy] = DIRS[id];
  return rotatePt({ x: c.x + (dx * s.w) / 2, y: c.y + (dy * s.h) / 2 }, c, s.rot);
}

export function resizeBox(orig: Shape, handle: ResizeHandle, p: Pt, keepRatio: boolean): Box {
  const [sx, sy] = DIRS[handle];
  const c = centerOf(orig);
  const fixed = rotatePt({ x: c.x - (sx * orig.w) / 2, y: c.y - (sy * orig.h) / 2 }, c, orig.rot);
  const local = rotatePt(p, fixed, -orig.rot);
  const dx = local.x - fixed.x;
  const dy = local.y - fixed.y;

  let w = sx ? Math.max(MIN_SIZE, sx * dx) : orig.w;
  let h = sy ? Math.max(MIN_SIZE, sy * dy) : orig.h;
  if (keepRatio && sx && sy && orig.w > 0 && orig.h > 0) h = (w * orig.h) / orig.w;

  const center = rotatePt(
    { x: fixed.x + (sx * w) / 2, y: fixed.y + (sy * h) / 2 },
    fixed,
    orig.rot,
  );
  return { x: center.x - w / 2, y: center.y - h / 2, w, h };
}

export function fitText(s: Shape): Shape {
  const m = measureTextBox(s);
  return { ...s, w: m.w, h: m.h };
}

export function withPoints(s: Shape, pts: Pt[]): Shape {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const q of pts) {
    x0 = Math.min(x0, q.x);
    y0 = Math.min(y0, q.y);
    x1 = Math.max(x1, q.x);
    y1 = Math.max(y1, q.y);
  }
  return {
    ...s,
    x: x0,
    y: y0,
    w: x1 - x0,
    h: y1 - y0,
    points: pts.map((q): [number, number] => [q.x - x0, q.y - y0]),
  };
}

export function applyResize(orig: Shape, handle: ResizeHandle, p: Pt, keepRatio: boolean): Shape {
  const box = resizeBox(orig, handle, p, keepRatio);
  if (orig.kind === 'text') {
    const ratio = orig.h > 0 ? box.h / orig.h : 1;
    const fontSize = Math.max(4, Math.round((orig.fontSize ?? 20) * ratio * 2) / 2);
    return fitText({ ...orig, fontSize, x: box.x, y: box.y });
  }
  if (orig.points) {
    const fx = orig.w > 0 ? box.w / orig.w : 1;
    const fy = orig.h > 0 ? box.h / orig.h : 1;
    return {
      ...orig,
      ...box,
      points: orig.points.map(([px, py]): [number, number] => [px * fx, py * fy]),
    };
  }
  return { ...orig, ...box };
}
