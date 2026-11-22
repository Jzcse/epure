/**
 * 图标（自绘 SVG）。
 *   ACTION_ICONS：操作栏，viewBox 0 0 24 24
 *   TOOL_ICONS  ：对象栏示意图，viewBox 0 0 48 48
 */

const INK = '#1f2937';
const LINE = `fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
const BLUE = '#2563eb';

export function svgIcon(inner: string, size: number, view = 24): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}" width="${size}" height="${size}" aria-hidden="true">${inner}</svg>`;
}

/* ---------------- 操作栏 ---------------- */

const bar = (x: number, y: number, w: number, h: number, c = BLUE) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${c}" opacity=".85"/>`;

/** 图层叠放图形 */
const STACK = `<path d="M12 14.5L3 10l9-4.5 9 4.5z" fill="#93c5fd" stroke="#1e40af" stroke-width="1.3" stroke-linejoin="round"/>
  <path d="M3 13.5l9 4.5 9-4.5" fill="none" stroke="#1e40af" stroke-width="1.3" stroke-linejoin="round"/>
  <path d="M3 17l9 4.5 9-4.5" fill="none" stroke="#1e40af" stroke-width="1.3" stroke-linejoin="round" opacity=".6"/>`;

export const ACTION_ICONS: Record<string, string> = {
  new: `<path d="M6 3h8l4 4v14H6z" fill="#fff" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/><path d="M14 3v4h4" ${LINE}/>
    <path d="M12 11v6M9 14h6" stroke="#16a34a" stroke-width="2" stroke-linecap="round"/>`,
  open: `<path d="M3 6h6l2 2h9v11H3z" fill="#fde68a" stroke="#b45309" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M3 19l3-8h17l-3 8z" fill="#fbbf24" stroke="#b45309" stroke-width="1.5" stroke-linejoin="round"/>`,
  save: `<path d="M4 4h13l3 3v13H4z" fill="#3b82f6" stroke="#1e40af" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="7.5" y="4.5" width="8" height="5" fill="#dbeafe"/><rect x="13" y="5.5" width="1.6" height="3" fill="#1e40af"/>
    <rect x="7" y="13" width="10" height="6.5" fill="#fff"/>`,
  exportSvg: `<path d="M5 2h9l5 5v15H5z" fill="#fff" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/><path d="M14 2v5h5" ${LINE}/>
    <path d="M8 18l4-8 4 8z" fill="none" stroke="#7c3aed" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="10" r="1.6" fill="#7c3aed"/>`,
  exportPng: `<rect x="3" y="4" width="18" height="16" rx="2" fill="#e0f2fe" stroke="#0369a1" stroke-width="1.4"/>
    <circle cx="16" cy="9" r="2" fill="#f59e0b"/><path d="M3 18l6-7 5 5 3-3 4 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#22c55e"/>`,

  cut: `<circle cx="7" cy="17" r="3" ${LINE}/><circle cx="17" cy="17" r="3" ${LINE}/>
    <path d="M9 15L18 3M15 15L6 3" stroke="#dc2626" stroke-width="1.7" stroke-linecap="round"/>`,
  copy: `<rect x="8" y="8" width="12" height="13" rx="1.5" fill="#fff" stroke="${INK}" stroke-width="1.5"/>
    <path d="M16 8V4.5A1.5 1.5 0 0 0 14.5 3h-9A1.5 1.5 0 0 0 4 4.5v11A1.5 1.5 0 0 0 5.5 17H8" fill="#dbeafe" stroke="${INK}" stroke-width="1.5"/>`,
  paste: `<rect x="4" y="4" width="14" height="17" rx="1.5" fill="#fde68a" stroke="#b45309" stroke-width="1.4"/>
    <rect x="8" y="2.5" width="6" height="3.5" rx="1" fill="#fff" stroke="#b45309" stroke-width="1.2"/>
    <rect x="10" y="10" width="11" height="12" rx="1.2" fill="#fff" stroke="${INK}" stroke-width="1.4"/>`,
  delete: `<path d="M6 6l12 12M18 6L6 18" stroke="#dc2626" stroke-width="2.6" stroke-linecap="round"/>`,

  undo: `<path d="M9 5L4 10l5 5" fill="none" stroke="#ea580c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4.5 10H14a6 6 0 0 1 0 12h-3" fill="none" stroke="#ea580c" stroke-width="2.2" stroke-linecap="round"/>`,
  redo: `<path d="M15 5l5 5-5 5" fill="none" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M19.5 10H10a6 6 0 0 0 0 12h3" fill="none" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round"/>`,

  front: `<rect x="3" y="3" width="12" height="12" rx="1" fill="#e5e7eb" stroke="#6b7280" stroke-width="1.3"/>
    <rect x="9" y="9" width="12" height="12" rx="1" fill="#22c55e" stroke="#15803d" stroke-width="1.3"/>`,
  back: `<rect x="9" y="9" width="12" height="12" rx="1" fill="#22c55e" stroke="#15803d" stroke-width="1.3"/>
    <rect x="3" y="3" width="12" height="12" rx="1" fill="#e5e7eb" stroke="#6b7280" stroke-width="1.3"/>`,

  alignLeft: `<path d="M4 3v18" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>${bar(6, 6, 13, 4)}${bar(6, 14, 8, 4)}`,
  alignCenter: `<path d="M12 3v18" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>${bar(5, 6, 14, 4)}${bar(8, 14, 8, 4)}`,
  alignRight: `<path d="M20 3v18" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>${bar(5, 6, 13, 4)}${bar(10, 14, 8, 4)}`,
  alignTop: `<path d="M3 4h18" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>${bar(6, 6, 4, 13)}${bar(14, 6, 4, 8)}`,
  alignMiddle: `<path d="M3 12h18" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>${bar(6, 5, 4, 14)}${bar(14, 8, 4, 8)}`,
  alignBottom: `<path d="M3 20h18" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>${bar(6, 5, 4, 13)}${bar(14, 10, 4, 8)}`,

  flipH: `<path d="M12 3v18" stroke="#6b7280" stroke-width="1.3" stroke-dasharray="2 2"/>
    <path d="M10 6v12L3 18z" fill="${BLUE}" stroke="${BLUE}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M14 6v12l7 0z" fill="none" stroke="${BLUE}" stroke-width="1.4" stroke-linejoin="round"/>`,
  flipV: `<path d="M3 12h18" stroke="#6b7280" stroke-width="1.3" stroke-dasharray="2 2"/>
    <path d="M6 10h12L18 3z" fill="${BLUE}" stroke="${BLUE}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M6 14h12l0 7z" fill="none" stroke="${BLUE}" stroke-width="1.4" stroke-linejoin="round"/>`,

  zoomIn: `<circle cx="10" cy="10" r="6" ${LINE}/><path d="M14.5 14.5L20 20M7.5 10h5M10 7.5v5" ${LINE}/>`,
  zoomOut: `<circle cx="10" cy="10" r="6" ${LINE}/><path d="M14.5 14.5L20 20M7.5 10h5" ${LINE}/>`,
  zoomFit: `<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" ${LINE}/><rect x="8" y="8" width="8" height="8" rx="1" fill="#dbeafe" stroke="${BLUE}" stroke-width="1.3"/>`,

  bold: `<path d="M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`,
  italic: `<path d="M10 4h8M6 20h8M15 4L9 20" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`,
  math: `<text x="3" y="19" font-family="Times New Roman, serif" font-style="italic" font-size="20" fill="${INK}">x</text>
    <text x="14" y="11" font-family="Times New Roman, serif" font-size="12" fill="${BLUE}">2</text>`,

  /* 右侧选项卡与图层 */
  tabProps: `<path d="M4 7h16M4 12h16M4 17h16" stroke="#9ca3af" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="9" cy="7" r="2.2" fill="#fff" stroke="${BLUE}" stroke-width="1.6"/><circle cx="15" cy="12" r="2.2" fill="#fff" stroke="${BLUE}" stroke-width="1.6"/>
    <circle cx="7" cy="17" r="2.2" fill="#fff" stroke="${BLUE}" stroke-width="1.6"/>`,
  tabLayers: `${STACK}`,
  layerAdd: `${STACK}<circle cx="18.5" cy="18.5" r="4.5" fill="#16a34a"/><path d="M18.5 16v5M16 18.5h5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`,
  layerDelete: `${STACK}<circle cx="18.5" cy="18.5" r="4.5" fill="#dc2626"/><path d="M16.5 16.5l4 4M20.5 16.5l-4 4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`,
  layerUp: `<path d="M12 19V6M6.5 11.5L12 6l5.5 5.5" fill="none" stroke="${BLUE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 3h14" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`,
  layerDown: `<path d="M12 5v13M6.5 12.5L12 18l5.5-5.5" fill="none" stroke="${BLUE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 21h14" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`,
  moveToLayer: `${STACK}<path d="M3 4h7M7 1.5L10 4 7 6.5" fill="none" stroke="#ea580c" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`,
  selectLayer: `<rect x="3" y="3" width="15" height="15" fill="none" stroke="${BLUE}" stroke-width="1.5" stroke-dasharray="3 2"/>
    <path d="M13 11v10l2.5-2.3 1.8 3.6 1.7-.8-1.8-3.5 3.4-.3z" fill="#fff" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>`,
  eye: `<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="${BLUE}"/>`,
  eyeOff: `<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" fill="none" stroke="#9ca3af" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 20L20 4" stroke="#9ca3af" stroke-width="1.8" stroke-linecap="round"/>`,
  lock: `<rect x="5" y="11" width="14" height="10" rx="1.5" fill="#f59e0b" stroke="#b45309" stroke-width="1.4"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="#b45309" stroke-width="1.8"/>`,
  unlock: `<rect x="5" y="11" width="14" height="10" rx="1.5" fill="none" stroke="#c4c9d0" stroke-width="1.4"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7" fill="none" stroke="#c4c9d0" stroke-width="1.8" stroke-linecap="round"/>`,
};


