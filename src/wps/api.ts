/**
 * WPS 文字（JS 加载项）文档操作。
 * WPS 的 API 与 Word VBA 对象模型一致（Application / Selection / InlineShapes），
 * 下标从 1 开始。图片需先写入临时文件再用 AddPicture 插入。
 */
import type { InsertPayload } from '../io';
import { decodeDoc, isEncodedDoc } from '../doc';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const PT_PER_PX = 0.75;
/** 先尝试插入 SVG（矢量），失败再插入 PNG */
const PREFER_SVG = true;
export const STORAGE_KEY = 'vgd2_edit';

export function wpsApp(): Any {
  const w = window as Any;
  const app = w.Application ?? w.wps?.WpsApplication?.() ?? w.wps?.Application;
  if (!app) throw new Error('未检测到 WPS 环境');
  return app;
}

function fileSystem(): Any {
  const fs = (window as Any).wps?.FileSystem;
  if (!fs) throw new Error('WPS FileSystem 接口不可用');
  return fs;
}

function tempDir(app: Any): string {
  const fs = fileSystem();
  let dir = '';
  try { dir = fs.tmpdir?.() ?? ''; } catch { /* 忽略 */ }
  if (!dir) {
    try { dir = app.Env?.GetTempPath?.() ?? ''; } catch { /* 忽略 */ }
  }
  if (!dir) throw new Error('无法获取临时目录');
  return dir.replace(/[\\/]+$/, '');
}

/** 当前选区中的第一个 VGD 内嵌图片（没有返回 null） */
export function selectedDiagramShape(app: Any): Any | null {
  const shapes = app.Selection?.InlineShapes;
  const n = shapes?.Count ?? 0;
  for (let i = 1; i <= n; i++) {
    const s = shapes.Item(i);
    if (isEncodedDoc(s.AlternativeText)) return s;
  }
  return null;
}

function writeImage(app: Any, p: InsertPayload, svg: boolean): string {
  const fs = fileSystem();
  const path = `${tempDir(app)}\\vgd2_${Date.now()}.${svg ? 'svg' : 'png'}`;
  const ok = svg ? fs.writeFileString(path, p.svg) : fs.writeAsBinaryString(path, atob(p.png));
  if (ok === false) throw new Error(`写入临时文件失败：${path}`);
  return path;
}

function addPicture(app: Any, p: InsertPayload, range: Any | null): Any {
  const order = PREFER_SVG ? [true, false] : [false];
  let lastErr: unknown = null;
  for (const svg of order) {
    let path = '';
    try {
      path = writeImage(app, p, svg);
      const shp = range
        ? app.ActiveDocument.InlineShapes.AddPicture(path, false, true, range)
        : app.Selection.InlineShapes.AddPicture(path, false, true);
      if (shp) return shp;
    } catch (err) {
      lastErr = err;
    } finally {
      if (path) {
        try { fileSystem().Remove(path); } catch { /* 忽略 */ }
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('插入图片失败');
}

/** 插入新图，或替换当前选中的 VGD 图片（保持用户缩放比例） */
export async function insertIntoWps(p: InsertPayload, replace: boolean): Promise<void> {
  const app = wpsApp();
  if (!app.ActiveDocument) throw new Error('没有打开的文档');

  let scale = 1;
  let range: Any | null = null;
  if (replace) {
    const old = selectedDiagramShape(app);
    if (old) {
      const doc = await decodeDoc(old.AlternativeText).catch(() => null);
      if (doc?.size && old.Width > 0) scale = old.Width / (doc.size.w * PT_PER_PX);
      range = old.Range;
      old.Delete();
    }
  }

  const shp = addPicture(app, p, range);
  shp.LockAspectRatio = -1; // msoTrue
  shp.Width = p.width * PT_PER_PX * scale;
  shp.Height = p.height * PT_PER_PX * scale;
  shp.AlternativeText = p.data;
  try { shp.Title = 'VGD2'; } catch { /* 旧版本无 Title 属性 */ }
}
