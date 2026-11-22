import type { Arrow, Dash, FillType, Shape } from './types';
import type { AlignKind, Editor } from './editor';
import type { Host } from './host';
import { buildInsertPayload, exportPng, exportSvg, readDocument, saveDocument } from './io';
import { ARROWS, DASHES, FILLS } from './shapes';
import { ACTION_ICONS, svgIcon, TOOL_ICONS } from './icons';
import { getTool, PALETTE, PINNED, toolTip } from './tools';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function setValue(id: string, value: string): void {
  const el = byId<HTMLInputElement>(id);
  if (document.activeElement !== el) el.value = value;
}

function fillOptions(id: string, items: [string, string][]): void {
  byId<HTMLSelectElement>(id).replaceChildren(...items.map(([v, l]) => new Option(l, v)));
}

let toastTimer = 0;
export function toast(text: string, error = false, ms = 3000): void {
  const el = byId('toast');
  el.textContent = text;
  el.classList.toggle('error', error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.hidden = true; }, ms);
}

/* ---------- 悬停提示（比原生 title 出现更快、样式统一，WPS/Word 内核中表现一致） ---------- */

function setupTooltips(): void {
  const tip = byId('tooltip');
  let timer = 0;
  let current: HTMLElement | null = null;
  const hide = () => {
    clearTimeout(timer);
    tip.hidden = true;
    current = null;
  };
  document.addEventListener('mouseover', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (el === current) return;
    hide();
    if (!el) return;
    current = el;
    timer = window.setTimeout(() => {
      tip.textContent = el.dataset.tip ?? '';
      tip.hidden = false;
      const r = el.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      const left = Math.min(Math.max(4, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 4);
      // 下半屏（操作栏、对象栏）的提示显示在上方
      const top = r.bottom + t.height + 8 > window.innerHeight ? r.top - t.height - 6 : r.bottom + 6;
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(4, top)}px`;
    }, 350);
  });
  document.addEventListener('mousedown', hide, true);
  document.addEventListener('mouseleave', hide);
}

/* ---------- 操作栏 ---------- */

interface Action {
  id: string;
  tip: string;
  run: () => void;
  enabled?: () => boolean;
}

function iconButton(icon: string, tip: string, size = 22): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'ibtn';
  b.dataset.tip = tip;
  b.innerHTML = svgIcon(icon, size);
  return b;
}

export function bindUi(editor: Editor, host: Host): void {
  setupTooltips();
  fillOptions('dash', DASHES);
  fillOptions('fill-type', FILLS);
  fillOptions('arrow-start', ARROWS);
  fillOptions('arrow-end', ARROWS);

  const fileInput = byId<HTMLInputElement>('file');
  const hasSel = () => editor.selected.size > 0;
  const multi = () => editor.selected.size > 1;
  const align = (k: AlignKind) => () => editor.align(k);

  const groups: Action[][] = [
    [
      {
        id: 'new', tip: '新建', run: () => {
          if (!editor.shapes.length || confirm('清空当前画布（包括所有图层）？')) editor.load([]);
        },
      },
      { id: 'open', tip: '打开 (Ctrl+O)', run: () => fileInput.click() },
      { id: 'save', tip: '保存 (Ctrl+S)', run: () => saveDocument(editor.shapes, editor.layers) },
      { id: 'exportSvg', tip: '导出 SVG（仅可见图层）', run: () => exportSvg(editor.visibleShapes), enabled: () => editor.visibleShapes.length > 0 },
      {
        id: 'exportPng', tip: '导出 PNG（仅可见图层）', enabled: () => editor.visibleShapes.length > 0,
        run: () => { exportPng(editor.visibleShapes).catch((err: unknown) => toast(String(err), true)); },
      },
    ],
    [
      { id: 'cut', tip: '剪切 (Ctrl+X)', run: () => editor.cut(), enabled: hasSel },
      { id: 'copy', tip: '复制 (Ctrl+C)', run: () => editor.copy(), enabled: hasSel },
      { id: 'paste', tip: '粘贴 (Ctrl+V)', run: () => editor.paste(), enabled: () => editor.hasClipboard },
      { id: 'delete', tip: '删除 (Delete)', run: () => editor.deleteSelected(), enabled: hasSel },
    ],
    [
      { id: 'undo', tip: '撤销 (Ctrl+Z)', run: () => editor.undo(), enabled: () => editor.canUndo },
      { id: 'redo', tip: '重做 (Ctrl+Y)', run: () => editor.redo(), enabled: () => editor.canRedo },
    ],
    [
      { id: 'front', tip: '置于顶层 (])', run: () => editor.reorder(true), enabled: hasSel },
      { id: 'back', tip: '置于底层 ([)', run: () => editor.reorder(false), enabled: hasSel },
    ],
    [
      { id: 'alignLeft', tip: '左对齐', run: align('left'), enabled: multi },
      { id: 'alignCenter', tip: '水平居中', run: align('center'), enabled: multi },
      { id: 'alignRight', tip: '右对齐', run: align('right'), enabled: multi },
      { id: 'alignTop', tip: '顶端对齐', run: align('top'), enabled: multi },
      { id: 'alignMiddle', tip: '垂直居中', run: align('middle'), enabled: multi },
      { id: 'alignBottom', tip: '底端对齐', run: align('bottom'), enabled: multi },
    ],
    [
      { id: 'flipH', tip: '水平翻转', run: () => editor.flip(true), enabled: hasSel },
      { id: 'flipV', tip: '垂直翻转', run: () => editor.flip(false), enabled: hasSel },
    ],
  ];

  const bar = byId('actionbar');
  const actionButtons: [Action, HTMLButtonElement][] = [];
  groups.forEach((g, i) => {
    if (i) bar.append(Object.assign(document.createElement('span'), { className: 'sep' }));
    for (const a of g) {
      const b = iconButton(ACTION_ICONS[a.id], a.tip);
      b.addEventListener('click', () => a.run());
      bar.append(b);
      actionButtons.push([a, b]);
    }
  });

  /* ---------- 对象栏 ---------- */

  const tileButtons: HTMLButtonElement[] = [];
  const makeTile = (id: string) => {
    const t = getTool(id);
    const b = document.createElement('button');
    b.className = 'tile';
    b.dataset.tool = id;
    b.dataset.tip = toolTip(t);
    b.innerHTML = svgIcon(TOOL_ICONS[id] ?? '', 40, 48);
    b.addEventListener('click', () => editor.setTool(id));
    tileButtons.push(b);
    return b;
  };

  const tabsEl = byId('palette-tabs');
  const tilesEl = byId('palette-tiles');
  let activeTab = PALETTE[0].id;
  const showTab = (id: string) => {
    activeTab = id;
    for (const b of tabsEl.children) b.classList.toggle('active', (b as HTMLElement).dataset.tab === id);
    const tab = PALETTE.find((p) => p.id === id)!;
    for (const b of [...tilesEl.children]) tileButtons.splice(tileButtons.indexOf(b as HTMLButtonElement), 1);
    tilesEl.replaceChildren(...tab.tools.map(makeTile));
    sync();
  };
  for (const p of PALETTE) {
    const b = document.createElement('button');
    b.className = 'tab';
    b.dataset.tab = p.id;
    b.dataset.tip = p.label;
    b.innerHTML = `${svgIcon(p.icon, 20, 48)}<span>${p.label}</span>`;
    b.addEventListener('click', () => showTab(p.id));
    tabsEl.append(b);
  }
  byId('palette-pinned').append(...PINNED.map(makeTile));

  /* ---------- 画布缩放 ---------- */

  byId('zoom-in').innerHTML = svgIcon(ACTION_ICONS.zoomIn, 18);
  byId('zoom-out').innerHTML = svgIcon(ACTION_ICONS.zoomOut, 18);
  byId('zoom-fit').innerHTML = svgIcon(ACTION_ICONS.zoomFit, 18);
  byId('zoom-in').addEventListener('click', () => editor.zoomAt(1.25));
  byId('zoom-out').addEventListener('click', () => editor.zoomAt(0.8));
  byId('zoom-fit').addEventListener('click', () => editor.fitView());

  /* ---------- 属性区 ---------- */

  const bind = (id: string, prop: keyof Shape, read: () => unknown, evt: 'input' | 'change' = 'input') => {
    byId(id).addEventListener(evt, () => editor.applyProps({ [prop]: read() } as Partial<Shape>, id));
  };
  const val = (id: string) => byId<HTMLInputElement>(id).value;
  const num = (id: string) => Number(val(id));

  bind('stroke', 'stroke', () => val('stroke'));
  bind('sw', 'strokeWidth', () => num('sw'));
  bind('dash', 'dash', () => val('dash') as Dash, 'change');
  bind('opacity', 'opacity', () => num('opacity'));
  bind('arrow-start', 'arrowStart', () => val('arrow-start') as Arrow, 'change');
  bind('arrow-end', 'arrowEnd', () => val('arrow-end') as Arrow, 'change');
  bind('arrow-size', 'arrowSize', () => num('arrow-size'));
  bind('font', 'fontFamily', () => val('font'), 'change');
  bind('fsize', 'fontSize', () => num('fsize'));
  bind('tcolor', 'color', () => val('tcolor'));
  bind('rot', 'rot', () => num('rot'));

  const toggles: [string, keyof Shape][] = [['bold', 'bold'], ['italic', 'italic'], ['math', 'math']];
  for (const [id, prop] of toggles) {
    const b = byId<HTMLButtonElement>(id);
    b.innerHTML = svgIcon(ACTION_ICONS[id], 20);
    b.addEventListener('click', () => editor.applyProps({ [prop]: !b.classList.contains('on') } as Partial<Shape>, id));
  }

  const applyFill = (key: string) => {
    const t = val('fill-type') as FillType | 'none';
    editor.applyProps(t === 'none' ? { fill: null } : { fill: val('fill'), fillType: t }, key);
  };
  byId('fill-type').addEventListener('change', () => applyFill('fill-type'));
  byId('fill').addEventListener('input', () => {
    if (val('fill-type') === 'none') byId<HTMLSelectElement>('fill-type').value = 'solid';
    applyFill('fill');
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const doc = await readDocument(file);
      editor.load(doc.shapes, doc.layers);
    } catch (err) {
      toast(err instanceof Error ? err.message : '打开文件失败', true);
    }
  });

  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (!(e.ctrlKey || e.metaKey) || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); saveDocument(editor.shapes, editor.layers); }
    else if (k === 'o') { e.preventDefault(); fileInput.click(); }
  });

  /* ---------- 宿主（Word / WPS）---------- */

  if (host.kind !== 'standalone') {
    byId('host-group').hidden = false;
    const insertBtn = byId<HTMLButtonElement>('host-insert');
    insertBtn.textContent = host.insertLabel;
    insertBtn.addEventListener('click', async () => {
      editor.commitText();
      if (!editor.visibleShapes.length) {
        toast(editor.shapes.length ? '所有对象都在隐藏图层中' : '画布是空的', true);
        return;
      }
      insertBtn.disabled = true;
      toast('正在写入文档…', false, 30000);
      try {
        await host.insert(await buildInsertPayload(editor.visibleShapes, editor.shapes, editor.layers));
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), true, 6000);
      } finally {
        insertBtn.disabled = false;
      }
    });
    byId('host-cancel').addEventListener('click', () => host.cancel());
  }

  /* ---------- 右侧选项卡：属性 / 图层 ---------- */

  editor.onNotice = (msg) => toast(msg, true, 3500);

  /** 用户偏好的选项卡；未选中对象时强制显示图层（属性卡不可用） */
  let preferPane: 'props' | 'layers' = 'props';
  const tabProps = byId<HTMLButtonElement>('tab-props');
  const tabLayers = byId<HTMLButtonElement>('tab-layers');
  tabProps.innerHTML = `${svgIcon(ACTION_ICONS.tabProps, 18)}<span>属性</span>`;
  tabLayers.innerHTML = `${svgIcon(ACTION_ICONS.tabLayers, 18)}<span>图层</span>`;
  tabProps.addEventListener('click', () => { preferPane = 'props'; sync(); });
  tabLayers.addEventListener('click', () => { preferPane = 'layers'; sync(); });

  function syncTabs(none: boolean): void {
    const pane = none ? 'layers' : preferPane;
    tabProps.disabled = none;
    tabProps.dataset.tip = none ? '先选中对象才能修改属性' : '修改选中对象的属性';
    tabLayers.dataset.tip = '图层列表';
    tabProps.classList.toggle('active', pane === 'props');
    tabLayers.classList.toggle('active', pane === 'layers');
    byId('pane-props').hidden = pane !== 'props';
    byId('pane-layers').hidden = pane !== 'layers';
  }

  /* ---------- 图层面板 ---------- */

  const activeIndex = () => editor.layers.findIndex((l) => l.id === editor.activeLayer);
  const activeName = () => editor.layers[activeIndex()]?.name ?? '';
  const layerActions: (Action | null)[] = [
    { id: 'layerAdd', tip: '新建图层', run: () => editor.addLayer() },
    {
      id: 'layerDelete', tip: '删除当前图层（连同其中的对象）', enabled: () => editor.layers.length > 1,
      run: () => {
        const n = editor.layerCounts().get(editor.activeLayer) ?? 0;
        if (n === 0 || confirm(`删除图层“${activeName()}”及其中的 ${n} 个对象？`)) editor.deleteLayer(editor.activeLayer);
      },
    },
    null,
    { id: 'layerUp', tip: '当前图层上移（显示在更上层）', run: () => editor.moveLayer(editor.activeLayer, 1), enabled: () => activeIndex() < editor.layers.length - 1 },
    { id: 'layerDown', tip: '当前图层下移', run: () => editor.moveLayer(editor.activeLayer, -1), enabled: () => activeIndex() > 0 },
    null,
    {
      id: 'moveToLayer', tip: '把选中对象移到当前图层',
      run: () => editor.moveSelectedToLayer(editor.activeLayer),
      enabled: () => editor.selectedShapes.some((s) => editor.layerIdOf(s) !== editor.activeLayer),
    },
    {
      id: 'selectLayer', tip: '选中当前图层的全部对象',
      run: () => editor.selectLayer(editor.activeLayer),
      enabled: () => (editor.layerCounts().get(editor.activeLayer) ?? 0) > 0,
    },
  ];
  const layerToolEl = byId('layer-tools');
  const layerButtons: [Action, HTMLButtonElement][] = [];
  for (const a of layerActions) {
    if (!a) {
      layerToolEl.append(Object.assign(document.createElement('span'), { className: 'sep' }));
      continue;
    }
    const b = iconButton(ACTION_ICONS[a.id], a.tip, 20);
    b.addEventListener('click', () => a.run());
    layerToolEl.append(b);
    layerButtons.push([a, b]);
  }

  const listEl = byId('layer-list');
  let renaming: string | null = null;

  function startRename(id: string, nameEl: HTMLElement): void {
    const layer = editor.layers.find((l) => l.id === id);
    if (!layer) return;
    renaming = id;
    const input = document.createElement('input');
    input.value = layer.name;
    nameEl.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      renaming = null;
      if (save && input.value.trim() && input.value.trim() !== layer.name) editor.renameLayer(id, input.value);
      else renderLayers();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  function renderLayers(): void {
    if (renaming) return;
    const counts = editor.layerCounts();
    const selLayers = new Set(editor.selectedShapes.map((s) => editor.layerIdOf(s)));
    const rows = [...editor.layers].reverse().map((l) => {
      const li = document.createElement('li');
      li.className = 'layer';
      li.classList.toggle('active', l.id === editor.activeLayer);
      li.classList.toggle('hidden-layer', !l.visible);
      li.dataset.id = l.id;

      const dot = document.createElement('span');
      dot.className = 'layer-sel';
      dot.classList.toggle('on', selLayers.has(l.id));
      dot.dataset.tip = '该图层中有选中的对象';

      const eye = iconButton(ACTION_ICONS[l.visible ? 'eye' : 'eyeOff'], l.visible ? '隐藏图层' : '显示图层', 18);
      eye.classList.add('layer-eye');
      eye.addEventListener('click', (e) => { e.stopPropagation(); editor.toggleLayerVisible(l.id); });

      const lock = iconButton(ACTION_ICONS[l.locked ? 'lock' : 'unlock'], l.locked ? '解锁图层' : '锁定图层（不能选中、修改其中的对象）', 18);
      lock.classList.add('layer-lock');
      lock.addEventListener('click', (e) => { e.stopPropagation(); editor.toggleLayerLock(l.id); });

      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = l.name;
      name.addEventListener('dblclick', (e) => { e.stopPropagation(); startRename(l.id, name); });

      const count = document.createElement('span');
      count.className = 'layer-count';
      count.textContent = String(counts.get(l.id) ?? 0);
      count.dataset.tip = '对象数';

      li.append(dot, eye, lock, name, count);
      li.addEventListener('click', () => editor.setActiveLayer(l.id));
      return li;
    });
    listEl.replaceChildren(...rows);
    for (const [a, b] of layerButtons) b.disabled = a.enabled ? !a.enabled() : false;
  }

  /* ---------- 状态同步 ---------- */

  const rowOf = (id: string) => byId(id).closest('label') as HTMLElement;

  function sync(): void {
    for (const b of tileButtons) b.classList.toggle('active', b.dataset.tool === editor.tool);
    for (const [a, b] of actionButtons) b.disabled = a.enabled ? !a.enabled() : false;

    const sel = editor.selectedShapes;
    const none = sel.length === 0;
    syncTabs(none);
    renderLayers();
    const hasText = sel.some((s) => s.kind === 'text');
    const hasGraphic = sel.some((s) => s.kind !== 'text');
    const hasOpenLine = sel.some((s) => s.kind === 'line' || (s.kind === 'path' && !s.closed));
    const hasClosed = sel.some((s) => s.kind === 'rect' || s.kind === 'ellipse' || (s.kind === 'path' && s.closed));
    byId('style-section').hidden = !none && !hasGraphic;
    byId('fill-section').hidden = !none && !hasClosed;
    byId('text-section').hidden = !none && !hasText;
    for (const id of ['arrow-start', 'arrow-end', 'arrow-size']) rowOf(id).hidden = !none && !hasOpenLine;
    byId('sel-info').textContent = `已选 ${sel.length} 个对象`;

    const cur = editor.current;
    setValue('stroke', cur.stroke ?? '#000000');
    setValue('sw', String(cur.strokeWidth ?? 1.5));
    setValue('dash', cur.dash ?? 'solid');
    setValue('opacity', String(cur.opacity ?? 1));
    setValue('fill-type', cur.fill ? cur.fillType ?? 'solid' : 'none');
    setValue('fill', cur.fill ?? '#ffffff');
    setValue('arrow-start', cur.arrowStart ?? 'none');
    setValue('arrow-end', cur.arrowEnd ?? 'none');
    setValue('arrow-size', String(cur.arrowSize ?? 1));
    setValue('font', cur.fontFamily ?? 'Times New Roman');
    setValue('fsize', String(cur.fontSize ?? 20));
    setValue('tcolor', cur.color ?? '#000000');
    for (const [id, prop] of toggles) byId(id).classList.toggle('on', !!cur[prop]);
    byId<HTMLInputElement>('rot').disabled = sel.length !== 1;
    setValue('rot', String(Math.round(cur.rot ?? 0)));
    byId('zoom').textContent = `${Math.round(editor.view.z * 100)}%`;
  }

  editor.onChange = sync;
  showTab(activeTab);
}
