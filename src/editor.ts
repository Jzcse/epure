import type { Kind, Layer, Shape } from './types';
import { getTool, TOOL_KEYS, type ToolDef } from './tools';
import { simplify, uid } from './util';
import { History } from './history';
import { renderDocument, renderOverlay, renderSnap } from './render';
import { collectKeyPoints, keyPoints, nearestKey, snapMove, SNAP_PX, type KeyPoint } from './snap';
import {
  applyResize, boundsOf, centerOf, fitText, hitTest, lineEnds, LINE_HEIGHT, withPoints,
  type Box, type HandleId, type Pt, type ResizeHandle,
} from './geometry';

export type AlignKind = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

type Drag =
  | { mode: 'move'; start: Pt; orig: Map<string, Shape>; keys: KeyPoint[]; targets: KeyPoint[] }
  | { mode: 'endpoint'; idx: 0 | 1; orig: Shape; fixed: Pt; targets: KeyPoint[] }
  | { mode: 'resize'; handle: ResizeHandle; orig: Shape }
  | { mode: 'rotate'; orig: Shape }
  | { mode: 'marquee'; start: Pt; cur: Pt }
  | { mode: 'shape'; id: string; tool: ToolDef; start: Pt; targets: KeyPoint[] }
  | { mode: 'pen'; id: string; pts: Pt[] }
  | { mode: 'pan'; sx: number; sy: number; ox: number; oy: number };

/** 视图：屏幕坐标 = 世界坐标 * z + (x, y) */
export interface View { x: number; y: number; z: number }

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
const GRID = 20;
const FIT_MARGIN = 60;
const DBL_MS = 450;

/** 撤销/重做快照：图形与图层一起记录 */
interface Snap { shapes: Shape[]; layers: Layer[] }

export function defaultLayer(): Layer {
  return { id: 'L1', name: '图层 1', visible: true, locked: false };
}

const HIT_TOL = 4;
const PASTE_STEP = 20;
const SNAP = Math.PI / 12;

function rectFrom(a: Pt, b: Pt): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

function intersects(a: Box, b: Box): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

function normDeg(d: number): number {
  return ((d % 360) + 360) % 360;
}

/** Shift：从 a 指向 p 的方向约束到 15° 的整数倍 */
function constrainAngle(a: Pt, p: Pt): Pt {
  const dx = p.x - a.x;
  const dy = p.y - a.y;
  const len = Math.hypot(dx, dy);
  const ang = Math.round(Math.atan2(dy, dx) / SNAP) * SNAP;
  return { x: a.x + len * Math.cos(ang), y: a.y + len * Math.sin(ang) };
}

function shapeFromPointer(s: Shape, tool: ToolDef, start: Pt, p: Pt, shift: boolean): Shape {
  const constrain = shift || !!tool.square;
  if (tool.mode === 'line') {
    return withPoints(s, [start, constrain ? constrainAngle(start, p) : p]);
  }
  let dx = p.x - start.x;
  let dy = p.y - start.y;
  if (constrain) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * m;
    dy = (dy < 0 ? -1 : 1) * m;
  }
  const box = { x: Math.min(start.x, start.x + dx), y: Math.min(start.y, start.y + dy), w: Math.abs(dx), h: Math.abs(dy) };
  if (tool.poly) {
    return { ...s, ...box, points: tool.poly.map(([u, v]): [number, number] => [u * box.w, v * box.h]) };
  }
  return { ...s, ...box };
}

export class Editor {
  shapes: Shape[] = [];
  selected = new Set<string>();
  /** 当前工具 id（见 tools.ts） */
  tool = 'select';
  onChange: () => void = () => {};

