/**
 * Office 对话框 ↔ 任务窗格 之间的消息协议。
 * messageParent / messageChild 单条消息长度有限，大数据（SVG、PNG）按块发送后重组。
 */

export type Msg =
  | { type: 'ready' }
  | { type: 'init'; data: string | null; notice?: string }
  | { type: 'insert'; payload: import('../io').InsertPayload }
  | { type: 'cancel' }
  | { type: 'error'; message: string };

const CHUNK = 30000;

interface Chunk { __vgd: 1; id: string; i: number; n: number; d: string }

export function sendChunked(send: (s: string) => void, msg: Msg): void {
  const text = JSON.stringify(msg);
  const id = Math.random().toString(36).slice(2);
  const n = Math.max(1, Math.ceil(text.length / CHUNK));
  for (let i = 0; i < n; i++) {
    const c: Chunk = { __vgd: 1, id, i, n, d: text.slice(i * CHUNK, (i + 1) * CHUNK) };
    send(JSON.stringify(c));
  }
}

export class ChunkReceiver {
  private readonly parts = new Map<string, string[]>();

  constructor(private readonly onMessage: (m: Msg) => void) {}

  push(raw: string): void {
    let c: Chunk;
    try {
      c = JSON.parse(raw) as Chunk;
    } catch {
      return;
    }
    if (!c || c.__vgd !== 1) return;
    const arr = this.parts.get(c.id) ?? new Array<string>(c.n);
    arr[c.i] = c.d;
    this.parts.set(c.id, arr);
    for (let i = 0; i < c.n; i++) if (arr[i] === undefined) return;
    this.parts.delete(c.id);
    this.onMessage(JSON.parse(arr.join('')) as Msg);
  }
}

let officeLoading: Promise<void> | null = null;

/** 按需加载 office.js（独立网页版不加载） */
export function loadOfficeJs(): Promise<void> {
  officeLoading ??= new Promise<void>((resolve, reject) => {
    if (typeof Office !== 'undefined') {
      Office.onReady(() => resolve());
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://appsforoffice.microsoft.com/lib/1/hosted/office.js';
    s.onload = () => Office.onReady(() => resolve());
    s.onerror = () => reject(new Error('无法加载 office.js（需要联网）'));
    document.head.appendChild(s);
  });
  return officeLoading;
}
