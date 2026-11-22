/**
 * 对象骨架（关键点）与吸附。
 * 每个图形提供若干关键点：线段两端与中点、矩形四角/边中点/中心、椭圆中心与四个象限点、多边形顶点与边中点。
 * 绘制、拖动端点或移动对象时，靠近其他图形的关键点会自动吸附（按住 Alt 临时关闭）。
 */
import type { Shape } from './types';
import { centerOf, rotatePt, type Pt } from './geometry';

export type KeyKind = 'end' | 'mid' | 'center' | 'corner' | 'quad' | 'vertex';

export interface KeyPoint extends Pt {
  kind: KeyKind;
  /** 所属图形 */
  id: string;
}

export const KEY_LABEL: Record<KeyKind, string> = {
  end: '端点', mid: '中点', center: '中心', corner: '角点', quad: '象限点', vertex: '顶点',
};

/** 吸附范围（屏幕像素，调用方换算为世界坐标） */
export const SNAP_PX = 8;

/** 图形的关键点（世界坐标，已考虑旋转） */
export function keyPoints(s: Shape): KeyPoint[] {
  const c = centerOf(s);
  const out: KeyPoint[] = [];
  const add = (x: number, y: number, kind: KeyKind) => {
    const p = rotatePt({ x, y }, c, s.rot);
    out.push({ x: p.x, y: p.y, kind, id: s.id });
  };
  switch (s.kind) {
    case 'line': {
      const pts = s.points ?? [];
      if (pts.length < 2) break;
      const [a, b] = [pts[0], pts[pts.length - 1]];
      add(s.x + a[0], s.y + a[1], 'end');
      add(s.x + b[0], s.y + b[1], 'end');
      add(s.x + (a[0] + b[0]) / 2, s.y + (a[1] + b[1]) / 2, 'mid');
      break;
    }
    case 'path': {
      const pts = s.points ?? [];
      if (!pts.length) break;
      if (s.closed) {
        pts.forEach(([px, py], i) => {
          add(s.x + px, s.y + py, 'vertex');
          if (!s.smooth) {
            const [qx, qy] = pts[(i + 1) % pts.length];
            add(s.x + (px + qx) / 2, s.y + (py + qy) / 2, 'mid');
          }
        });
        add(c.x, c.y, 'center');
      } else {
        // 开放曲线 / 画笔：只取两端
        add(s.x + pts[0][0], s.y + pts[0][1], 'end');
        const last = pts[pts.length - 1];
        add(s.x + last[0], s.y + last[1], 'end');
      }
      break;
    }
    case 'rect': {
      const { x, y, w, h } = s;
      add(x, y, 'corner'); add(x + w, y, 'corner'); add(x + w, y + h, 'corner'); add(x, y + h, 'corner');
      add(x + w / 2, y, 'mid'); add(x + w, y + h / 2, 'mid'); add(x + w / 2, y + h, 'mid'); add(x, y + h / 2, 'mid');
      add(c.x, c.y, 'center');
      break;
    }
    case 'ellipse': {
      add(c.x, c.y, 'center');
      add(c.x, s.y, 'quad'); add(s.x + s.w, c.y, 'quad'); add(c.x, s.y + s.h, 'quad'); add(s.x, c.y, 'quad');
      break;
    }
    case 'text':
      break;
  }
  return out;
}

/** 收集除 exclude 外所有图形的关键点 */
export function collectKeyPoints(shapes: Shape[], exclude: Set<string>): KeyPoint[] {
  const out: KeyPoint[] = [];
  for (const s of shapes) if (!exclude.has(s.id)) out.push(...keyPoints(s));
  return out;
}

/** 在 tol 范围内离 p 最近的关键点 */
export function nearestKey(p: Pt, keys: KeyPoint[], tol: number): KeyPoint | null {
  let best: KeyPoint | null = null;
  let bd = tol;
  for (const k of keys) {
    const d = Math.hypot(k.x - p.x, k.y - p.y);
    if (d <= bd) { bd = d; best = k; }
  }
  return best;
}

/**
 * 移动吸附：让 moving 中任一关键点（平移 dx,dy 后）吸到 targets 上，返回修正后的位移与吸附点。
 */
export function snapMove(moving: KeyPoint[], targets: KeyPoint[], dx: number, dy: number, tol: number):
  { dx: number; dy: number; hit: KeyPoint | null } {
  let best: { dx: number; dy: number; hit: KeyPoint } | null = null;
  let bd = tol;
  for (const m of moving) {
    const mx = m.x + dx;
    const my = m.y + dy;
    for (const t of targets) {
      const d = Math.hypot(t.x - mx, t.y - my);
      if (d <= bd) { bd = d; best = { dx: dx + t.x - mx, dy: dy + t.y - my, hit: t }; }
    }
  }
  return best ?? { dx, dy, hit: null };
}
