/** 通用工具（移植自原 JS 原型 util.js） */

export type P2 = [number, number];

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** XML 转义，并去掉 XML 1.0 不允许的控制字符（否则 SVG/OOXML 无法解析） */
export function esc(s: unknown): string {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Ramer–Douglas–Peucker 折线简化 */
export function simplify(pts: P2[], eps: number): P2[] {
  if (pts.length < 3) return pts.slice();
  const sq = eps * eps;
  const segDist2 = (p: P2, a: P2, b: P2): number => {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx || dy) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [f, l] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = f + 1; i < l; i++) {
      const d = segDist2(pts[i], pts[f], pts[l]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > sq && idx > 0) { keep[idx] = 1; stack.push([f, idx], [idx, l]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Catmull-Rom → 三次贝塞尔（经过所有点的平滑曲线） */
export function smoothPath(pts: P2[], closed: boolean): string {
  const n = pts.length;
  if (n < 2) return n ? `M${r2(pts[0][0])},${r2(pts[0][1])}` : '';
  if (n === 2) return `M${r2(pts[0][0])},${r2(pts[0][1])}L${r2(pts[1][0])},${r2(pts[1][1])}`;
  const P = (i: number): P2 => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  let d = `M${r2(pts[0][0])},${r2(pts[0][1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r2(c1[0])},${r2(c1[1])} ${r2(c2[0])},${r2(c2[1])} ${r2(p2[0])},${r2(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

export function ptsPath(pts: P2[], closed: boolean): string {
  if (!pts.length) return '';
  const d = 'M' + pts.map((p) => `${r2(p[0])},${r2(p[1])}`).join('L');
  return closed ? d + 'Z' : d;
}

/* ---------- base64 ---------- */

export function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

export function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function utf8ToB64(text: string): string {
  return bytesToB64(new TextEncoder().encode(text));
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
