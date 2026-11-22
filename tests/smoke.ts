/** 冒烟测试：导出 SVG/PNG 渲染、可选文字编码往返、OOXML 生成 */
import type { Shape } from '../src/types';
import { fitText, withPoints } from '../src/geometry';
import { buildInsertPayload, buildSvg } from '../src/io';
import { decodeDoc } from '../src/doc';

const log = (s: string) => { document.getElementById('log')!.textContent += s + '\n'; };
const base = (o: Partial<Shape>): Shape => ({
  id: Math.random().toString(36).slice(2), kind: 'rect', x: 0, y: 0, w: 0, h: 0, rot: 0, stroke: '#000000',
  strokeWidth: 1.5, dash: 'solid', fill: null, opacity: 1, ...o,
});

// 斜面 + 物块 + 受力分析
const ground = withPoints(base({ kind: 'line', strokeWidth: 2 }), [{ x: 40, y: 260 }, { x: 420, y: 260 }]);
const hatch = base({ kind: 'rect', x: 40, y: 260, w: 380, h: 14, strokeWidth: 0, fill: '#000000', fillType: 'hatch' });
const slope = withPoints(base({ kind: 'path', closed: true, fill: '#dbeafe' }), [{ x: 60, y: 260 }, { x: 380, y: 260 }, { x: 380, y: 80 }]);
const block = base({ kind: 'rect', x: 200, y: 130, w: 60, h: 40, rot: -29.4, fill: '#fde68a' });
const g = withPoints(base({ kind: 'line', arrowEnd: 'tri', stroke: '#dc2626', strokeWidth: 2 }), [{ x: 230, y: 150 }, { x: 230, y: 240 }]);
const n = withPoints(base({ kind: 'line', arrowEnd: 'stealth', stroke: '#2563eb', strokeWidth: 2 }), [{ x: 230, y: 150 }, { x: 196, y: 90 }]);
const f = withPoints(base({ kind: 'line', arrowEnd: 'open', dash: 'dashed' }), [{ x: 230, y: 150 }, { x: 290, y: 116 }]);
const circ = base({ kind: 'ellipse', x: 440, y: 120, w: 70, h: 70, fill: '#ef4444', fillType: 'grad' });
const curve = { ...withPoints(base({ kind: 'path', smooth: true, arrowStart: 'dot', arrowEnd: 'tri' }), [{ x: 440, y: 260 }, { x: 480, y: 210 }, { x: 520, y: 250 }, { x: 560, y: 200 }]) };
const t1 = fitText(base({ kind: 'text', x: 238, y: 222, text: 'mg', math: true, fontSize: 20, color: '#dc2626' }));
const t2 = fitText(base({ kind: 'text', x: 160, y: 70, text: String.raw`\vec{F}_N`, math: true, fontSize: 20, color: '#2563eb' }));
const t3 = fitText(base({ kind: 'text', x: 300, y: 236, text: String.raw`\theta = 30\circ`, math: true, fontSize: 18 }));
const t4 = fitText(base({ kind: 'text', x: 430, y: 40, text: String.raw`E_k = \frac{1}{2}mv^2` + '\n' + String.raw`斜面倾角 \alpha`, math: true, fontSize: 18 }));
const shapes = [hatch, ground, slope, block, g, n, f, circ, curve, t1, t2, t3, t4];

const svg = buildSvg(shapes);
const img = new Image();
img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.markup);
document.getElementById('out')!.append(img);
log(`svg ${svg.width}x${svg.height}, ${svg.markup.length} chars`);
const perr = new DOMParser().parseFromString(svg.markup, 'image/svg+xml').querySelector('parsererror');
log(perr ? 'XML ERROR: ' + perr.textContent : 'xml ok');

const p = await buildInsertPayload(shapes);
const png = new Image();
png.src = 'data:image/png;base64,' + p.png;
png.width = p.width;
document.getElementById('out')!.append(png);
log(`png base64 ${p.png.length} chars; alt-text data ${p.data.length} chars (json ${JSON.stringify(shapes).length})`);

const back = await decodeDoc(p.data);
const ok = !!back && JSON.stringify(back.shapes) === JSON.stringify(shapes) && back.size?.w === p.width;
log(`roundtrip: ${ok ? 'OK' : 'FAIL'}`);
document.title = ok ? 'SMOKE-OK' : 'SMOKE-FAIL';

// Word OOXML 包结构检查
const { buildOoxml } = await import('../src/office/word');
const ooxml = buildOoxml(p, p.width * 0.75, p.height * 0.75);
const xdoc = new DOMParser().parseFromString(ooxml, 'application/xml');
const xerr = xdoc.querySelector('parsererror');
const parts = [...xdoc.getElementsByTagNameNS('http://schemas.microsoft.com/office/2006/xmlPackage', 'part')].map((e) => e.getAttribute('pkg:name'));
const descr = xdoc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'docPr')[0]?.getAttribute('descr');
const descrOk = !!descr && JSON.stringify((await decodeDoc(descr))?.shapes) === JSON.stringify(shapes);
log(`ooxml: ${xerr ? 'XML ERROR ' + xerr.textContent : 'xml ok'}; parts=${parts.join(',')}; descr roundtrip ${descrOk ? 'OK' : 'FAIL'}`);
if (xerr || !descrOk) document.title = 'SMOKE-FAIL';
