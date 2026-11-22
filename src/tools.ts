/** 绘图工具注册表：编辑器行为与下方对象栏（图标、悬停提示、分类）都由此生成 */
import type { Kind, Shape } from './types';
import type { P2 } from './util';
import { TOOL_ICONS } from './icons';

/**
 * 绘制方式：
 *   select 选择；line 两点拖动；box 拖出包围盒（矩形/椭圆/多边形预设）；pen 自由画笔；text 点击输入
 */
export type DrawMode = 'select' | 'line' | 'box' | 'pen' | 'text';

export interface ToolDef {
  id: string;
  label: string;
  /** 悬停提示中的补充说明 */
  hint?: string;
  /** 单键快捷键（小写） */
  key?: string;
  mode: DrawMode;
  /** box 模式生成的图形种类 */
  kind?: Kind;
  /** 多边形预设：归一化到 [0,1] 包围盒的顶点（必须撑满 0 与 1） */
  poly?: P2[];
  /** 始终等宽高（正方形、圆） */
  square?: boolean;
  /** 覆盖默认样式的属性（如箭头、虚线、公式模式） */
  props?: Partial<Shape>;
}

/** 正多边形顶点，归一化到 [0,1] */
function regular(n: number, startDeg: number): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((startDeg + (360 * i) / n) * Math.PI) / 180;
    pts.push([Math.cos(a), Math.sin(a)]);
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  return pts.map(([x, y]): P2 => [(x - x0) / w, (y - y0) / h]);
}

const LIST: ToolDef[] = [
  { id: 'select', label: '选择', key: 'v', mode: 'select', hint: '单击选择，拖动框选，Shift 多选' },

  { id: 'line', label: '直线', key: 'l', mode: 'line', hint: 'Shift 约束 15° 角', props: { arrowStart: 'none', arrowEnd: 'none' } },
  { id: 'arrow', label: '箭头', key: 'a', mode: 'line', hint: 'Shift 约束 15° 角', props: { arrowStart: 'none', arrowEnd: 'tri' } },
  { id: 'arrow2', label: '双向箭头', mode: 'line', props: { arrowStart: 'tri', arrowEnd: 'tri' } },
  { id: 'dashed', label: '虚线', mode: 'line', props: { dash: 'dashed', arrowStart: 'none', arrowEnd: 'none' } },
  { id: 'pen', label: '自由画笔', key: 'p', mode: 'pen', hint: '松开后自动平滑' },

  { id: 'rect', label: '矩形', key: 'r', mode: 'box', kind: 'rect', hint: 'Shift 正方形' },
  { id: 'square', label: '正方形', mode: 'box', kind: 'rect', square: true },
  { id: 'ellipse', label: '椭圆', key: 'e', mode: 'box', kind: 'ellipse', hint: 'Shift 正圆' },
  { id: 'circle', label: '圆', mode: 'box', kind: 'ellipse', square: true },
  { id: 'triangle', label: '三角形', mode: 'box', kind: 'path', poly: [[0.5, 0], [1, 1], [0, 1]] },
  { id: 'rtriangle', label: '直角三角形', mode: 'box', kind: 'path', poly: [[0, 0], [1, 1], [0, 1]] },
  { id: 'parallelogram', label: '平行四边形', mode: 'box', kind: 'path', poly: [[0.25, 0], [1, 0], [0.75, 1], [0, 1]] },
  { id: 'trapezoid', label: '梯形', mode: 'box', kind: 'path', poly: [[0.25, 0], [0.75, 0], [1, 1], [0, 1]] },
  { id: 'rhombus', label: '菱形', mode: 'box', kind: 'path', poly: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]] },
  { id: 'pentagon', label: '正五边形', mode: 'box', kind: 'path', poly: regular(5, -90), square: true },
  { id: 'hexagon', label: '正六边形', mode: 'box', kind: 'path', poly: regular(6, 0), square: true },

  { id: 'text', label: '文字', key: 't', mode: 'text', hint: '单击画布输入；双击已有文字修改', props: { math: false } },
  { id: 'formula', label: '公式', key: 'f', mode: 'text', hint: 'x^2 上标  v_0 下标  \\alpha 希腊字母  \\vec{F} 矢量', props: { math: true } },
];

export const TOOLS: Record<string, ToolDef> = Object.fromEntries(LIST.map((t) => [t.id, t]));
export const TOOL_KEYS: Record<string, string> = Object.fromEntries(LIST.filter((t) => t.key).map((t) => [t.key!, t.id]));

export function getTool(id: string): ToolDef {
  return TOOLS[id] ?? TOOLS.select;
}

/** 对象栏分类（标签页） */
export const PALETTE: { id: string; label: string; icon: string; tools: string[] }[] = [
  { id: 'lines', label: '线条', icon: TOOL_ICONS.arrow, tools: ['line', 'arrow', 'arrow2', 'dashed', 'pen'] },
  {
    id: 'shapes', label: '图形', icon: TOOL_ICONS.triangle,
    tools: ['rect', 'square', 'ellipse', 'circle', 'triangle', 'rtriangle', 'parallelogram', 'trapezoid', 'rhombus', 'pentagon', 'hexagon'],
  },
];

/** 对象栏右侧常驻工具 */
export const PINNED = ['select', 'text', 'formula'];

/** 悬停提示文字 */
export function toolTip(t: ToolDef): string {
  return `${t.label}${t.key ? ` (${t.key.toUpperCase()})` : ''}${t.hint ? `\n${t.hint}` : ''}`;
}
