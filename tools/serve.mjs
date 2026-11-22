#!/usr/bin/env node
/**
 * 静态服务 dist/：
 *   https://localhost:3000  → Word 加载项（需先运行 pnpm certs 安装受信任证书）
 *   http://127.0.0.1:3001   → WPS 加载项（WPS 不要求 HTTPS）
 */
import { createServer as createHttp } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.xml': 'application/xml; charset=utf-8',
  '.ico': 'image/x-icon',
};

if (!existsSync(root)) {
  console.error('找不到 dist/，请先运行 pnpm build');
  process.exit(1);
}

function handler(req, res) {
  const url = new URL(req.url ?? '/', 'http://x');
  let file = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(readFileSync(file));
}

/** 端口被占用时给出明确提示而不是崩溃堆栈 */
function onError(port) {
  return (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`端口 ${port} 已被占用：可能已有一个 pnpm start 在运行。请关闭它后重试。`);
      console.error(`查看占用进程：netstat -ano | findstr :${port}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  };
}

const certDir = join(homedir(), '.office-addin-dev-certs');
const key = join(certDir, 'localhost.key');
const cert = join(certDir, 'localhost.crt');
if (existsSync(key) && existsSync(cert)) {
  createHttps({ key: readFileSync(key), cert: readFileSync(cert) }, handler)
    .on('error', onError(3000))
    .listen(3000, () => console.log('Word 加载项: https://localhost:3000/office/taskpane.html'));
} else {
  console.warn('未找到开发证书，跳过 HTTPS（Word 加载项不可用）。运行 pnpm certs 安装。');
}
createHttp(handler).on('error', onError(3001)).listen(3001, '127.0.0.1', () => {
  console.log('WPS 加载项:  http://127.0.0.1:3001/wps/');
  console.log('独立编辑器:  http://127.0.0.1:3001/');
});
