/**
 * 简易公式标记 → SVG <text>（移植自原 JS 原型 mathtext.js）
 * 支持：上标 x^2 x^{10}、下标 a_1 v_{0}、希腊字母与符号 \alpha \Delta \times \le ...
 *       \vec{F} \bar{x} \hat{n} \dot{x}、\rm{...} 正体、\bf{...} 粗体、\sqrt{x}、\frac{a}{b}（行内 a/b）
 * 公式模式下拉丁字母自动斜体（物理量），数字与 \rm 内为正体。
 */
import { esc, r2 } from './util';

export const LINE_HEIGHT = 1.25;
const ASCENT = 0.88;
/** 含组合附加符（矢量箭头、横线等）的字体；Windows 自带，与 Word 公式一致 */
const ACCENT_FONT = "'Cambria Math', 'Segoe UI Symbol', serif";

export const SYM: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ',
  tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ',
  Psi: 'Ψ', Omega: 'Ω',
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  approx: '≈', equiv: '≡', sim: '∼', propto: '∝', infty: '∞', angle: '∠', perp: '⊥', parallel: '∥',
  circ: '°', deg: '°', degree: '°', prime: '′', sum: '∑', prod: '∏', int: '∫', oint: '∮', partial: '∂',
  nabla: '∇', to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒',
  Leftarrow: '⇐', Leftrightarrow: '⇔', uparrow: '↑', downarrow: '↓', in: '∈', notin: '∉', subset: '⊂',
  subseteq: '⊆', supset: '⊃', cup: '∪', cap: '∩', emptyset: '∅', varnothing: '∅', forall: '∀', exists: '∃',
  neg: '¬', land: '∧', lor: '∨', triangle: '△', square: '□', odot: '⊙', otimes: '⊗', oplus: '⊕',
  because: '∵', therefore: '∴', cdots: '⋯', ldots: '…', dots: '…', hbar: 'ℏ', ell: 'ℓ', cong: '≅',
  backsim: '∽', mid: '∣', star: '⋆', bullet: '•', quad: ' ', qquad: '  ', ',': ' ',
  ' ': ' ', '{': '{', '}': '}', '\\': '\\', _: '_', '^': '^', '%': '%', '#': '#', '&': '&',
  AA: 'Å', ohm: 'Ω',
};
const ACCENT: Record<string, string> = { vec: '⃗', bar: '̅', overline: '̅', hat: '̂', dot: '̇', ddot: '̈', tilde: '̃' };
const STYLE_CMD: Record<string, Force> = { rm: 'rm', mathrm: 'rm', text: 'rm', it: 'it', mathit: 'it', bf: 'bf', mathbf: 'bf' };

type Force = 'rm' | 'it' | 'bf';
type Node =
  | { t: 'c'; v: string }
  | { t: 'sym'; v: string }
  | { t: 'g'; c: Node[] }
  | { t: 'acc'; a: string; c: Node[] }
  | { t: 'sty'; s: Force; c: Node[] }
  | { t: 'sup' | 'sub'; c: Node[] };

function parse(src: string): Node[] {
  let i = 0;
  const readArg = (): Node[] => {
    while (src[i] === ' ') i++;
    if (i >= src.length) return [];
    if (src[i] === '{') { i++; return readSeq('}'); }
    if (src[i] === '\\') return [readCommand()];
    return [{ t: 'c', v: src[i++] }];
  };
  const wrapParen = (nodes: Node[]): Node[] => {
    const plain = nodes.length === 1 || nodes.every((n) => n.t === 'c' && /[0-9a-zA-Z]/.test(n.v));
    return plain ? nodes : [{ t: 'c', v: '(' }, ...nodes, { t: 'c', v: ')' }];
  };
  const readCommand = (): Node => {
    i++; // 跳过 '\'
    let name = '';
    if (/[a-zA-Z]/.test(src[i] ?? '')) { while (i < src.length && /[a-zA-Z]/.test(src[i])) name += src[i++]; }
    else if (i < src.length) name = src[i++];
    if (ACCENT[name]) return { t: 'acc', a: ACCENT[name], c: readArg() };
    if (STYLE_CMD[name]) return { t: 'sty', s: STYLE_CMD[name], c: readArg() };
    if (name === 'sqrt') return { t: 'g', c: [{ t: 'sym', v: '√' }, { t: 'acc', a: '̅', c: readArg() }] };
    if (name === 'frac') {
      const a = readArg();
      const b = readArg();
      return { t: 'g', c: [...wrapParen(a), { t: 'c', v: '/' }, ...wrapParen(b)] };
    }
    if (SYM[name] !== undefined) return { t: 'sym', v: SYM[name] };
    return { t: 'sym', v: '\\' + name };
  };
  const readSeq = (end: string | null): Node[] => {
    const out: Node[] = [];
    while (i < src.length) {
      const ch = src[i];
      if (end && ch === end) { i++; return out; }
      if (ch === '\\') out.push(readCommand());
      else if (ch === '^') { i++; out.push({ t: 'sup', c: readArg() }); }
      else if (ch === '_') { i++; out.push({ t: 'sub', c: readArg() }); }
      else if (ch === '{') { i++; out.push({ t: 'g', c: readSeq('}') }); }
      else { out.push({ t: 'c', v: ch }); i++; }
    }
    return out;
  };
  return readSeq(null);
}