/* ---------------- 对象栏示意图 ---------------- */

const S = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;
const FILL = '#dbeafe';
const poly = (pts: string, fill = FILL) => `<polygon points="${pts}" fill="${fill}" ${S}/>`;
const head = (pts: string) => `<polygon points="${pts}" fill="${INK}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`;

export const TOOL_ICONS: Record<string, string> = {
  select: `<path d="M15 8v29l7.5-6.5 5 11 5-2.2-5-10.8 10-.8z" fill="#fff" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`,
  line: `<path d="M9 39L39 9" ${S}/><circle cx="9" cy="39" r="2.6" fill="${BLUE}"/><circle cx="39" cy="9" r="2.6" fill="${BLUE}"/>`,
  arrow: `<path d="M9 39L33 15" ${S}/>${head('40,8 36.5,21 27,11.5')}`,
  arrow2: `<path d="M15 33L33 15" ${S}/>${head('40,8 36.5,21 27,11.5')}${head('8,40 11.5,27 21,36.5')}`,
  dashed: `<path d="M9 39L39 9" ${S} stroke-dasharray="6 5"/>`,
  pen: `<path d="M7 33c5-12 9-14 12-8s6 8 10-2 8-13 12-9" fill="none" stroke="${BLUE}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M30 40l9-9 3 3-9 9h-3z" fill="#fbbf24" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`,
  rect: `<rect x="7" y="12" width="34" height="24" fill="${FILL}" ${S}/>`,
  square: `<rect x="10" y="10" width="28" height="28" fill="${FILL}" ${S}/>`,
  ellipse: `<ellipse cx="24" cy="24" rx="18" ry="12" fill="${FILL}" ${S}/>`,
  circle: `<circle cx="24" cy="24" r="15" fill="${FILL}" ${S}/>`,
  triangle: poly('24,8 41,39 7,39'),
  rtriangle: `${poly('9,8 40,39 9,39')}<path d="M9 33h6v6" fill="none" stroke="${INK}" stroke-width="1.5"/>`,
  parallelogram: poly('15,12 42,12 33,36 6,36'),
  trapezoid: poly('15,12 33,12 42,36 6,36'),
  rhombus: poly('24,6 42,24 24,42 6,24'),
  pentagon: poly('24,7 41,19.5 34.5,39.5 13.5,39.5 7,19.5'),
  hexagon: poly('15,9 33,9 42,24 33,39 15,39 6,24'),
  text: `<path d="M11 10h26v7h-3l-1-3h-6v22h4v3H17v-3h4V14h-6l-1 3h-3z" fill="${INK}"/>`,
  formula: `<text x="9" y="36" font-family="Times New Roman, serif" font-style="italic" font-size="32" fill="${INK}">x</text>
    <text x="27" y="22" font-family="Times New Roman, serif" font-size="18" fill="${BLUE}">2</text>`,
};
