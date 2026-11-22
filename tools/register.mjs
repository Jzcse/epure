#!/usr/bin/env node
/**
 * 在本机注册 / 注销开发版加载项：
 *   node tools/register.mjs            注册 Word + WPS
 *   node tools/register.mjs --remove   注销
 *
 * Word：写入 HKCU\Software\Microsoft\Office\16.0\WEF\Developer（开发者旁加载，指向 office/manifest.xml）
 * WPS ：写入 %APPDATA%\kingsoft\wps\jsaddons\publish.xml（jspluginonline，指向 http://127.0.0.1:3001/wps/）
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const remove = process.argv.includes('--remove');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = join(root, 'office', 'manifest.xml');
const addinId = /<Id>([^<]+)<\/Id>/.exec(readFileSync(manifest, 'utf8'))[1];

const WPS_NAME = 'vgd2';
const WPS_URL = 'http://127.0.0.1:3001/wps/';

/* ---------- Word ---------- */
const regKey = 'HKCU\\Software\\Microsoft\\Office\\16.0\\WEF\\Developer';
try {
  if (remove) {
    execFileSync('reg', ['delete', regKey, '/v', addinId, '/f'], { stdio: 'ignore' });
    console.log('Word: 已注销');
  } else {
    execFileSync('reg', ['add', regKey, '/v', addinId, '/t', 'REG_SZ', '/d', manifest, '/f'], { stdio: 'ignore' });
    console.log(`Word: 已注册 ${manifest}`);
  }
} catch (err) {
  console.warn(`Word: 操作失败（${err.message.split('\n')[0]}）`);
}

/* ---------- WPS ---------- */
const dir = join(process.env.APPDATA ?? '', 'kingsoft', 'wps', 'jsaddons');
const file = join(dir, 'publish.xml');
let xml = existsSync(file) ? readFileSync(file, 'utf8') : '<?xml version="1.0" encoding="UTF-8"?>\n<jsplugins>\n</jsplugins>\n';
// 去掉旧的同名条目（保留其他加载项）
xml = xml.replace(new RegExp(`\\s*<jspluginonline[^>]*name="${WPS_NAME}"[^>]*/>`, 'g'), '');
if (!remove) {
  const entry = `  <jspluginonline name="${WPS_NAME}" type="wps" url="${WPS_URL}" debug="" enable="enable_dev" install="null"/>`;
  xml = xml.includes('</jsplugins>') ? xml.replace('</jsplugins>', `${entry}\n</jsplugins>`) : `<jsplugins>\n${entry}\n</jsplugins>\n`;
}
mkdirSync(dir, { recursive: true });
writeFileSync(file, xml, 'utf8');
console.log(remove ? 'WPS: 已注销' : `WPS: 已注册 ${WPS_URL} → ${file}`);
console.log('请重启 Word / WPS 使更改生效。');