interface Run { s: string; size: number; shift: number; it: boolean; bf: boolean; acc?: boolean }
interface St { size: number; shift: number; bf: boolean; force: Force | null }

function flatten(nodes: Node[], math: boolean, baseIt: boolean, baseBf: boolean): Run[] {
  const runs: Run[] = [];
  const push = (s: string, st: St, it: boolean) => {
    const last = runs[runs.length - 1];
    if (last && !last.acc && last.size === st.size && last.shift === st.shift && last.it === it && last.bf === st.bf) last.s += s;
    else runs.push({ s, size: st.size, shift: st.shift, it, bf: st.bf });
  };
  const walk = (list: Node[], st: St) => {
    for (const n of list) {
      switch (n.t) {
        case 'c': {
          const letter = /[A-Za-z]/.test(n.v);
          const it = st.force === 'rm' ? false : st.force === 'it' ? true : (math && letter) || baseIt;
          push(n.v, st, it);
          break;
        }
        case 'sym':
          push(n.v, st, st.force === 'it' || (st.force !== 'rm' && baseIt));
          break;
        case 'g':
          walk(n.c, st);
          break;
        case 'sty':
          if (n.s === 'bf') walk(n.c, { ...st, bf: true });
          else walk(n.c, { ...st, force: n.s });
          break;
        case 'acc': {
          // 带附加符号的部分单独成段（不与前后合并），用含组合字符的数学字体渲染
          for (const r of flatten(n.c, math, baseIt, st.bf)) {
            runs.push({
              ...r,
              s: Array.from(r.s).map((c) => c + n.a).join(''),
              size: r.size * st.size,
              shift: st.shift + r.shift * st.size,
              acc: true,
            });
          }
          break;
        }
        case 'sup':
        case 'sub': {
          const size = st.size * 0.7;
          const shift = st.shift + (n.t === 'sup' ? -0.42 * st.size : 0.22 * st.size);
          walk(n.c, { ...st, size, shift });
          break;
        }
      }
    }
  };
  walk(nodes, { size: 1, shift: 0, bf: baseBf, force: null });
  return runs;
}

export interface TextStyle {
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  math?: boolean;
}

/** 生成 <text> 标记，坐标原点为文本框左上角 */
export function textMarkup(s: TextStyle): string {
  const size = s.fontSize ?? 20;
  const lh = LINE_HEIGHT * size;
  const asc = ASCENT * size;
  const lines = String(s.text ?? '').split('\n');
  const fam = esc(s.fontFamily ?? 'Times New Roman');
  let out = `<text x="0" y="${r2(asc)}" font-family="${fam}, SimSun, serif" font-size="${r2(size)}" fill="${esc(s.color ?? '#000000')}"` +
    `${s.bold ? ' font-weight="bold"' : ''}${!s.math && s.italic ? ' font-style="italic"' : ''} xml:space="preserve">`;
  lines.forEach((line, li) => {
    out += `<tspan x="0" y="${r2(asc + li * lh)}">`;
    if (!line.length) { out += ' </tspan>'; return; }
    if (!s.math && !/[\\^_]/.test(line)) {
      out += esc(line) + '</tspan>';
      return;
    }
    const runs = flatten(parse(line), !!s.math, !!s.italic, !!s.bold);
    let cur = 0;
    for (const r of runs) {
      const dy = r.shift * size - cur;
      cur = r.shift * size;
      let a = '';
      if (Math.abs(dy) > 0.001) a += ` dy="${r2(dy)}"`;
      if (r.size !== 1) a += ` font-size="${r2(r.size * size)}"`;
      if (r.it !== (!s.math && !!s.italic)) a += ` font-style="${r.it ? 'italic' : 'normal'}"`;
      if (r.bf && !s.bold) a += ' font-weight="bold"';
      if (r.acc) a += ` font-family="${ACCENT_FONT}"`;
      out += a ? `<tspan${a}>${esc(r.s)}</tspan>` : esc(r.s);
    }
    out += '</tspan>';
  });
  return out + '</text>';
}

let measureSvg: SVGSVGElement | null = null;

/** 用隐藏 SVG 实测文本尺寸（公式上下标、字体回退都能算准） */
export function measureTextBox(s: TextStyle): { w: number; h: number } {
  const size = s.fontSize ?? 20;
  const lines = String(s.text ?? '').split('\n').length;
  const h = lines * LINE_HEIGHT * size;
  if (!measureSvg) {
    measureSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    measureSvg.setAttribute('style', 'position:absolute;left:-10000px;top:-10000px;width:10px;height:10px;visibility:hidden');
    document.body.appendChild(measureSvg);
  }
  measureSvg.innerHTML = textMarkup(s);
  let w = 0;
  try {
    w = (measureSvg.firstElementChild as SVGGraphicsElement).getBBox().width;
  } catch {
    w = estimateWidth(s);
  }
  return { w: Math.max(w, size * 0.5), h };
}

function estimateWidth(s: TextStyle): number {
  const size = s.fontSize ?? 20;
  let maxW = 0;
  for (const l of String(s.text ?? '').split('\n')) {
    const plain = l.replace(/\\[a-zA-Z]+/g, 'x').replace(/[{}^_]/g, '');
    let w = 0;
    for (const ch of plain) w += ch.charCodeAt(0) > 255 ? 1 : 0.55;
    maxW = Math.max(maxW, w * size);
  }
  return maxW;
}
