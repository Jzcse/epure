/** 文档序列化，以及嵌入 Word/WPS 图片“可选文字”的压缩编码 */
import type { Layer, Shape, VgdDoc } from './types';
import { b64ToBytes, bytesToB64 } from './util';

const PREFIX_Z = 'VGD2z:';
const PREFIX = 'VGD2:';

export function makeDoc(shapes: Shape[], size?: VgdDoc['size'], layers?: Layer[]): VgdDoc {
  const doc: VgdDoc = { format: 'vgd', version: 2, shapes };
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

/** 校验并规范化任意来源的文档对象（兼容 version 1） */
export function parseDoc(obj: unknown): VgdDoc {
  if (!obj || typeof obj !== 'object' || (obj as { format?: unknown }).format !== 'vgd') {
    throw new Error('不是有效的 VGD 文件');
  }
  const shapes = (obj as { shapes?: unknown }).shapes;
  if (!Array.isArray(shapes)) throw new Error('文件中缺少图形数据');
  const size = (obj as { size?: VgdDoc['size'] }).size;
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
export async function encodeDoc(doc: VgdDoc): Promise<string> {
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

export function isEncodedDoc(str: string | null | undefined): boolean {
  return !!str && (str.includes(PREFIX_Z) || str.includes(PREFIX));
}

/** 解码可选文字；不含 VGD 数据时返回 null */
export async function decodeDoc(str: string | null | undefined): Promise<VgdDoc | null> {
  if (!str) return null;
  const s = String(str).trim();
  let i = s.indexOf(PREFIX_Z);
  if (i >= 0) {
    const bytes = b64ToBytes(s.slice(i + PREFIX_Z.length).replace(/\s+/g, ''));
    const json = new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw')));
    return parseDoc(JSON.parse(json));
  }
  i = s.indexOf(PREFIX);
  if (i >= 0) {
    const bytes = b64ToBytes(s.slice(i + PREFIX.length).replace(/\s+/g, ''));
    return parseDoc(JSON.parse(new TextDecoder().decode(bytes)));
  }
  return null;
}