  /** 图层（下标 0 在最底层） */
  layers: Layer[] = [defaultLayer()];
  /** 当前图层：新绘制、粘贴的对象放在这里 */
  activeLayer = 'L1';
  /** 提示信息（由界面显示为浮动提示） */
  onNotice: (msg: string) => void = () => {};
  private readonly history = new History<Snap>({ shapes: [], layers: this.layers });
  private defaults: Partial<Shape> = {
    stroke: '#000000', strokeWidth: 1.5, dash: 'solid', fill: null, fillType: 'solid', opacity: 1,
    arrowStart: 'none', arrowEnd: 'none', arrowSize: 1,
    fontFamily: 'Times New Roman', fontSize: 20, color: '#000000', bold: false, italic: false, math: true,
  };
  private drag: Drag | null = null;
  private clipboard: Shape[] = [];
  private pasteCount = 0;
  private editingId: string | null = null;
  private lastDown: { t: number; x: number; y: number; id: string } | null = null;
  /** 是否启用关键点吸附（按住 Alt 临时关闭） */
  snapEnabled = true;
  private snapHit: KeyPoint | null = null;
  private readonly snapLayer: SVGGElement;
  private readonly content: SVGGElement;
  private readonly overlay: SVGGElement;
  private readonly viewport: SVGGElement;
  private readonly stage: HTMLElement;
  /** 无限画布的视图（平移 + 缩放） */
  view: View = { x: FIT_MARGIN, y: FIT_MARGIN, z: 1 };

  constructor(private readonly svg: SVGSVGElement, private readonly textarea: HTMLTextAreaElement) {
    this.content = svg.querySelector('#content') as SVGGElement;
    this.overlay = svg.querySelector('#overlay') as SVGGElement;
    this.snapLayer = svg.querySelector('#snap') as SVGGElement;
    this.viewport = svg.querySelector('#viewport') as SVGGElement;
    this.stage = svg.parentElement as HTMLElement;
    svg.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    svg.addEventListener('pointermove', (e) => this.onPointerMove(e));
    svg.addEventListener('pointerleave', () => { if (!this.drag) this.setSnap(null); });
    svg.addEventListener('pointerup', () => this.onPointerUp());
    svg.addEventListener('pointercancel', () => this.onPointerUp());
    // 阻止 mousedown 默认行为：否则浏览器会把焦点从刚弹出的文字输入框移走（导致无法输入文字）
    svg.addEventListener('mousedown', (e) => e.preventDefault());
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    svg.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    textarea.addEventListener('keydown', (e) => this.onTextKey(e));
    textarea.addEventListener('input', () => this.autosizeText());
    textarea.addEventListener('blur', () => this.finishText());
    this.applyView();
    this.render();
  }

  /* ---------- 视图（无限画布）---------- */

  /** 屏幕坐标（相对画布左上角）→ 世界坐标 */
  private toWorld(sx: number, sy: number): Pt {
    const v = this.view;
    return { x: (sx - v.x) / v.z, y: (sy - v.y) / v.z };
  }

