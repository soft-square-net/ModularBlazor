// MudTail Animator: vector shapes and motion paths as SVG path data. Every shape is one <path> drawn at the layer's
// size, so any shape can morph into any other (MorphSVGPlugin), be drawn on (DrawSVGPlugin) or guide a motion path.
// Pure: no DOM, no GSAP core (only GSAP's path utilities).

import { stringToRawPath, rawPathToString, transformRawPath } from 'gsap/utils/paths.js';

const K = 0.5522847498; // circle → cubic bézier handle length

const f = (n) => Math.round(n * 100) / 100;
const pts = (list) => list.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)},${f(y)}`).join(' ') + ' Z';

/** Shape names with labels, for the Studio's library and inspector. */
export const SHAPES = Object.freeze([
  ['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['triangle', 'Triangle'], ['diamond', 'Diamond'], ['polygon', 'Polygon'],
  ['star', 'Star'], ['heart', 'Heart'], ['blob', 'Blob'], ['arrow', 'Arrow'], ['cross', 'Cross'], ['moon', 'Moon'],
  ['bubble', 'Speech bubble'], ['burst', 'Burst'], ['cloud', 'Cloud'], ['drop', 'Drop'], ['wave', 'Wave'], ['line', 'Line'],
  ['custom', 'Custom path'],
]);

/**
 * Path data for a shape at width × height. Options: corner (rect radius), points (polygon / star / burst corners),
 * innerRadius (star / burst, 0–1), seed (blob), d (custom path, drawn in a 0–100 box and scaled to the size).
 */
export function shapePath(shape, width, height, opts = {}) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  switch (shape) {
    case 'ellipse': return ellipse(w / 2, h / 2, w / 2, h / 2);
    case 'triangle': return pts([[w / 2, 0], [w, h], [0, h]]);
    case 'diamond': return pts([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case 'polygon': return pts(regular(w, h, Math.max(3, opts.points ?? 6), 1, 1));
    case 'star': return pts(starPoints(w, h, Math.max(3, opts.points ?? 5), opts.innerRadius ?? 0.45));
    case 'burst': return pts(starPoints(w, h, Math.max(6, opts.points ?? 16), opts.innerRadius ?? 0.75));
    case 'heart': return heart(w, h);
    case 'blob': return blob(w, h, opts.seed ?? 3, opts.points ?? 7);
    case 'arrow': return pts([[0, h * 0.32], [w * 0.6, h * 0.32], [w * 0.6, 0], [w, h / 2], [w * 0.6, h], [w * 0.6, h * 0.68], [0, h * 0.68]]);
    case 'cross': {
      const t = Math.min(w, h) * 0.32;
      const x0 = (w - t) / 2; const y0 = (h - t) / 2;
      return pts([[x0, 0], [x0 + t, 0], [x0 + t, y0], [w, y0], [w, y0 + t], [x0 + t, y0 + t], [x0 + t, h], [x0, h], [x0, y0 + t], [0, y0 + t], [0, y0], [x0, y0]]);
    }
    case 'moon': return `M${f(w * 0.62)},0 C${f(w * 0.2)},${f(h * 0.02)} 0,${f(h * 0.25)} 0,${f(h / 2)} C0,${f(h * 0.78)} ${f(w * 0.22)},${f(h)} ${f(w * 0.62)},${f(h)} C${f(w * 0.82)},${f(h)} ${f(w)},${f(h * 0.9)} ${f(w)},${f(h * 0.9)} C${f(w * 0.55)},${f(h * 0.85)} ${f(w * 0.38)},${f(h * 0.7)} ${f(w * 0.38)},${f(h / 2)} C${f(w * 0.38)},${f(h * 0.3)} ${f(w * 0.55)},${f(h * 0.13)} ${f(w)},${f(h * 0.1)} C${f(w)},${f(h * 0.1)} ${f(w * 0.82)},0 ${f(w * 0.62)},0 Z`;
    case 'bubble': {
      const r = Math.min(w, h) * 0.12; const bh = h * 0.78;
      return `M${f(r)},0 L${f(w - r)},0 Q${f(w)},0 ${f(w)},${f(r)} L${f(w)},${f(bh - r)} Q${f(w)},${f(bh)} ${f(w - r)},${f(bh)} L${f(w * 0.42)},${f(bh)} L${f(w * 0.2)},${f(h)} L${f(w * 0.25)},${f(bh)} L${f(r)},${f(bh)} Q0,${f(bh)} 0,${f(bh - r)} L0,${f(r)} Q0,0 ${f(r)},0 Z`;
    }
    case 'cloud': return `M${f(w * 0.25)},${f(h)} C${f(w * 0.05)},${f(h)} 0,${f(h * 0.62)} ${f(w * 0.18)},${f(h * 0.55)} C${f(w * 0.12)},${f(h * 0.2)} ${f(w * 0.42)},${f(h * 0.05)} ${f(w * 0.55)},${f(h * 0.3)} C${f(w * 0.68)},0 ${f(w)},${f(h * 0.12)} ${f(w * 0.88)},${f(h * 0.5)} C${f(w)},${f(h * 0.55)} ${f(w)},${f(h)} ${f(w * 0.8)},${f(h)} Z`;
    case 'drop': return `M${f(w / 2)},0 C${f(w / 2)},0 ${f(w)},${f(h * 0.45)} ${f(w)},${f(h * 0.66)} C${f(w)},${f(h * 0.85)} ${f(w * 0.78)},${f(h)} ${f(w / 2)},${f(h)} C${f(w * 0.22)},${f(h)} 0,${f(h * 0.85)} 0,${f(h * 0.66)} C0,${f(h * 0.45)} ${f(w / 2)},0 ${f(w / 2)},0 Z`;
    case 'wave': {
      const n = Math.max(1, opts.points ?? 3); const seg = w / n; let d = `M0,${f(h / 2)}`;
      for (let i = 0; i < n; i++) d += ` C${f(seg * i + seg * 0.35)},0 ${f(seg * i + seg * 0.65)},${f(h)} ${f(seg * (i + 1))},${f(h / 2)}`;
      return d;
    }
    case 'line': return `M0,${f(h / 2)} L${f(w)},${f(h / 2)}`;
    case 'custom': return opts.d ? scalePath(opts.d, w / 100, h / 100) : rect(w, h, 0);
    case 'rect':
    default: return rect(w, h, opts.corner ?? 0);
  }
}

/** Whether a shape is open (a stroke, not a fill). */
export function isOpenShape(shape) {
  return shape === 'line' || shape === 'wave';
}

function rect(w, h, corner) {
  const r = Math.max(0, Math.min(corner, w / 2, h / 2));
  if (!r) return `M0,0 L${f(w)},0 L${f(w)},${f(h)} L0,${f(h)} Z`;
  const k = r * (1 - K);
  return `M${f(r)},0 L${f(w - r)},0 C${f(w - k)},0 ${f(w)},${f(k)} ${f(w)},${f(r)} L${f(w)},${f(h - r)} C${f(w)},${f(h - k)} ${f(w - k)},${f(h)} ${f(w - r)},${f(h)} L${f(r)},${f(h)} C${f(k)},${f(h)} 0,${f(h - k)} 0,${f(h - r)} L0,${f(r)} C0,${f(k)} ${f(k)},0 ${f(r)},0 Z`;
}

function ellipse(cx, cy, rx, ry) {
  const kx = rx * K; const ky = ry * K;
  return `M${f(cx)},${f(cy - ry)} C${f(cx + kx)},${f(cy - ry)} ${f(cx + rx)},${f(cy - ky)} ${f(cx + rx)},${f(cy)} C${f(cx + rx)},${f(cy + ky)} ${f(cx + kx)},${f(cy + ry)} ${f(cx)},${f(cy + ry)} C${f(cx - kx)},${f(cy + ry)} ${f(cx - rx)},${f(cy + ky)} ${f(cx - rx)},${f(cy)} C${f(cx - rx)},${f(cy - ky)} ${f(cx - kx)},${f(cy - ry)} ${f(cx)},${f(cy - ry)} Z`;
}

function regular(w, h, n, rx = 1, ry = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    out.push([w / 2 + (Math.cos(a) * w * rx) / 2, h / 2 + (Math.sin(a) * h * ry) / 2]);
  }
  return out;
}

function starPoints(w, h, n, inner) {
  const out = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 ? inner : 1;
    out.push([w / 2 + (Math.cos(a) * w * r) / 2, h / 2 + (Math.sin(a) * h * r) / 2]);
  }
  return out;
}

function heart(w, h) {
  return `M${f(w / 2)},${f(h * 0.28)} C${f(w / 2)},${f(h * 0.1)} ${f(w * 0.36)},0 ${f(w * 0.24)},0 C${f(w * 0.08)},0 0,${f(h * 0.14)} 0,${f(h * 0.3)} C0,${f(h * 0.55)} ${f(w * 0.25)},${f(h * 0.72)} ${f(w / 2)},${f(h)} C${f(w * 0.75)},${f(h * 0.72)} ${f(w)},${f(h * 0.55)} ${f(w)},${f(h * 0.3)} C${f(w)},${f(h * 0.14)} ${f(w * 0.92)},0 ${f(w * 0.76)},0 C${f(w * 0.64)},0 ${f(w / 2)},${f(h * 0.1)} ${f(w / 2)},${f(h * 0.28)} Z`;
}

/** A smooth closed blob through n points at seeded radii (Catmull-Rom → cubic béziers). */
function blob(w, h, seed, n) {
  let s = Math.max(1, Math.floor(seed)) * 9301 + 49297;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.72 + rand() * 0.28;
    p.push([w / 2 + (Math.cos(a) * w * r) / 2, h / 2 + (Math.sin(a) * h * r) / 2]);
  }
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n]; const p1 = p[i]; const p2 = p[(i + 1) % n]; const p3 = p[(i + 2) % n];
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return `${d} Z`;
}

/** Scales path data (any commands, relative or absolute, arcs included) by sx, sy. */
export function scalePath(d, sx, sy, tx = 0, ty = 0) {
  try {
    const raw = stringToRawPath(String(d));
    transformRawPath(raw, sx, 0, 0, sy, tx, ty);
    return rawPathToString(raw);
  } catch {
    return '';
  }
}

/** Whether a string looks like SVG path data. */
export function isPathData(d) {
  return typeof d === 'string' && /^\s*[Mm]\s*[-\d.]/.test(d);
}

// ───────────── motion paths ─────────────

/** Built-in motion paths, drawn relative to the layer (they start at 0,0, so the layer moves from where it is). */
export const MOTION_PATHS = Object.freeze([
  ['arc', 'Arc'], ['wave', 'Wave'], ['loop', 'Loop-the-loop'], ['circle', 'Circle'], ['figure8', 'Figure eight'],
  ['zigzag', 'Zigzag'], ['spiral', 'Spiral'], ['bounce', 'Bounces'], ['swoop', 'Swoop'], ['heart', 'Heart'],
]);

/** Path data for a built-in motion path spanning width × height (negative height arcs downwards). */
export function motionPath(name, width = 600, height = 200) {
  const w = width; const h = height;
  switch (name) {
    case 'wave': return `M0,0 C${f(w * 0.12)},${f(-h)} ${f(w * 0.25)},${f(-h)} ${f(w * 0.33)},0 S${f(w * 0.55)},${f(h)} ${f(w * 0.66)},0 S${f(w * 0.9)},${f(-h)} ${f(w)},0`;
    case 'loop': return `M0,0 C${f(w * 0.3)},0 ${f(w * 0.62)},${f(-h * 0.1)} ${f(w * 0.62)},${f(-h * 0.6)} C${f(w * 0.62)},${f(-h * 1.05)} ${f(w * 0.38)},${f(-h * 1.05)} ${f(w * 0.38)},${f(-h * 0.6)} C${f(w * 0.38)},${f(-h * 0.1)} ${f(w * 0.7)},0 ${f(w)},0`;
    case 'circle': { const r = Math.min(w, Math.abs(h)) / 2; return `M0,0 C${f(r * K)},0 ${f(r)},${f(r - r * K)} ${f(r)},${f(r)} C${f(r)},${f(r + r * K)} ${f(r * K)},${f(2 * r)} 0,${f(2 * r)} C${f(-r * K)},${f(2 * r)} ${f(-r)},${f(r + r * K)} ${f(-r)},${f(r)} C${f(-r)},${f(r - r * K)} ${f(-r * K)},0 0,0`; }
    case 'figure8': { const r = Math.min(w / 4, Math.abs(h) / 2); return `M0,0 C${f(r * 0.6)},${f(-r)} ${f(r * 2)},${f(-r)} ${f(r * 2)},0 C${f(r * 2)},${f(r)} ${f(r * 0.6)},${f(r)} 0,0 C${f(-r * 0.6)},${f(-r)} ${f(-r * 2)},${f(-r)} ${f(-r * 2)},0 C${f(-r * 2)},${f(r)} ${f(-r * 0.6)},${f(r)} 0,0`; }
    case 'zigzag': { const n = 6; return `M0,0 ${Array.from({ length: n }, (_, i) => `L${f((w * (i + 1)) / n)},${f(i % 2 ? 0 : -h)}`).join(' ')}`; }
    case 'spiral': {
      let d = 'M0,0'; const turns = 3; const steps = 48;
      for (let i = 1; i <= steps; i++) { const t = i / steps; const a = t * turns * Math.PI * 2; const r = t * Math.min(w, Math.abs(h)) / 2; d += ` L${f(Math.cos(a) * r - 0)},${f(Math.sin(a) * r)}`; }
      return d;
    }
    case 'bounce': {
      let d = 'M0,0'; let x = 0; let amp = h; const hops = 4;
      for (let i = 0; i < hops; i++) { const span = (w / hops) * (1 - i * 0.12); d += ` C${f(x + span * 0.15)},${f(-amp)} ${f(x + span * 0.85)},${f(-amp)} ${f(x + span)},0`; x += span; amp *= 0.55; }
      return d;
    }
    case 'swoop': return `M0,0 C${f(w * 0.2)},${f(h * 1.2)} ${f(w * 0.7)},${f(h * 1.2)} ${f(w)},${f(-h * 0.4)}`;
    case 'heart': return scalePath(heart(100, 100), w / 100, Math.abs(h) / 100, -w / 2, -Math.abs(h) * 0.28) || 'M0,0';
    case 'arc':
    default: return `M0,0 C${f(w * 0.25)},${f(-h)} ${f(w * 0.75)},${f(-h)} ${f(w)},0`;
  }
}
