/** 编辑器画布渲染：文档层（复用 shapes.ts 标记）与选择框覆盖层 */
import type { Shape } from './types';
import { boundsOf, corners, handlePos, lineEnds, ROT_OFFSET, type Box, type HandleId } from './geometry';
import { keyPoints, type KeyPoint } from './snap';
import { documentMarkup } from './shapes';

export const NS = 'http://www.w3.org/2000/svg';
const ACCENT = '#2563eb';
const HANDLE_IDS: Exclude<HandleId, 'p0' | 'p1'>[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rot'];
const SNAP_COLOR = '#ea580c';
const CURSORS: Record<HandleId, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', rot: 'grab', p0: 'move', p1: 'move',
};

type Attrs = Record<string, string | number>;

export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export function renderDocument(layer: SVGGElement, shapes: Shape[], hiddenId: string | null): void {
  layer.innerHTML = documentMarkup(shapes, hiddenId);
}

/** zoom：当前缩放，选择框线宽与手柄大小保持屏幕上恒定 */
export function renderOverlay(layer: SVGGElement, selected: Shape[], marquee: Box | null, showHandles: boolean, zoom = 1): void {
  const nodes: SVGElement[] = [];
  const k = 1 / zoom;
  const hs = 4 * k;
  const ns = { 'vector-effect': 'non-scaling-stroke' };
  for (const s of selected) {
    const pts = corners(s).map((p) => `${p.x},${p.y}`).join(' ');
    nodes.push(svgEl('polygon', { ...ns, points: pts, fill: 'none', stroke: ACCENT, 'stroke-width': 1, 'pointer-events': 'none' }));
  }
  if (selected.length > 1) {
    const b = boundsOf(selected);
    if (b) {
      nodes.push(svgEl('rect', {
        ...ns, x: b.x, y: b.y, width: b.w, height: b.h,
        fill: 'none', stroke: ACCENT, 'stroke-dasharray': '4 3', 'pointer-events': 'none',
      }));
    }
  }
  if (showHandles && selected.length === 1 && selected[0].kind === 'line') {
    // 线段：两端点手柄（可拖动并吸附到其他图形的关键点）
    lineEnds(selected[0]).forEach((p, i) => {
      nodes.push(svgEl('circle', {
        ...ns, cx: p.x, cy: p.y, r: 5 * k, fill: '#fff', stroke: ACCENT, 'stroke-width': 1.5,
        'data-handle': i ? 'p1' : 'p0', style: 'cursor:move',
      }));
    });
  } else if (showHandles && selected.length === 1) {
    const s = selected[0];
    const top = handlePos(s, 'n');
    const rot = handlePos(s, 'rot', ROT_OFFSET * k);
    nodes.push(svgEl('line', { ...ns, x1: top.x, y1: top.y, x2: rot.x, y2: rot.y, stroke: ACCENT, 'pointer-events': 'none' }));
    for (const id of HANDLE_IDS) {
      const p = id === 'rot' ? rot : handlePos(s, id);
      if (id === 'rot') {
        nodes.push(svgEl('circle', {
          ...ns, cx: p.x, cy: p.y, r: 5 * k, fill: '#fff', stroke: ACCENT, 'stroke-width': 1.5,
          'data-handle': id, style: `cursor:${CURSORS[id]}`,
        }));
      } else {
        nodes.push(svgEl('rect', {
          ...ns, x: p.x - hs, y: p.y - hs, width: hs * 2, height: hs * 2, fill: '#fff', stroke: ACCENT, 'stroke-width': 1.5,
          transform: `rotate(${s.rot} ${p.x} ${p.y})`, 'data-handle': id, style: `cursor:${CURSORS[id]}`,
        }));
      }
    }
  }
  // 选中对象的关键点（骨架）：小实心点，叠在手柄之上、不拦截鼠标
  if (showHandles) {
    for (const s of selected) {
      for (const p of keyPoints(s)) {
        nodes.push(svgEl('circle', {
          ...ns, cx: p.x, cy: p.y, r: 2.6 * k, fill: SNAP_COLOR, stroke: '#fff', 'stroke-width': 1, 'pointer-events': 'none',
        }));
      }
    }
  }
  if (marquee) {
    nodes.push(svgEl('rect', {
      ...ns, x: marquee.x, y: marquee.y, width: marquee.w, height: marquee.h,
      fill: 'rgba(37,99,235,0.08)', stroke: ACCENT, 'stroke-dasharray': '4 3', 'pointer-events': 'none',
    }));
  }
  layer.replaceChildren(...nodes);
}

/** 关键点高亮：将要吸附的点（橙色实心点 + 外圈），参照几何画板的点高亮方式 */
export function renderSnap(layer: SVGGElement, hit: KeyPoint | null, zoom: number): void {
  if (!hit) {
    layer.replaceChildren();
    return;
  }
  const k = 1 / zoom;
  const ns = { 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' };
  layer.replaceChildren(
    svgEl('circle', { ...ns, cx: hit.x, cy: hit.y, r: 7 * k, fill: 'rgba(234,88,12,0.18)', stroke: SNAP_COLOR, 'stroke-width': 1.5 }),
    svgEl('circle', { ...ns, cx: hit.x, cy: hit.y, r: 3 * k, fill: SNAP_COLOR }),
  );
}
