/** 图形 → SVG 标记（编辑器显示与导出/插入文档共用同一套输出） */
import type { Arrow, Dash, FillType, Shape } from './types';
import { esc, ptsPath, r2, smoothPath, type P2 } from './util';
import { textMarkup } from './mathtext';

export const ARROWS: [Arrow, string][] = [
  ['none', '无'], ['tri', '实心箭头'], ['stealth', '燕尾箭头'], ['open', '开放箭头'],
  ['dot', '实心圆点'], ['circle', '空心圆'], ['bar', '竖线'],
];
export const DASHES: [Dash, string][] = [
  ['solid', '实线'], ['dashed', '虚线'], ['dotted', '点线'], ['dashdot', '点划线'], ['long', '长虚线'],
];
export const FILLS: [FillType | 'none', string][] = [
  ['none', '无填充'], ['solid', '纯色'], ['hatch', '斜线'], ['hatch2', '反斜线'],
  ['cross', '网格'], ['dots', '点阵'], ['grad', '球面渐变'],
];

/** 渲染上下文：收集图案、渐变等 <defs> */
export class PaintCtx {
  private readonly used = new Map<string, string>();

  paint(kind: FillType, color: string): string {
    const id = `vgdp-${kind}-${color.replace(/[^0-9a-zA-Z]/g, '')}`;
    if (!this.used.has(id)) {
      const c = esc(color);
      const pat = (body: string, w = 6, h = 6, tr = '') =>
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${w}" height="${h}"${tr ? ` patternTransform="${tr}"` : ''}>${body}</pattern>`;
      let m = '';
      switch (kind) {
        case 'hatch': m = pat(`<line x1="0" y1="0" x2="0" y2="6" stroke="${c}" stroke-width="1"/>`, 6, 6, 'rotate(45)'); break;
        case 'hatch2': m = pat(`<line x1="0" y1="0" x2="0" y2="6" stroke="${c}" stroke-width="1"/>`, 6, 6, 'rotate(-45)'); break;
        case 'cross': m = pat(`<path d="M0,0V6M0,0H6" stroke="${c}" stroke-width="1"/>`, 6, 6, 'rotate(45)'); break;
        case 'dots': m = pat(`<circle cx="2.5" cy="2.5" r="0.9" fill="${c}"/>`, 5, 5); break;
        case 'grad':
          m = `<radialGradient id="${id}" cx="0.35" cy="0.32" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${c}"/></radialGradient>`;
          break;
        default: return color;
      }
      this.used.set(id, m);
    }
    return `url(#${id})`;
  }

  defs(): string {
    return this.used.size ? `<defs>${[...this.used.values()].join('')}</defs>` : '';
  }
}

export function dashArray(dash: Dash | undefined, sw: number): string {
  const w = Math.max(sw, 0.5);
  switch (dash) {
    case 'dashed': return `${r2(w * 4 + 2)},${r2(w * 2.5 + 1.5)}`;
    case 'dotted': return `0.01,${r2(w * 2.2 + 1)}`;
    case 'dashdot': return `${r2(w * 6 + 4)},${r2(w * 2 + 2)},0.01,${r2(w * 2 + 2)}`;
    case 'long': return `${r2(w * 8 + 6)},${r2(w * 3 + 3)}`;
    default: return '';
  }
}

function fillValue(s: Shape, ctx: PaintCtx): string {
  if (!s.fill) return 'none';
  const ft = s.fillType ?? 'solid';
  return ft === 'solid' ? s.fill : ctx.paint(ft, s.fill);
}

function strokeAttrs(s: Shape, fill: string): string {
  const sw = s.strokeWidth;
  let a = `stroke="${sw > 0 ? esc(s.stroke) : 'none'}" stroke-width="${r2(sw)}" stroke-linejoin="round" stroke-linecap="round"`;
  const dash = dashArray(s.dash, sw);
  if (dash) a += ` stroke-dasharray="${dash}"`;
  return a + ` fill="${esc(fill)}"`;
}

