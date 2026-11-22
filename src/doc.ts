/** 文档序列化，以及嵌入 WPS/Word 图片“可选文字”的压缩编码 */
import type { EpureDoc, Layer, Shape } from './types';
import { b64ToBytes, bytesToB64 } from './util';

/** 当前写入的标记：EPUREz: = deflate 压缩，EPURE: = 未压缩（不支持压缩流时的回退） */
const PREFIX_Z = 'EPUREz:';
const PREFIX = 'EPURE:';

const READABLE: { prefix: string; compressed: boolean }[] = [
  { prefix: PREFIX_Z, compressed: true },
  { prefix: PREFIX, compressed: false },
];

export function makeDoc(shapes: Shape[], size?: EpureDoc['size'], layers?: Layer[]): EpureDoc {
  const doc: EpureDoc = { format: 'epure', version: 2, shapes };
  if (size) doc.size = size;
  if (layers) doc.layers = layers;
  return doc;
}

function validLayers(v: unknown): Layer[] | undefined {
  if (!Array.isArray(v) || !v.length) return undefined;
  const out = v
    .filter((l) => l && typeof l === 'object' && typeof (l as Layer).id === 'string')
    .map((l): Layer => ({
      id: (l as Layer).id,
      name: String((l as Layer).name ?? '图层'),
      visible: (l as Layer).visible !== false,
      locked: !!(l as Layer).locked,
    }));
  return out.length ? out : undefined;
}

/** 校验并规范化任意来源的文档对象（layers 缺省时由编辑器使用默认图层） */
export function parseDoc(obj: unknown): EpureDoc {
  if (!obj || typeof obj !== 'object' || (obj as { format?: unknown }).format !== 'epure') {
    throw new Error('不是有效的 Epure 文件');
  }
  const shapes = (obj as { shapes?: unknown }).shapes;
  if (!Array.isArray(shapes)) throw new Error('文件中缺少图形数据');
  const size = (obj as { size?: EpureDoc['size'] }).size;
  return makeDoc(
    shapes as Shape[],
    size && typeof size.w === 'number' && typeof size.h === 'number' ? size : undefined,
    validLayers((obj as { layers?: unknown }).layers),
  );
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** 文档 → 可存入图片可选文字的字符串（deflate + base64） */
export async function encodeDoc(doc: EpureDoc): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(doc));
  if (typeof CompressionStream !== 'undefined') {
    try {
      return PREFIX_Z + bytesToB64(await pipe(raw, new CompressionStream('deflate-raw')));
    } catch {
      /* 回退为未压缩 */
    }
  }
  return PREFIX + bytesToB64(raw);
}

/** 可选文字里是否含有本程序写入的源数据 */
export function isEncodedDoc(str: string | null | undefined): boolean {
  return !!str && READABLE.some((r) => str.includes(r.prefix));
}

/** 解码可选文字；不含 Epure 数据时返回 null */
export async function decodeDoc(str: string | null | undefined): Promise<EpureDoc | null> {
  if (!str) return null;
  const s = String(str).trim();
  for (const { prefix, compressed } of READABLE) {
    const i = s.indexOf(prefix);
    if (i < 0) continue;
    const bytes = b64ToBytes(s.slice(i + prefix.length).replace(/\s+/g, ''));
    const json = new TextDecoder().decode(compressed ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes);
    return parseDoc(JSON.parse(json));
  }
  return null;
}
