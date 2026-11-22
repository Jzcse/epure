/** 编辑器运行宿主：独立网页 / Word 对话框 / WPS 对话框 */
import type { InsertPayload } from '../io';

export { MIN_HEIGHT, MIN_WIDTH } from './size';

export interface InitResult {
  /** 要编辑的源数据（EPUREz:...），新建时为 null */
  data: string | null;
  /** 需要提示给用户的信息 */
  notice?: string;
}

export interface Host {
  kind: 'standalone' | 'office' | 'wps';
  /** “插入”按钮文字 */
  insertLabel: string;
  init(): Promise<InitResult>;
  /** 写入文档；成功后宿主负责关闭编辑器 */
  insert(p: InsertPayload): Promise<void>;
  cancel(): void;
}

export const standalone: Host = {
  kind: 'standalone',
  insertLabel: '',
  init: async () => ({ data: null }),
  insert: async () => undefined,
  cancel: () => undefined,
};

export async function detectHost(): Promise<Host> {
  const h = new URLSearchParams(location.search).get('host');
  if (!__WPS_ONLY__ && h === 'office') return (await import('./office')).createOfficeHost();
  if (h === 'wps') return (await import('./wps')).createWpsHost();
  return standalone;
}
