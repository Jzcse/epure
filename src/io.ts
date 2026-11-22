/** 文件读写、SVG/PNG 导出，以及插入 Word/WPS 所需的数据包 */
import type { Layer, Shape, VgdDoc } from './types';
import { boundsOf } from './geometry';
import { documentMarkup, shapeBleed } from './shapes';
import { encodeDoc, makeDoc, parseDoc } from './doc';
import { bytesToB64, downloadBlob } from './util';

const PAD = 4;

export interface SvgOut {
  markup: string;
  width: number;
  height: number;
}

/** 生成独立 SVG 文件（视口裁到图形边界 + 线宽/箭头外扩） */
export function buildSvg(shapes: Shape[]): SvgOut {
  const b = boundsOf(shapes) ?? { x: 0, y: 0, w: 200, h: 100 };
  const pad = PAD + Math.max(0, ...shapes.map(shapeBleed));
  const x = Math.floor(b.x - pad);
  const y = Math.floor(b.y - pad);
  const width = Math.ceil(b.x + b.w + pad) - x;
  const height = Math.ceil(b.y + b.h + pad) - y;
  const markup =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">` +
    documentMarkup(shapes) +
    '</svg>';
  return { markup, width, height };
}

/** SVG → PNG。background 为 null 时保持透明 */
export async function rasterize(svg: SvgOut, scale: number, background: string | null): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg.markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG 渲染失败'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(svg.width * scale);
    canvas.height = Math.round(svg.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布');
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG 编码失败');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function saveDocument(shapes: Shape[], layers?: Layer[]): void {
  const data = JSON.stringify(makeDoc(shapes, undefined, layers), null, 2);
  downloadBlob(new Blob([data], { type: 'application/json' }), 'diagram.vgd.json');
}

export async function readDocument(file: File): Promise<VgdDoc> {
  return parseDoc(JSON.parse(await file.text()));
}

export function exportSvg(shapes: Shape[]): void {
  downloadBlob(new Blob([buildSvg(shapes).markup], { type: 'image/svg+xml' }), 'diagram.svg');
}

export async function exportPng(shapes: Shape[], scale = 2): Promise<void> {
  downloadBlob(await rasterize(buildSvg(shapes), scale, '#ffffff'), 'diagram.png');
}

/** 插入文档用的数据包（宿主无关） */
export interface InsertPayload {
  /** SVG 文本 */
  svg: string;
  /** PNG（base64，无 data: 前缀），用于不支持 SVG 的场合 */
  png: string;
  /** 图形逻辑尺寸（CSS 像素，96 DPI） */
  width: number;
  height: number;
  /** 存入图片可选文字的源数据（VGD2z:...） */
  data: string;
}

/**
 * shapes：要画出来的图形（可见图层，按图层顺序）；
 * all / layers：完整文档（含隐藏图层），存入可选文字以便再次编辑时完整恢复
 */
export async function buildInsertPayload(shapes: Shape[], all: Shape[] = shapes, layers?: Layer[], pngScale = 3): Promise<InsertPayload> {
  const svg = buildSvg(shapes);
  const png = await rasterize(svg, pngScale, null);
  return {
    svg: svg.markup,
    png: bytesToB64(new Uint8Array(await png.arrayBuffer())),
    width: svg.width,
    height: svg.height,
    data: await encodeDoc(makeDoc(all, { w: svg.width, h: svg.height }, layers)),
  };
}
