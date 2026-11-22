/**
 * 端到端交互测试（无需额外依赖）：用 Edge 无头模式 + DevTools 协议模拟真实鼠标/键盘。
 * 用法：先 pnpm dev（或 vite --port 3010），再 node tests/e2e.mjs [url]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_ = process.argv[2] ?? 'http://localhost:3010/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const W = 1280;
const H = 800;

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`,
  `--user-data-dir=${join(tmpdir(), 'epure-e2e-profile')}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
let seq = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''));
  return r.result.value;
}
async function mouse(type, x, y, button = 'left', clickCount = 1) {
  await send('Input.dispatchMouseEvent', { type, x, y, button, clickCount, buttons: type === 'mouseReleased' ? 0 : button === 'right' ? 2 : 1 });
}
async function drag(x0, y0, x1, y1, button = 'left', modifiers = 0) {
  const buttons = button === 'right' ? 2 : 1;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, modifiers });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button, buttons, clickCount: 1, modifiers });
  for (let i = 1; i <= 8; i++) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: x0 + ((x1 - x0) * i) / 8, y: y0 + ((y1 - y0) * i) / 8, button, buttons, modifiers,
    });
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button, buttons: 0, clickCount: 1, modifiers });
}
async function click(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await mouse('mousePressed', x, y);
  await mouse('mouseReleased', x, y);
}
async function key(k, code, keyCode, modifiers = 0) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: keyCode, modifiers });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: keyCode, modifiers });
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

try {
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      target = list.find((t) => t.type === 'page');
    } catch { /* Edge 尚未就绪 */ }
  }
  if (!target) throw new Error('无法连接 Edge');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL_ });
  await sleep(1500);

  const stage = await evaluate(`(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  check('画布铺满工作区', stage.w > 900 && stage.h > 450, `${Math.round(stage.w)}x${Math.round(stage.h)}`);

  // 1. 文字工具：点击画布 → 出现输入框 → 输入公式
  await click(stage.x + 600, stage.y + 40); // 先点空白处
  await key('t', 'KeyT', 84);
  await click(stage.x + 200, stage.y + 150);
  await sleep(100);
  const taState = await evaluate(`(() => { const t = document.getElementById('text-edit'); return { shown: getComputedStyle(t).display !== 'none', focused: document.activeElement === t }; })()`);
  check('文字工具：点击后出现输入框并获得焦点', taState.shown && taState.focused, JSON.stringify(taState));
  await send('Input.insertText', { text: String.raw`\vec{F}_N = mg` });
  await key('Escape', 'Escape', 27);
  await sleep(100);
  const txt = await evaluate(`document.querySelector('#content text')?.textContent ?? ''`);
  check('文字已创建', txt.includes('F') && txt.includes('mg'), JSON.stringify(txt));

  // 2. 双击文字再次编辑
  const tb = await evaluate(`(() => { const r = document.querySelector('#content text').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tb.x, y: tb.y, button: 'left', clickCount: 1, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tb.x, y: tb.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tb.x, y: tb.y, button: 'left', clickCount: 2, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tb.x, y: tb.y, button: 'left', clickCount: 2 });
  await sleep(100);
  const reedit = await evaluate(`(() => { const t = document.getElementById('text-edit'); return getComputedStyle(t).display !== 'none' && document.activeElement === t && t.value; })()`);
  check('双击文字进入编辑', !!reedit, JSON.stringify(reedit));
  await send('Input.insertText', { text: ' + F' });
  await key('Escape', 'Escape', 27);

  // 3. 画矩形
  await key('r', 'KeyR', 82);
  await drag(stage.x + 420, stage.y + 300, stage.x + 600, stage.y + 420);
  const nShapes = await evaluate(`document.querySelectorAll('#content > g[data-id]').length`);
  check('矩形已绘制', nShapes === 2, `对象数 ${nShapes}`);

  // 4. 右键拖动画布
  const before = await evaluate(`document.getElementById('viewport').getAttribute('transform')`);
  const rectBefore = await evaluate(`(() => { const r = document.querySelector('#content rect').getBoundingClientRect(); return [r.left, r.top]; })()`);
  await drag(stage.x + 800, stage.y + 500, stage.x + 700, stage.y + 420, 'right');
  const after = await evaluate(`document.getElementById('viewport').getAttribute('transform')`);
  const rectAfter = await evaluate(`(() => { const r = document.querySelector('#content rect').getBoundingClientRect(); return [r.left, r.top]; })()`);
  const moved = Math.abs(rectAfter[0] - rectBefore[0] + 100) < 2 && Math.abs(rectAfter[1] - rectBefore[1] + 80) < 2;
  check('右键拖动平移画布（-100, -80）', moved, `${before} → ${after}`);
  const nAfterPan = await evaluate(`document.querySelectorAll('#content > g[data-id]').length`);
  check('右键拖动不产生图形/不改变对象', nAfterPan === 2);

  // 5. 平移后在新位置（原画布范围之外）绘图：画到负坐标区域
  await key('e', 'KeyE', 69);
  await drag(stage.x + 30, stage.y + 30, stage.x + 120, stage.y + 100);
  const ell = await evaluate(`(() => { const e = document.querySelector('#content ellipse'); return e ? [+e.getAttribute('cx'), +e.getAttribute('cy')] : null; })()`);
  check('平移后绘图使用世界坐标', !!ell, JSON.stringify(ell));

  // 6. 滚轮缩放（无需 Ctrl）
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: stage.x + 500, y: stage.y + 300, deltaX: 0, deltaY: 300 });
  await sleep(100);
  const zoomOut = await evaluate(`document.getElementById('zoom').textContent`);
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: stage.x + 500, y: stage.y + 300, deltaX: 0, deltaY: -300 });
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: stage.x + 500, y: stage.y + 300, deltaX: 0, deltaY: -300 });
  await sleep(100);
  const zoomText = await evaluate(`document.getElementById('zoom').textContent`);
  check('滚轮缩放（向下缩小、向上放大）', parseInt(zoomOut) < 100 && parseInt(zoomText) > 100, `${zoomOut} → ${zoomText}`);

  // 7. 适应窗口
  await evaluate(`document.getElementById('zoom-fit').click()`);
  const fit = await evaluate(`(() => { const s = document.getElementById('canvas').getBoundingClientRect(); return [...document.querySelectorAll('#content > g[data-id]')].every((g) => { const r = g.getBoundingClientRect(); return r.left >= s.left && r.right <= s.right && r.top >= s.top && r.bottom <= s.bottom; }); })()`);
  check('“适应”后所有图形可见', fit);

  // 8. 对象栏：切换“图形”标签，点击三角形图块后拖动绘制
  const rectOf = (sel) => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  let pt = await rectOf('.tab[data-tab="shapes"]');
  await click(pt.x, pt.y);
  pt = await rectOf('.tile[data-tool="triangle"]');
  await click(pt.x, pt.y);
  const activeTile = await evaluate(`document.querySelector('.tile.active')?.dataset.tool`);
  check('对象栏：点击图块切换工具', activeTile === 'triangle', activeTile);
  const st2 = await evaluate(`(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return { x: r.left, y: r.top }; })()`);
  await drag(st2.x + 650, st2.y + 80, st2.x + 790, st2.y + 200);
  const tri = await evaluate(`(() => { const ps = [...document.querySelectorAll('#content path')].map((p) => p.getAttribute('d')); return ps.find((d) => /Z$/.test(d)) ?? null; })()`);
  check('三角形（闭合多边形）已绘制', !!tri && tri.split('L').length === 3, tri);

  // 9. 悬停提示
  pt = await rectOf('.tile[data-tool="select"]');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  await sleep(600);
  const tipText = await evaluate(`(() => { const t = document.getElementById('tooltip'); return t.hidden ? '' : t.textContent; })()`);
  check('鼠标悬停显示提示文字', tipText.startsWith('选择'), JSON.stringify(tipText));

  // 10. 全选后左对齐（操作栏按钮）
  await click(st2.x + 900, st2.y + 600);
  await key('a', 'KeyA', 65, 2);
  pt = await rectOf('.actionbar [data-tip="左对齐"]');
  const enabledAlign = await evaluate(`!document.querySelector('.actionbar [data-tip="左对齐"]').disabled`);
  await click(pt.x, pt.y);
  const lefts = await evaluate(`[...document.querySelectorAll('#content > g[data-id]')].map((g) => Math.round(g.getBoundingClientRect().left))`);
  check('操作栏：左对齐', enabledAlign && lefts.length >= 4 && Math.max(...lefts) - Math.min(...lefts) <= 4, JSON.stringify(lefts));

  // 11. 关键点吸附
  await key('a', 'KeyA', 65, 2);
  await key('Delete', 'Delete', 46);
  await evaluate(`document.getElementById('zoom-fit').click()`); // 无图形时视图复位为 (60,60) 100%
  const S = await evaluate(`(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return { x: r.left, y: r.top }; })()`);
  const W2S = (x, y) => [S.x + 60 + x, S.y + 60 + y]; // 世界 → 屏幕
  const paths = () => evaluate(`[...document.querySelectorAll('#content path')].map((p) => p.getAttribute('d'))`);
  await key('l', 'KeyL', 76);
  await drag(...W2S(100, 100), ...W2S(300, 100));
  // 悬停中点附近：显示“中点”吸附提示
  await key('l', 'KeyL', 76);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: W2S(203, 104)[0], y: W2S(203, 104)[1] });
  await sleep(50);
  const hoverSnap = await evaluate(`(() => { const c = document.querySelector('#snap circle'); return { n: document.querySelectorAll('#snap text').length, at: c ? [+c.getAttribute('cx'), +c.getAttribute('cy')] : null }; })()`);
  check('悬停时高亮将吸附的关键点（中点，无文字）', hoverSnap.n === 0 && hoverSnap.at?.[0] === 200 && hoverSnap.at?.[1] === 100, JSON.stringify(hoverSnap));
  // 截图：拖动中靠近端点时的吸附提示
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: W2S(150, 200)[0], y: W2S(150, 200)[1], button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: W2S(296, 104)[0], y: W2S(296, 104)[1], button: 'left', buttons: 1 });
  await sleep(50);
  mkdirSync('tests/out', { recursive: true });
  writeFileSync('tests/out/snap.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png', clip: { x: S.x, y: S.y, width: 520, height: 330, scale: 1.5 } })).data, 'base64'));
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: W2S(296, 104)[0], y: W2S(296, 104)[1], button: 'left', buttons: 0, clickCount: 1 });
  await key('z', 'KeyZ', 90, 2); // 撤销这条截图用的线
  await key('l', 'KeyL', 76);
  // 第二条线从第一条线终点附近（偏 4,5 像素）开始 → 起点精确吸附到 (300,100)
  await drag(...W2S(304, 105), ...W2S(300, 250));
  let ds = await paths();
  check('新线段起点吸附到已有线段端点', ds[1]?.startsWith('M300,100L'), JSON.stringify(ds));
  // 画矩形，再拖动第二条线的终点手柄到矩形左上角附近 → 吸附到角点
  await key('r', 'KeyR', 82);
  await drag(...W2S(400, 150), ...W2S(500, 220));
  await click(...W2S(300, 175)); // 选中第二条线（选择工具）
  const sel1 = await evaluate(`document.querySelectorAll('#overlay [data-handle="p1"]').length`);
  await drag(...W2S(300, 250), ...W2S(396, 154));
  ds = await paths();
  check('拖动线段端点手柄吸附到矩形角点', sel1 === 1 && ds[1] === 'M300,100L400,150', JSON.stringify(ds));
  // 选中对象时高亮显示其关键点：线段 3 个（两端 + 中点）
  const lineKeys = await evaluate(`document.querySelectorAll('#overlay circle[pointer-events="none"]').length`);
  await click(...W2S(450, 185)); // 选中矩形
  const rectKeys = await evaluate(`document.querySelectorAll('#overlay circle[pointer-events="none"]').length`);
  check('选中对象时高亮关键点（线段 3 个、矩形 9 个）', lineKeys === 3 && rectKeys === 9, `${lineKeys}, ${rectKeys}`);
  writeFileSync('tests/out/selected.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png', clip: { x: S.x, y: S.y, width: 620, height: 330, scale: 1.5 } })).data, 'base64'));
  // 移动矩形：让其左下角吸附到第一条线的起点
  await drag(...W2S(425, 150), ...W2S(425 - 297, 150 - 117)); // 从上边（避开缩放手柄）拖动
  const rectXY = await evaluate(`(() => { const r = document.querySelector('#content rect'); return [+r.getAttribute('x'), +r.getAttribute('y'), +r.getAttribute('height')]; })()`);
  check('移动对象时关键点吸附（矩形左下角 → 线段端点）', rectXY[0] === 100 && rectXY[1] + rectXY[2] === 100, JSON.stringify(rectXY));
  // 按住 Alt 不吸附
  await key('l', 'KeyL', 76);
  await drag(...W2S(104, 105), ...W2S(60, 300), 'left', 1);
  ds = await paths();
  check('按住 Alt 时不吸附', ds[2]?.startsWith('M104,105L'), JSON.stringify(ds[2]));

  // 12. 右侧选项卡与图层
  await evaluate(`window.confirm = () => true`); // 删除图层的确认框直接通过
  await key('a', 'KeyA', 65, 2);
  await key('Delete', 'Delete', 46);
  await click(...W2S(600, 400)); // 空白处：无选中
  const tabState = () => evaluate(`({ propsDisabled: document.getElementById('tab-props').disabled, props: !document.getElementById('pane-props').hidden, layers: !document.getElementById('pane-layers').hidden })`);
  let ts = await tabState();
  check('未选中对象时属性卡不可用，显示图层卡', ts.propsDisabled && !ts.props && ts.layers, JSON.stringify(ts));
  const layerRows = () => evaluate(`[...document.querySelectorAll('#layer-list .layer')].map((li) => ({ name: li.querySelector('.layer-name').textContent, n: +li.querySelector('.layer-count').textContent, active: li.classList.contains('active') }))`);
  let rows = await layerRows();
  check('默认一个图层', rows.length === 1 && rows[0].name === '图层 1' && rows[0].active, JSON.stringify(rows));

  // 在图层 1 画矩形 A；新建图层 2，画矩形 B
  await key('r', 'KeyR', 82);
  await drag(...W2S(100, 100), ...W2S(200, 160));
  ts = await tabState();
  check('选中对象后自动显示属性卡', !ts.propsDisabled && ts.props, JSON.stringify(ts));
  pt = await rectOf('#tab-layers');
  await click(pt.x, pt.y);
  pt = await rectOf('#layer-tools [data-tip="新建图层"]');
  await click(pt.x, pt.y);
  await key('r', 'KeyR', 82);
  await drag(...W2S(150, 130), ...W2S(260, 200));
  rows = await layerRows();
  check('新建图层并在当前图层绘制', rows.length === 2 && rows[0].name === '图层 2' && rows[0].active && rows[0].n === 1 && rows[1].n === 1, JSON.stringify(rows));
  ts = await tabState();
  check('在图层卡中操作后保持图层卡', ts.layers && !ts.props, JSON.stringify(ts));

  // 绘制顺序：图层 2 的矩形 B 在上
  const rectsOrder = () => evaluate(`[...document.querySelectorAll('#content rect')].map((r) => +r.getAttribute('x'))`);
  check('上层图层的对象绘制在上面', JSON.stringify(await rectsOrder()) === '[100,150]', JSON.stringify(await rectsOrder()));
  // 图层 2 下移 → B 在下
  pt = await rectOf('#layer-tools [data-tip="当前图层下移"]');
  await click(pt.x, pt.y);
  check('图层下移改变绘制顺序', JSON.stringify(await rectsOrder()) === '[150,100]', JSON.stringify(await rectsOrder()));
  pt = await rectOf('#layer-tools [data-tip^="当前图层上移"]');
  await click(pt.x, pt.y);

  // 隐藏图层 2：B 不显示，点击 B 独有区域选不中
  pt = await rectOf('#layer-list .layer:first-child .layer-eye');
  await click(pt.x, pt.y);
  const visibleRects = await evaluate(`document.querySelectorAll('#content rect').length`);
  await click(...W2S(255, 195)); // B 的右下角（A 范围之外）
  const selAfterHidden = await evaluate(`document.querySelectorAll('#overlay polygon').length`);
  check('隐藏图层：不显示、不能选中', visibleRects === 1 && selAfterHidden === 0, `rects=${visibleRects}, sel=${selAfterHidden}`);
  // 在隐藏的当前图层上绘制 → 提示且不创建
  await key('r', 'KeyR', 82);
  await drag(...W2S(400, 100), ...W2S(450, 150));
  const toastText = await evaluate(`(() => { const t = document.getElementById('toast'); return t.hidden ? '' : t.textContent; })()`);
  rows = await layerRows();
  check('当前图层隐藏时禁止绘制并提示', toastText.includes('隐藏') && rows[0].n === 1, JSON.stringify(toastText));
  await key('Escape', 'Escape', 27);
  pt = await rectOf('#layer-list .layer:first-child .layer-eye');
  await click(pt.x, pt.y); // 重新显示

  // 锁定图层 1：A 不能选中（点击 A 独有区域）
  pt = await rectOf('#layer-list .layer:last-child .layer-lock');
  await click(pt.x, pt.y);
  await click(...W2S(100, 130)); // A 左边
  const selLocked = await evaluate(`document.querySelectorAll('#overlay polygon').length`);
  check('锁定图层：对象不能选中', selLocked === 0, `sel=${selLocked}`);
  pt = await rectOf('#layer-list .layer:last-child .layer-lock');
  await click(pt.x, pt.y); // 解锁

  // 把 A 移到图层 2：选中 A → 图层卡 → 移到当前图层
  await click(...W2S(100, 130));
  pt = await rectOf('#tab-layers');
  await click(pt.x, pt.y);
  pt = await rectOf('#layer-tools [data-tip="把选中对象移到当前图层"]');
  await click(pt.x, pt.y);
  rows = await layerRows();
  check('选中对象移到当前图层', rows[0].n === 2 && rows[1].n === 0, JSON.stringify(rows));

  // 双击重命名
  pt = await rectOf('#layer-list .layer:first-child .layer-name');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', buttons: 1, clickCount: 2 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 2 });
  await sleep(50);
  await key('a', 'KeyA', 65, 2);
  await send('Input.insertText', { text: '受力分析' });
  await key('Enter', 'Enter', 13);
  rows = await layerRows();
  check('双击重命名图层', rows[0].name === '受力分析', JSON.stringify(rows));

  // 删除图层（含 2 个对象）→ 撤销恢复
  pt = await rectOf('#layer-tools [data-tip^="删除当前图层"]');
  await click(pt.x, pt.y);
  rows = await layerRows();
  const rectsAfterDel = await evaluate(`document.querySelectorAll('#content rect').length`);
  check('删除图层连同对象', rows.length === 1 && rectsAfterDel === 0, JSON.stringify(rows));
  await key('z', 'KeyZ', 90, 2);
  rows = await layerRows();
  check('撤销删除图层', rows.length === 2 && rows[0].name === '受力分析' && rows[0].n === 2, JSON.stringify(rows));
  writeFileSync('tests/out/layers.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

  // 13. 最小窗口尺寸：800x500 时 body 不小于最小尺寸（出现滚动条而非错位）
  await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 500, deviceScaleFactor: 1, mobile: false });
  await sleep(200);
  const minSize = await evaluate(`(() => { const b = document.body.getBoundingClientRect(); const bar = document.querySelector('.actionbar'); const last = bar.lastElementChild.getBoundingClientRect(); return { w: b.width, h: b.height, barH: bar.getBoundingClientRect().height, lastRight: last.right, barRight: bar.getBoundingClientRect().right }; })()`);
  check('窗口过小时保持最小布局（操作栏不换行、不溢出）', minSize.w >= 1100 && minSize.h >= 680 && minSize.barH <= 41 && minSize.lastRight <= minSize.barRight, JSON.stringify(minSize));
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 680, deviceScaleFactor: 1, mobile: false });
  await sleep(200);
  const shotMin = await send('Page.captureScreenshot', { format: 'png' });
  mkdirSync('tests/out', { recursive: true });
  writeFileSync('tests/out/e2e-min.png', Buffer.from(shotMin.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await sleep(200);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  mkdirSync('tests/out', { recursive: true });
  writeFileSync('tests/out/e2e.png', Buffer.from(shot.data, 'base64'));
} catch (err) {
  console.error('ERROR', err);
  results.push({ name: 'exception', ok: false });
} finally {
  try { ws?.close(); } catch { /* 忽略 */ }
  edge.kill();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} 通过`);
  process.exit(failed ? 1 : 0);
}
