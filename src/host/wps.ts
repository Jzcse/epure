/** WPS 对话框侧：从 PluginStorage 读取待编辑数据，直接操作文档 */
import type { Host } from './index';
import { MIN_HEIGHT, MIN_WIDTH } from './size';
import { insertIntoWps, STORAGE_KEY, wpsApp } from '../wps/api';

/**
 * 对话框小于最小尺寸时，用请求尺寸 / 最小尺寸把窗口放大并居中。
 * WPS 对话框是否允许 resizeTo 因版本而异；不允许时页面以最小尺寸 + 滚动条兜底。
 */
function ensureMinSize(): void {
  const q = new URLSearchParams(location.search);
  const wantW = Math.max(MIN_WIDTH, Number(q.get('rw')) || 0);
  const wantH = Math.max(MIN_HEIGHT, Number(q.get('rh')) || 0);
  if (window.innerWidth < MIN_WIDTH || window.innerHeight < MIN_HEIGHT) {
    const chromeW = Math.max(0, window.outerWidth - window.innerWidth);
    const chromeH = Math.max(0, window.outerHeight - window.innerHeight);
    const w = Math.min(wantW + chromeW, screen.availWidth || wantW + chromeW);
    const h = Math.min(wantH + chromeH, screen.availHeight || wantH + chromeH);
    try {
      window.resizeTo(w, h);
      window.moveTo(Math.max(0, ((screen.availWidth || w) - w) / 2), Math.max(0, ((screen.availHeight || h) - h) / 2));
    } catch {
      /* 忽略 */
    }
  }
}

export async function createWpsHost(): Promise<Host> {
  const app = wpsApp();
  ensureMinSize();
  const data: string = app.PluginStorage?.getItem(STORAGE_KEY) || '';

  const close = () => {
    try { app.PluginStorage?.setItem(STORAGE_KEY, ''); } catch { /* 忽略 */ }
    window.close();
  };

  return {
    kind: 'wps',
    insertLabel: '插入到 WPS',
    init: async () => ({ data: data || null }),
    insert: async (payload) => {
      await insertIntoWps(payload, !!data);
      close();
    },
    cancel: close,
  };
}