/** 箭头：tip 为尖端，ang 为指向（弧度）。返回标记与线段需要缩短的长度 */
function arrowHead(type: Arrow | undefined, tip: P2, ang: number, s: Shape): { m: string; cut: number } {
  const sw = s.strokeWidth;
  const col = esc(s.stroke);
  const sz = s.arrowSize ?? 1;
  const len = (6 + 2.6 * sw) * sz;
  const half = len * 0.36;
  const cs = Math.cos(ang);
  const sn = Math.sin(ang);
  const P = (dx: number, dy: number) => `${r2(tip[0] + dx * cs - dy * sn)},${r2(tip[1] + dx * sn + dy * cs)}`;
  switch (type) {
    case 'tri':
      return { m: `<polygon points="${P(0, 0)} ${P(-len, half)} ${P(-len, -half)}" fill="${col}" stroke="${col}" stroke-width="${r2(sw * 0.4)}" stroke-linejoin="round"/>`, cut: len * 0.85 };
    case 'stealth':
      return { m: `<polygon points="${P(0, 0)} ${P(-len * 1.1, half * 1.1)} ${P(-len * 0.75, 0)} ${P(-len * 1.1, -half * 1.1)}" fill="${col}" stroke="${col}" stroke-width="${r2(sw * 0.3)}" stroke-linejoin="round"/>`, cut: len * 0.7 };
    case 'open':
      return { m: `<polyline points="${P(-len, half)} ${P(0, 0)} ${P(-len, -half)}" fill="none" stroke="${col}" stroke-width="${r2(sw)}" stroke-linejoin="round" stroke-linecap="round"/>`, cut: sw * 0.5 };
    case 'dot': {
      const r = (1.6 + 1.3 * sw) * sz;
      return { m: `<circle cx="${r2(tip[0])}" cy="${r2(tip[1])}" r="${r2(r)}" fill="${col}"/>`, cut: 0 };
    }
    case 'circle': {
      const r = (2 + 1.3 * sw) * sz;
      return { m: `<circle cx="${r2(tip[0] - r * cs)}" cy="${r2(tip[1] - r * sn)}" r="${r2(r)}" fill="#fff" stroke="${col}" stroke-width="${r2(sw)}"/>`, cut: 2 * r };
    }
    case 'bar': {
      const [x1, y1] = P(0, -half * 1.4).split(',');
      const [x2, y2] = P(0, half * 1.4).split(',');
      return { m: `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${r2(sw)}" stroke-linecap="round"/>`, cut: 0 };
    }
    default:
      return { m: '', cut: 0 };
  }
}

/** 开放折线/曲线（含箭头），pts 为绝对坐标 */
function polyMarkup(s: Shape, ctx: PaintCtx, abs: P2[]): string {
  const closed = s.kind === 'path' && !!s.closed;
  const pts = abs.map((p): P2 => [p[0], p[1]]);
  let heads = '';
  if (!closed && pts.length >= 2) {
    const n = pts.length;
    const dir = (a: P2, b: P2) => Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (s.arrowEnd && s.arrowEnd !== 'none') {
      const ang = dir(pts[n - 2], pts[n - 1]);
      const h = arrowHead(s.arrowEnd, abs[n - 1], ang, s);
      heads += h.m;
      pts[n - 1] = [pts[n - 1][0] - h.cut * Math.cos(ang), pts[n - 1][1] - h.cut * Math.sin(ang)];
    }
    if (s.arrowStart && s.arrowStart !== 'none') {
      const ang = dir(pts[1], pts[0]);
      const h = arrowHead(s.arrowStart, abs[0], ang, s);
      heads += h.m;
      pts[0] = [pts[0][0] - h.cut * Math.cos(ang), pts[0][1] - h.cut * Math.sin(ang)];
    }
  }
  const d = s.smooth ? smoothPath(pts, closed) : ptsPath(pts, closed);
  return `<path d="${d}" ${strokeAttrs(s, closed ? fillValue(s, ctx) : 'none')}/>` + heads;
}

function centerOf(s: Shape): P2 {
  return [s.x + s.w / 2, s.y + s.h / 2];
}

/** 单个图形的 SVG 片段 */
export function shapeMarkup(s: Shape, ctx: PaintCtx): string {
  const [cx, cy] = centerOf(s);
  let body = '';
  switch (s.kind) {
    case 'line':
    case 'path':
      body = polyMarkup(s, ctx, (s.points ?? []).map(([px, py]): P2 => [s.x + px, s.y + py]));
      break;
    case 'rect':
      body = `<rect x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(s.w)}" height="${r2(s.h)}" ${strokeAttrs(s, fillValue(s, ctx))}/>`;
      break;
    case 'ellipse':
      body = `<ellipse cx="${r2(cx)}" cy="${r2(cy)}" rx="${r2(s.w / 2)}" ry="${r2(s.h / 2)}" ${strokeAttrs(s, fillValue(s, ctx))}/>`;
      break;
    case 'text':
      body = `<g transform="translate(${r2(s.x)},${r2(s.y)})">${textMarkup(s)}</g>`;
      break;
  }
  const tr = s.rot ? ` transform="rotate(${r2(s.rot)} ${r2(cx)} ${r2(cy)})"` : '';
  const op = s.opacity < 1 ? ` opacity="${r2(s.opacity)}"` : '';
  return `<g data-id="${esc(s.id)}"${tr}${op}>${body}</g>`;
}

/** 整个文档的内部标记（<defs> + 图形） */
export function documentMarkup(shapes: Shape[], hiddenId: string | null = null): string {
  const ctx = new PaintCtx();
  const body = shapes.filter((s) => s.id !== hiddenId).map((s) => shapeMarkup(s, ctx)).join('');
  return ctx.defs() + body;
}

/** 图形额外外扩量（线宽、箭头），用于导出边界 */
export function shapeBleed(s: Shape): number {
  const arrows = (s.arrowStart && s.arrowStart !== 'none') || (s.arrowEnd && s.arrowEnd !== 'none');
  const arrowR = arrows ? (6 + 2.6 * s.strokeWidth) * (s.arrowSize ?? 1) * 0.5 : 0;
  return Math.max(s.strokeWidth / 2, arrowR);
}
