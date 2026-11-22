#!/usr/bin/env node
/**
 * 由 public/assets/icon.svg 生成安装程序图标 installer/icon.ico（16–256 多尺寸，PNG 压缩条目）。
 * 用 Edge 无头模式渲染 SVG。用法：node tools/make-icon.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const svg = readFileSync(join(root, 'public/assets/icon.svg'), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'vgd2-icon-'));

const pngs = SIZES.map((s) => {
  const html = join(tmp, `i${s}.html`);
  const png = join(tmp, `i${s}.png`);
  writeFileSync(html, `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${s}" height="${s}" style="display:block" `)}</body></html>`);
  execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    `--window-size=${s},${s}`, `--screenshot=${png}`, pathToFileURL(html).href], { stdio: 'ignore' });
  return readFileSync(png);
});

// ICO：ICONDIR + ICONDIRENTRY[] + PNG 数据
const header = Buffer.alloc(6 + 16 * SIZES.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(SIZES.length, 4);
let offset = header.length;
SIZES.forEach((s, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(s >= 256 ? 0 : s, e);
  header.writeUInt8(s >= 256 ? 0 : s, e + 1);
  header.writeUInt8(0, e + 2);
  header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
mkdirSync(join(root, 'installer'), { recursive: true });
writeFileSync(join(root, 'installer/icon.ico'), Buffer.concat([header, ...pngs]));
writeFileSync(join(root, 'installer/icon-256.png'), pngs[pngs.length - 1]);
console.log('已生成 installer/icon.ico');