  private applyView(): void {
    const v = this.view;
    this.viewport.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.z})`);
    const g = GRID * v.z;
    const st = this.stage.style;
    st.backgroundSize = g >= 6 ? `${g}px ${g}px` : `${g * 5}px ${g * 5}px`;
    st.backgroundPosition = `${v.x}px ${v.y}px`;
    if (this.editingId) this.placeTextarea();
  }

  setView(v: View): void {
    this.view = { x: v.x, y: v.y, z: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z)) };
    this.applyView();
    this.render();
    this.onChange();
  }

  /** 以屏幕点 (sx, sy) 为中心缩放，缺省为画布中心 */
  zoomAt(factor: number, sx?: number, sy?: number): void {
    const r = this.svg.getBoundingClientRect();
    const cx = sx ?? r.width / 2;
    const cy = sy ?? r.height / 2;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.view.z * factor));
    const w = this.toWorld(cx, cy);
    this.setView({ x: cx - w.x * z, y: cy - w.y * z, z });
  }

  /** 让所有图形显示在窗口中（不放大超过 100%） */
  fitView(): void {
    const r = this.svg.getBoundingClientRect();
    const b = boundsOf(this.visibleShapes);
    if (!b || r.width < 10 || r.height < 10) {
      this.setView({ x: FIT_MARGIN, y: FIT_MARGIN, z: 1 });
      return;
    }
    const fit = Math.min(1, (r.width - FIT_MARGIN * 2) / Math.max(b.w, 1), (r.height - FIT_MARGIN * 2) / Math.max(b.h, 1));
    const z = Math.max(MIN_ZOOM, fit);
    this.setView({ x: r.width / 2 - (b.x + b.w / 2) * z, y: r.height / 2 - (b.y + b.h / 2) * z, z });
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const r = this.svg.getBoundingClientRect();
    // 滚轮缩放（以鼠标位置为中心）；画布平移用右键/中键拖动
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    this.zoomAt(Math.exp(-Math.max(-300, Math.min(300, dy)) * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  get selectedShapes(): Shape[] {
    return this.shapes.filter((s) => this.selected.has(s.id));
  }

  get current(): Partial<Shape> {
    return this.selectedShapes[0] ?? this.defaults;
  }

  setTool(t: string): void {
    this.finishText();
    this.tool = t;
    this.refresh();
  }

  load(shapes: Shape[], layers?: Layer[]): void {
    this.finishText();
    this.layers = layers?.length ? layers : [defaultLayer()];
    this.activeLayer = this.layers[this.layers.length - 1].id;
    this.shapes = shapes.map((s) => (s.kind === 'text' ? fitText(s) : s));
    this.selected = new Set();
    this.commit();
    this.fitView();
  }

  /** 结束正在进行的文字编辑（插入文档前调用） */
  commitText(): void {
    this.finishText();
  }

  undo(): void {
    this.finishText();
    this.restore(this.history.undo());
  }

  redo(): void {
    this.finishText();
    this.restore(this.history.redo());
  }

  applyProps(patch: Partial<Shape>, key: string): void {
    this.defaults = { ...this.defaults, ...patch };
    if (this.selected.size) {
      const ids = this.selected;
      this.shapes = this.shapes.map((s) => {
        if (!ids.has(s.id)) return s;
        const next = { ...s, ...patch };
        return next.kind === 'text' ? fitText(next) : next;
      });
      this.commit(key);
    }
    this.refresh();
  }

  selectAll(): void {
    this.selected = new Set(this.shapes.filter((s) => this.isSelectable(s)).map((s) => s.id));
    this.refresh();
  }

  deleteSelected(): void {
    if (!this.selected.size) return;
    const ids = this.selected;
    this.shapes = this.shapes.filter((s) => !ids.has(s.id));
    this.selected = new Set();
    this.commit();
    this.refresh();
  }

  copy(): void {
    if (!this.selected.size) return;
    this.clipboard = this.selectedShapes;
    this.pasteCount = 0;
    this.onChange();
  }

  cut(): void {
    if (!this.selected.size) return;
    this.copy();
    this.deleteSelected();
  }

  paste(): void {
    if (!this.clipboard.length) return;
    if (!this.canDraw()) return;
    this.pasteCount += 1;
    this.insertCopies(this.clipboard.map((s) => ({ ...s, layer: this.activeLayer })), PASTE_STEP * this.pasteCount);
  }

  duplicate(): void {
    if (!this.selected.size) return;
    this.insertCopies(this.selectedShapes, PASTE_STEP);
  }

  get hasClipboard(): boolean {
    return this.clipboard.length > 0;
  }

  /** 对齐（至少选中 2 个对象），以选区包围盒为基准 */
  align(kind: AlignKind): void {
    const sel = this.selectedShapes;
    const all = boundsOf(sel);
    if (sel.length < 2 || !all) return;
    const ids = this.selected;
    this.shapes = this.shapes.map((s) => {
      if (!ids.has(s.id)) return s;
      const b = boundsOf([s])!;
      let dx = 0;
      let dy = 0;
      switch (kind) {
        case 'left': dx = all.x - b.x; break;
        case 'center': dx = all.x + all.w / 2 - (b.x + b.w / 2); break;
        case 'right': dx = all.x + all.w - (b.x + b.w); break;
        case 'top': dy = all.y - b.y; break;
        case 'middle': dy = all.y + all.h / 2 - (b.y + b.h / 2); break;
        case 'bottom': dy = all.y + all.h - (b.y + b.h); break;
      }
      return dx || dy ? { ...s, x: s.x + dx, y: s.y + dy } : s;
    });
    this.commit();
    this.refresh();
  }

  /** 水平 / 垂直翻转选中对象（多选时以整体中心为轴）；文字只镜像位置，不镜像字形 */
  flip(horizontal: boolean): void {
    const sel = this.selectedShapes;
    const all = boundsOf(sel);
    if (!sel.length || !all) return;
    const gx = all.x + all.w / 2;
    const gy = all.y + all.h / 2;
    const ids = this.selected;
    this.shapes = this.shapes.map((s) => {
      if (!ids.has(s.id)) return s;
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      const ncx = horizontal ? 2 * gx - cx : cx;
      const ncy = horizontal ? cy : 2 * gy - cy;
      const points = s.kind === 'text' ? s.points : s.points?.map(([px, py]): [number, number] => (horizontal ? [s.w - px, py] : [px, s.h - py]));
      return { ...s, x: ncx - s.w / 2, y: ncy - s.h / 2, rot: s.rot ? normDeg(-s.rot) : 0, points };
    });
    this.commit();
    this.refresh();
  }

  nudge(dx: number, dy: number): void {
    if (!this.selected.size) return;
    const ids = this.selected;
    this.shapes = this.shapes.map((s) => (ids.has(s.id) ? { ...s, x: s.x + dx, y: s.y + dy } : s));
    this.commit('nudge');
    this.refresh();
  }

  reorder(front: boolean): void {
    if (!this.selected.size) return;
    const sel = this.selectedShapes;
    const rest = this.shapes.filter((s) => !this.selected.has(s.id));
    this.shapes = front ? [...rest, ...sel] : [...sel, ...rest];
    this.commit();
    this.refresh();
  }

  private insertCopies(src: Shape[], offset: number): void {
    const copies = src.map((s) => ({ ...s, id: uid(), x: s.x + offset, y: s.y + offset }));
    this.shapes = [...this.shapes, ...copies];
    this.selected = new Set(copies.map((c) => c.id));
    this.commit();
    this.refresh();
  }

  private restore(s: Snap | null): void {
    if (!s) return;
    this.shapes = s.shapes;
    this.layers = s.layers;
    if (!this.layers.some((l) => l.id === this.activeLayer)) this.activeLayer = this.layers[this.layers.length - 1].id;
    this.refresh();
  }

  private commit(key?: string): void {
    const p = this.history.present;
    if (this.shapes !== p.shapes || this.layers !== p.layers) this.history.commit({ shapes: this.shapes, layers: this.layers }, key);
  }

  /* ---------- 图层 ---------- */

  /** 图形所属图层 id（无效时归入最底层） */
  layerIdOf(s: Shape): string {
    return s.layer && this.layers.some((l) => l.id === s.layer) ? s.layer : this.layers[0].id;
  }

  private layerById(id: string): Layer | undefined {
    return this.layers.find((l) => l.id === id);
  }

  /** 按图层顺序排列的全部图形（底 → 顶） */
  get orderedShapes(): Shape[] {
    const byLayer = new Map<string, Shape[]>(this.layers.map((l) => [l.id, []]));
    for (const s of this.shapes) byLayer.get(this.layerIdOf(s))!.push(s);
    return this.layers.flatMap((l) => byLayer.get(l.id)!);
  }

  /** 可见图层中的图形（绘制、导出、插入文档用） */
  get visibleShapes(): Shape[] {
    const hidden = new Set(this.layers.filter((l) => !l.visible).map((l) => l.id));
    return this.orderedShapes.filter((s) => !hidden.has(this.layerIdOf(s)));
  }

  /** 可见且未锁定的图层中的图形才能被选中 */
  isSelectable(s: Shape): boolean {
    const l = this.layerById(this.layerIdOf(s));
    return !!l && l.visible && !l.locked;
  }

  /** 每个图层的对象数 */
  layerCounts(): Map<string, number> {
    const m = new Map<string, number>(this.layers.map((l) => [l.id, 0]));
    for (const s of this.shapes) m.set(this.layerIdOf(s), (m.get(this.layerIdOf(s)) ?? 0) + 1);
    return m;
  }

  /** 当前图层可以绘制吗（隐藏或锁定时不行，并给出提示） */
  private canDraw(): boolean {
    const l = this.layerById(this.activeLayer);
    if (!l) return false;
    if (!l.visible || l.locked) {
      this.onNotice(`当前图层“${l.name}”已${!l.visible ? '隐藏' : '锁定'}，请先${!l.visible ? '显示' : '解锁'}或切换图层`);
      return false;
    }
    return true;
  }

  private setLayers(layers: Layer[]): void {
    this.layers = layers;
    this.commit();
    this.refresh();
  }

  setActiveLayer(id: string): void {
    if (!this.layerById(id) || id === this.activeLayer) return;
    this.activeLayer = id;
    this.refresh();
  }

  /** 在当前图层之上新建图层，并设为当前图层 */
  addLayer(): void {
    const nums = this.layers.map((l) => Number(/^图层 (\d+)$/.exec(l.name)?.[1] ?? 0));
    const layer: Layer = { id: uid(), name: `图层 ${Math.max(0, ...nums) + 1}`, visible: true, locked: false };
    const i = this.layers.findIndex((l) => l.id === this.activeLayer);
    const next = [...this.layers];
    next.splice(i + 1, 0, layer);
    this.activeLayer = layer.id;
    this.setLayers(next);
  }

  /** 删除图层及其中的全部对象（至少保留一个图层） */
  deleteLayer(id: string): void {
    if (this.layers.length <= 1) {
      this.onNotice('至少需要保留一个图层');
      return;
    }
    const i = this.layers.findIndex((l) => l.id === id);
    if (i < 0) return;
    this.shapes = this.shapes.filter((s) => this.layerIdOf(s) !== id);
    const next = this.layers.filter((l) => l.id !== id);
    if (this.activeLayer === id) this.activeLayer = next[Math.max(0, i - 1)].id;
    this.setLayers(next);
  }

  renameLayer(id: string, name: string): void {
    const n = name.trim();
    if (!n) return;
    this.setLayers(this.layers.map((l) => (l.id === id ? { ...l, name: n } : l)));
  }

  toggleLayerVisible(id: string): void {
    this.setLayers(this.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  }

  toggleLayerLock(id: string): void {
    this.setLayers(this.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)));
  }

  /** dir = 1 上移（更靠前），-1 下移 */
  moveLayer(id: string, dir: 1 | -1): void {
    const i = this.layers.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.layers.length) return;
    const next = [...this.layers];
    [next[i], next[j]] = [next[j], next[i]];
    this.setLayers(next);
  }

  /** 把选中对象移到指定图层 */
  moveSelectedToLayer(id: string): void {
    if (!this.selected.size || !this.layerById(id)) return;
    const ids = this.selected;
    this.shapes = this.shapes.map((s) => (ids.has(s.id) ? { ...s, layer: id } : s));
    this.commit();
    this.refresh();
  }

  /** 选中某图层的全部对象 */
  selectLayer(id: string): void {
    this.finishText();
    this.selected = new Set(this.shapes.filter((s) => this.layerIdOf(s) === id && this.isSelectable(s)).map((s) => s.id));
    this.refresh();
  }

  private render(): void {
    for (const id of [...this.selected]) {
      const s = this.shapes.find((x) => x.id === id);
      if (!s || (!this.isSelectable(s) && id !== this.editingId)) this.selected.delete(id);
    }
    const d = this.drag;
    const marquee = d && d.mode === 'marquee' ? rectFrom(d.start, d.cur) : null;
    this.svg.dataset.tool = getTool(this.tool).mode;
    renderDocument(this.content, this.visibleShapes, this.editingId);
    renderOverlay(this.overlay, this.selectedShapes, marquee, this.tool === 'select', this.view.z);
  }

  private refresh(): void {
    this.render();
    this.onChange();
  }

  private localPt(e: MouseEvent): Pt {
    const r = this.svg.getBoundingClientRect();
    return this.toWorld(e.clientX - r.left, e.clientY - r.top);
  }

  private base(kind: Kind, x: number, y: number): Shape {
    const d = this.defaults;
    return {
      id: uid(),
      kind,
      layer: this.activeLayer,
      x,
      y,
      w: 0,
      h: 0,
      rot: 0,
      stroke: d.stroke ?? '#000000',
      strokeWidth: d.strokeWidth ?? 2,
      dash: d.dash ?? 'solid',
      fill: d.fill ?? null,
      fillType: d.fillType ?? 'solid',
      opacity: d.opacity ?? 1,
      arrowStart: kind === 'line' || kind === 'path' ? d.arrowStart ?? 'none' : undefined,
      arrowEnd: kind === 'line' || kind === 'path' ? d.arrowEnd ?? 'none' : undefined,
      arrowSize: d.arrowSize ?? 1,
      text: kind === 'text' ? '' : undefined,
      fontFamily: d.fontFamily,
      fontSize: d.fontSize,
      color: d.color,
      bold: d.bold,
      italic: d.italic,
      math: d.math,
    };
  }

  private patch(id: string, fn: (s: Shape) => Shape): void {
    this.shapes = this.shapes.map((s) => (s.id === id ? fn(s) : s));
  }

  private onPointerDown(e: PointerEvent): void {
    // 右键 / 中键拖动画布
    if ((e.button === 2 || e.button === 1) && !this.drag) {
      e.preventDefault();
      this.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: this.view.x, oy: this.view.y };
      this.svg.classList.add('panning');
      this.svg.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0 || this.drag) return;
    // 画布不接收焦点：手动让属性面板里的输入框失焦，保证快捷键可用
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== this.textarea && active !== document.body) active.blur();
    this.finishText();
    const p = this.localPt(e);
    const handle = (e.target as Element).getAttribute('data-handle') as HandleId | null;

    if (handle && this.selected.size === 1) {
      const orig = this.selectedShapes[0];
      if (handle === 'p0' || handle === 'p1') {
        const idx = handle === 'p0' ? 0 : 1;
        const ends = lineEnds(orig);
        this.drag = { mode: 'endpoint', idx, orig, fixed: ends[1 - idx], targets: this.snapTargets(new Set([orig.id])) };
      } else {
        this.drag = handle === 'rot' ? { mode: 'rotate', orig } : { mode: 'resize', handle, orig };
      }
      this.svg.setPointerCapture(e.pointerId);
      return;
    }

    if (this.tool !== 'select' && !this.canDraw()) return;

    if (getTool(this.tool).mode === 'text') {
      this.createText(p);
      return;
    }

    if (this.tool !== 'select') {
      this.startDraw(p, e);
      this.svg.setPointerCapture(e.pointerId);
      return;
    }

    const hit = this.hitAt(p);
    if (!hit) {
      if (!e.shiftKey) this.selected = new Set();
      this.drag = { mode: 'marquee', start: p, cur: p };
      this.svg.setPointerCapture(e.pointerId);
      this.refresh();
      return;
    }

    if (e.shiftKey) {
      if (this.selected.has(hit.id)) this.selected.delete(hit.id);
      else this.selected.add(hit.id);
    } else if (!this.selected.has(hit.id)) {
      this.selected = new Set([hit.id]);
    }

    if (hit.kind === 'text' && !e.shiftKey && this.isDoubleClick(e, hit.id)) {
      this.lastDown = null;
      this.selected = new Set([hit.id]);
      this.startText(hit.id);
      return;
    }
    if (!this.selected.has(hit.id)) {
      this.refresh();
      return;
    }

    this.drag = {
      mode: 'move',
      start: p,
      orig: new Map(this.selectedShapes.map((s): [string, Shape] => [s.id, s])),
      keys: this.selectedShapes.flatMap(keyPoints),
      targets: this.snapTargets(this.selected),
    };
    this.svg.setPointerCapture(e.pointerId);
    this.refresh();
  }

  /* ---------- 吸附 ---------- */

  /** 吸附范围（世界坐标） */
  private get snapTol(): number {
    return SNAP_PX / this.view.z;
  }

  private snapOn(e: MouseEvent): boolean {
    return this.snapEnabled && !e.altKey;
  }

  private snapTargets(exclude: Set<string>): KeyPoint[] {
    return collectKeyPoints(this.visibleShapes, exclude);
  }

  /** 高亮将要吸附的关键点（无文字，仅高亮） */
  private setSnap(hit: KeyPoint | null): void {
    if (hit === this.snapHit || (hit && this.snapHit && hit.x === this.snapHit.x && hit.y === this.snapHit.y)) return;
    this.snapHit = hit;
    renderSnap(this.snapLayer, hit, this.view.z);
  }

  /** 绘图工具悬停时显示附近关键点与将要吸附的点 */
  private hoverSnap(e: PointerEvent): void {
    const mode = getTool(this.tool).mode;
    if (mode !== 'line' && mode !== 'box') {
      if (this.snapHit) this.setSnap(null);
      return;
    }
    const p = this.localPt(e);
    const keys = this.snapTargets(new Set());
    this.setSnap(this.snapOn(e) ? nearestKey(p, keys, this.snapTol) : null);
  }

  private hitAt(p: Pt): Shape | undefined {
    const tol = HIT_TOL / this.view.z;
    return [...this.visibleShapes].reverse().find((s) => this.isSelectable(s) && hitTest(s, p, tol));
  }

  /**
   * 自行判断双击：画布每次按下都会重绘，dblclick 的目标元素已被替换，浏览器可能不触发 dblclick；
   * pointerdown 的 detail 在部分内核中也恒为 0。
   */
  private isDoubleClick(e: PointerEvent, id: string): boolean {
    const last = this.lastDown;
    this.lastDown = { t: e.timeStamp, x: e.clientX, y: e.clientY, id };
    return !!last && last.id === id && e.timeStamp - last.t < DBL_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 6;
  }

  private onPointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) {
      this.hoverSnap(e);
      return;
    }
    if (d.mode === 'pan') {
      this.view = { ...this.view, x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy };
      this.applyView();
      return;
    }
    const p = this.localPt(e);
    switch (d.mode) {
      case 'marquee':
        d.cur = p;
        break;
      case 'move': {
        let dx = p.x - d.start.x;
        let dy = p.y - d.start.y;
        if (this.snapOn(e)) {
          const r = snapMove(d.keys, d.targets, dx, dy, this.snapTol);
          dx = r.dx;
          dy = r.dy;
          this.setSnap(r.hit);
        } else {
          this.setSnap(null);
        }
        this.shapes = this.shapes.map((s) => {
          const o = d.orig.get(s.id);
          return o ? { ...o, x: o.x + dx, y: o.y + dy } : s;
        });
        break;
      }
      case 'resize':
        this.patch(d.orig.id, () => applyResize(d.orig, d.handle, p, e.shiftKey));
        break;
      case 'rotate': {
        const c = centerOf(d.orig);
        let a = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90;
        if (e.shiftKey) a = Math.round(a / 15) * 15;
        const rot = normDeg(a);
        this.patch(d.orig.id, (s) => ({ ...s, rot }));
        break;
      }
      case 'shape': {
        const hit = this.snapOn(e) ? nearestKey(p, d.targets, this.snapTol) : null;
        this.setSnap(hit);
        // 吸附时终点精确落在关键点上（不再做 Shift 角度约束）
        this.patch(d.id, (s) => shapeFromPointer(s, d.tool, d.start, hit ?? p, !hit && e.shiftKey));
        break;
      }
      case 'endpoint': {
        const hit = this.snapOn(e) ? nearestKey(p, d.targets, this.snapTol) : null;
        this.setSnap(hit);
        let q: Pt = hit ?? p;
        if (!hit && e.shiftKey) q = constrainAngle(d.fixed, p);
        const pts = d.idx === 0 ? [q, d.fixed] : [d.fixed, q];
        this.patch(d.orig.id, (s) => withPoints({ ...s, rot: 0 }, pts));
        break;
      }
      case 'pen': {
        const last = d.pts[d.pts.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return;
        d.pts.push(p);
        this.patch(d.id, (s) => withPoints(s, d.pts));
        break;
      }
    }
    this.render();
  }

  private onPointerUp(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.setSnap(null);

    if (d.mode === 'pan') {
      this.svg.classList.remove('panning');
      return;
    }

    if (d.mode === 'marquee') {
      const r = rectFrom(d.start, d.cur);
      for (const s of this.shapes) {
        if (!this.isSelectable(s)) continue;
        const b = boundsOf([s]);
        if (b && intersects(b, r)) this.selected.add(s.id);
      }
      this.refresh();
      return;
    }

    if (d.mode === 'shape' || d.mode === 'pen') {
      const s = this.shapes.find((x) => x.id === d.id);
      if (s && Math.hypot(s.w, s.h) < 2) {
        this.shapes = this.shapes.filter((x) => x.id !== d.id);
      } else if (s) {
        if (d.mode === 'pen') {
          const pts = simplify(d.pts.map((q): [number, number] => [q.x, q.y]), 0.8).map(([x, y]) => ({ x, y }));
          this.patch(d.id, (x) => ({ ...withPoints(x, pts), smooth: pts.length > 2 }));
        }
        this.selected = new Set([d.id]);
      }
      this.tool = 'select';
    }

    this.commit();
    this.refresh();
  }

  private startDraw(p0: Pt, e: PointerEvent): void {
    const tool = getTool(this.tool);
    const targets = this.snapTargets(new Set());
    const startHit = tool.mode !== 'pen' && this.snapOn(e) ? nearestKey(p0, targets, this.snapTol) : null;
    const p = startHit ?? p0;
    if (tool.mode === 'pen') {
      const s = withPoints({ ...this.base('path', p.x, p.y), ...tool.props }, [p]);
      this.shapes = [...this.shapes, s];
      this.drag = { mode: 'pen', id: s.id, pts: [p] };
    } else {
      const kind: Kind = tool.mode === 'line' ? 'line' : tool.kind ?? 'rect';
      let s: Shape = { ...this.base(kind, p.x, p.y), ...tool.props };
      if (kind === 'line') s = withPoints(s, [p, p]);
      if (tool.poly) s = { ...s, closed: true, points: tool.poly.map((): [number, number] => [0, 0]) };
      this.shapes = [...this.shapes, s];
      this.drag = { mode: 'shape', id: s.id, tool, start: p, targets };
    }
    this.selected = new Set();
    this.render();
  }

  private createText(p: Pt): void {
    const s = fitText({ ...this.base('text', p.x, p.y), ...getTool(this.tool).props, text: '' });
    this.shapes = [...this.shapes, s];
    this.selected = new Set([s.id]);
    this.startText(s.id);
    this.tool = 'select';
  }

  private startText(id: string): void {
    const s = this.shapes.find((x) => x.id === id);
    if (!s) return;
    this.editingId = id;
    const ta = this.textarea;
    ta.value = s.text ?? '';
    ta.style.display = 'block';
    ta.style.fontFamily = `"${s.fontFamily ?? 'Times New Roman'}"`;
    ta.style.color = s.color ?? '#000000';
    ta.style.fontWeight = s.bold ? 'bold' : 'normal';
    ta.style.fontStyle = s.italic ? 'italic' : 'normal';
    this.placeTextarea();
    this.render();
    ta.focus();
    // 个别宿主（WPS 对话框）在本轮事件后仍可能抢焦点，下一帧再确认一次
    requestAnimationFrame(() => {
      if (this.editingId === id && document.activeElement !== ta) ta.focus();
    });
    this.onChange();
  }

  /** 把文字输入框放到正在编辑的文本位置（考虑平移缩放） */
  private placeTextarea(): void {
    const s = this.shapes.find((x) => x.id === this.editingId);
    if (!s) return;
    const v = this.view;
    const size = (s.fontSize ?? 20) * v.z;
    const ta = this.textarea;
    ta.style.left = `${v.x + s.x * v.z}px`;
    ta.style.top = `${v.y + s.y * v.z}px`;
    ta.style.fontSize = `${size}px`;
    ta.style.minWidth = `${Math.max(s.w * v.z, 80) + 16}px`;
    ta.style.minHeight = `${Math.max(s.h * v.z, size * LINE_HEIGHT) + 8}px`;
    this.autosizeText();
  }

  /** 输入时自动撑开输入框 */
  private autosizeText(): void {
    const ta = this.textarea;
    ta.style.width = '0px';
    ta.style.height = '0px';
    ta.style.width = `${ta.scrollWidth + 16}px`;
    ta.style.height = `${ta.scrollHeight + 4}px`;
  }

  private finishText(): void {
    const id = this.editingId;
    if (!id) return;
    this.editingId = null;
    const text = this.textarea.value;
    this.textarea.style.display = 'none';
    this.textarea.blur();
    if (text.trim() === '') {
      this.shapes = this.shapes.filter((s) => s.id !== id);
    } else {
      this.patch(id, (s) => fitText({ ...s, text }));
    }
    this.commit();
    this.refresh();
  }

  private onTextKey(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      this.finishText();
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || this.editingId) return;

    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    let handled = true;

    if (mod) {
      switch (key) {
        case 'z':
          if (e.shiftKey) this.redo();
          else this.undo();
          break;
        case 'y': this.redo(); break;
        case 'c': this.copy(); break;
        case 'x': this.cut(); break;
        case 'v': this.paste(); break;
        case 'd': this.duplicate(); break;
        case 'a': this.selectAll(); break;
        case '0': this.fitView(); break;
        case '=':
        case '+': this.zoomAt(1.25); break;
        case '-': this.zoomAt(0.8); break;
        default: handled = false;
      }
    } else if (!e.altKey && key in TOOL_KEYS) {
      this.setTool(TOOL_KEYS[key]);
    } else if (key === 'delete' || key === 'backspace') {
      this.deleteSelected();
    } else if (e.key.startsWith('Arrow')) {
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      this.nudge(dx, dy);
    } else if (e.key === 'Escape') {
      this.selected = new Set();
      this.setTool('select');
    } else if (e.key === '[') {
      this.reorder(false);
    } else if (e.key === ']') {
      this.reorder(true);
    } else {
      handled = false;
    }

    if (handled) e.preventDefault();
  }
}
