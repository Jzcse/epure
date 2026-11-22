/**
 * WPS 加载项主页面（隐藏运行），提供功能区回调 window.ribbon.*
 * ribbon.xml 中 onAction="ribbon.OnAction" 等直接调用这里的全局函数。
 */
import { selectedDiagramShape, STORAGE_KEY, wpsApp } from './api';
import { MIN_HEIGHT, MIN_WIDTH } from '../host/size';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const ICONS: Record<string, string> = {
  epureNew: 'images/new.svg',
  epureEdit: 'images/edit.svg',
};

/** 窗口标题栏、边框所占的余量（CSS 像素） */
const CHROME_W = 20;
const CHROME_H = 50;
const PX_PER_PT = 96 / 72;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 对话框尺寸（逻辑像素，整数）。
 * 实测（WPS 12.1）：加载项主页面隐藏运行，screen.* 为 1×1、devicePixelRatio 恒为 1，均不可用；
 * 因此按 WPS 主窗口尺寸（Application.Width/Height，单位为磅）计算，并始终不小于最小尺寸。
 * ShowDialog 的宽高为逻辑像素，WPS 自行按系统缩放放大，不能再乘 devicePixelRatio。
 */
function dialogSize(app: Any): { w: number; h: number } {
  let appW = 0;
  let appH = 0;
  try { appW = num(app.Width) * PX_PER_PT; appH = num(app.Height) * PX_PER_PT; } catch { /* 忽略 */ }
  const sw = num(screen.availWidth);
  const sh = num(screen.availHeight);
  const baseW = appW > 600 ? appW : sw > 600 ? sw : 1500;
  const baseH = appH > 400 ? appH : sh > 400 ? sh : 950;
  const w = Math.round(Math.max(MIN_WIDTH + CHROME_W, Math.min(baseW * 0.9, 1700)));
  const h = Math.round(Math.max(MIN_HEIGHT + CHROME_H, Math.min(baseH * 0.9, 1050)));
  return { w, h };
}

function openEditor(edit: boolean): void {
  const app = wpsApp();
  if (!app.ActiveDocument) {
    alert('请先打开或新建一个文档');
    return;
  }
  let data = '';
  if (edit) {
    const shp = selectedDiagramShape(app);
    if (!shp) {
      alert('请先单击选中一个由 Epure 插入的示意图');
      return;
    }
    data = shp.AlternativeText;
  }
  app.PluginStorage.setItem(STORAGE_KEY, data);
  const { w, h } = dialogSize(app);
  const url = new URL(`${__EDITOR_URL__}?host=wps&rw=${w}&rh=${h}`, location.href).href;
  app.ShowDialog(url, edit ? 'Epure 示意图 - 编辑' : 'Epure 示意图 - 新建', w, h, true);
}

(window as Any).ribbon = {
  OnAddinLoad(ribbonUI: Any): boolean {
    const app = wpsApp();
    if (typeof app.ribbonUI !== 'object') app.ribbonUI = ribbonUI;
    return true;
  },
  OnAction(control: Any): boolean {
    try {
      if (control.Id === 'epureNew') openEditor(false);
      else if (control.Id === 'epureEdit') openEditor(true);
    } catch (err) {
      alert(`Epure 出错：${err instanceof Error ? err.message : String(err)}`);
    }
    return true;
  },
  GetImage(control: Any): string {
    return ICONS[control.Id] ?? '';
  },
};
