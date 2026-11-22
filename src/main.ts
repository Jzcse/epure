import './style.css';
import { Editor } from './editor';
import { bindUi, toast } from './ui';
import { detectHost, standalone, type Host } from './host';
import { decodeDoc } from './doc';

const svg = document.getElementById('canvas') as unknown as SVGSVGElement;
const textarea = document.getElementById('text-edit') as HTMLTextAreaElement;

const editor = new Editor(svg, textarea);

async function start(): Promise<void> {
  let host: Host = standalone;
  try {
    host = await detectHost();
  } catch (err) {
    toast(`无法连接到文档宿主，已切换为独立模式：${err instanceof Error ? err.message : String(err)}`, true, 8000);
  }
  bindUi(editor, host);
  const init = await host.init();
  if (init.data) {
    const doc = await decodeDoc(init.data);
    if (doc) editor.load(doc.shapes, doc.layers);
  }
  if (init.notice) toast(init.notice);
}

start().catch((err: unknown) => {
  console.error(err);
  toast(`初始化失败：${err instanceof Error ? err.message : String(err)}`, true, 8000);
});
