#!/usr/bin/env node
/**
 * 构建 WPS 发行版并打包安装程序。
 *   node tools/build-release.mjs          构建 release/addin 并调用 Inno Setup 生成安装包
 *   node tools/build-release.mjs --no-installer   只构建加载项文件
 *
 * 发行版目录结构（安装到 %APPDATA%\kingsoft\wps\jsaddons\vgd2_<版本>\，由 WPS 本地加载，不需要任何网址）：
 *   index.html     WPS 加载项主页面（隐藏运行，提供功能区回调）
 *   ribbon.xml     功能区：插入示意图 / 编辑示意图
 *   editor.html    编辑器（ShowDialog 打开）
 *   images/        功能区图标
 *   assets/        editor.js / editor.css / wps.js（经典脚本，非 ES 模块，本地加载不受跨域限制）
 */
import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const releaseDir = join(root, 'release');
const out = join(releaseDir, 'addin');
const assets = join(out, 'assets');
const ISCC = process.env.ISCC ?? 'D:/Application/Builder/Inno Setup 7/ISCC.exe';

const define = {
  __WPS_ONLY__: 'true',
  __EDITOR_URL__: JSON.stringify('editor.html'),
  __APP_VERSION__: JSON.stringify(version),
  'process.env.NODE_ENV': JSON.stringify('production'),
};

async function bundle(entry, name, fileName, emptyOutDir) {
  await build({
    configFile: false,
    root,
    base: './',
    logLevel: 'warn',
    publicDir: false,
    define,
    build: {
      outDir: assets,
      emptyOutDir,
      target: 'es2020',
      minify: true,
      copyPublicDir: false,
      lib: { entry: join(root, entry), formats: ['iife'], name, fileName: () => fileName },
    },
  });
}

console.log(`构建 VGD2 ${version}（WPS 发行版）…`);
rmSync(out, { recursive: true, force: true });
mkdirSync(assets, { recursive: true });

await bundle('src/main.ts', 'VGD2Editor', 'editor.js', false);
// Vite 5 库模式把导入的 CSS 输出为 style.css
if (existsSync(join(assets, 'style.css'))) renameSync(join(assets, 'style.css'), join(assets, 'editor.css'));
await bundle('src/wps/main.ts', 'VGD2Wps', 'wps.js', false);

// editor.html：由开发版 index.html 生成，换成经典脚本 + 独立样式表
let editorHtml = readFileSync(join(root, 'index.html'), 'utf8');
const devScript = '<script type="module" src="/src/main.ts"></script>';
if (!editorHtml.includes(devScript)) throw new Error('index.html 中找不到开发版脚本标签');
editorHtml = editorHtml
  .replace(devScript, '<script src="assets/editor.js"></script>')
  .replace('</head>', '  <link rel="stylesheet" href="assets/editor.css" />\n</head>');
writeFileSync(join(out, 'editor.html'), editorHtml);

writeFileSync(join(out, 'index.html'), `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>VGD2 示意图 ${version}</title>
</head>
<body>
  <script src="assets/wps.js"></script>
</body>
</html>
`);

cpSync(join(root, 'public/wps/ribbon.xml'), join(out, 'ribbon.xml'));
cpSync(join(root, 'public/wps/images'), join(out, 'images'), { recursive: true });

// 自检：发行版中不应含有 Word / office.js 相关代码与网址
const editorJs = readFileSync(join(assets, 'editor.js'), 'utf8');
for (const bad of ['appsforoffice.microsoft.com', 'localhost:3000', '127.0.0.1:3001']) {
  if (editorJs.includes(bad) || readFileSync(join(assets, 'wps.js'), 'utf8').includes(bad)) {
    throw new Error(`发行版脚本中仍包含 ${bad}`);
  }
}
console.log(`加载项文件：${out}`);

if (process.argv.includes('--no-installer')) process.exit(0);
if (!existsSync(ISCC)) {
  console.error(`找不到 Inno Setup 编译器：${ISCC}（可用环境变量 ISCC 指定）`);
  process.exit(1);
}
execFileSync(ISCC, [
  `/DAppVersion=${version}`,
  `/DAddinDir=${out}`,
  `/DOutputDir=${releaseDir}`,
  join(root, 'installer', 'vgd2.iss'),
], { stdio: 'inherit' });
console.log(`安装包：${join(releaseDir, `VGD2-Setup-${version}.exe`)}`);
