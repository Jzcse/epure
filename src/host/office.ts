/** Word 对话框侧：与任务窗格通信 */
import type { Host, InitResult } from './index';
import { ChunkReceiver, loadOfficeJs, sendChunked, type Msg } from '../office/protocol';

export async function createOfficeHost(): Promise<Host> {
  await loadOfficeJs();

  const send = (m: Msg) => sendChunked((s) => Office.context.ui.messageParent(s), m);
  let onInit: ((r: InitResult) => void) | null = null;
  let onResult: ((err: string | null) => void) | null = null;

  const receiver = new ChunkReceiver((m) => {
    if (m.type === 'init') onInit?.({ data: m.data, notice: m.notice });
    else if (m.type === 'error') onResult?.(m.message);
  });
  Office.context.ui.addHandlerAsync(Office.EventType.DialogParentMessageReceived, (arg) => {
    if ('message' in arg) receiver.push(arg.message);
  });

  return {
    kind: 'office',
    insertLabel: '插入到 Word',
    init: () =>
      new Promise<InitResult>((resolve) => {
        onInit = resolve;
        send({ type: 'ready' });
        // 任务窗格无响应时按新建处理
        setTimeout(() => resolve({ data: null }), 4000);
      }),
    insert: (payload) =>
      new Promise<void>((resolve, reject) => {
        onResult = (err) => (err ? reject(new Error(err)) : resolve());
        send({ type: 'insert', payload });
        // 成功时任务窗格会直接关闭本对话框；此处无需等待
        setTimeout(resolve, 30000);
      }),
    cancel: () => send({ type: 'cancel' }),
  };
}
