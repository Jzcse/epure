export type Kind = 'line' | 'rect' | 'ellipse' | 'path' | 'text';
export type Dash = 'solid' | 'dashed' | 'dotted' | 'dashdot' | 'long';
export type FillType = 'solid' | 'hatch' | 'hatch2' | 'cross' | 'dots' | 'grad';
export type Arrow = 'none' | 'tri' | 'stealth' | 'open' | 'dot' | 'circle' | 'bar';

export interface Shape {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  stroke: string;
  strokeWidth: number;
  dash: Dash;
  /** 填充颜色；null 表示无填充 */
  fill: string | null;
  /** 填充方式（图案、渐变），缺省为纯色 */
  fillType?: FillType;
  opacity: number;
  /** line / path：相对 (x, y) 的点 */
  points?: [number, number][];
  /** path：是否闭合、是否平滑 */
  closed?: boolean;
  smooth?: boolean;
  arrowStart?: Arrow;
  arrowEnd?: Arrow;
  arrowSize?: number;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  /** 公式模式：x^2、a_1、\alpha 等标记，字母自动斜体 */
  math?: boolean;
  /** 所属图层 id；缺省或无效时归入最底层 */
  layer?: string;
}

/** 图层：数组顺序即绘制顺序（下标 0 在最底层） */
export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

/** 文档（保存文件、嵌入 Word/WPS 图片的数据） */
export interface VgdDoc {
  format: 'vgd';
  version: 2;
  shapes: Shape[];
  /** 插入文档时的原始尺寸（CSS 像素），用于再次编辑时保持缩放比例 */
  size?: { w: number; h: number };
  layers?: Layer[];
}
