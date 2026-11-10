// Image pipeline for MudImageEditor: pure functions, no DOM, so they run (and are tested) anywhere.
//   - adjustments on RGBA pixels (exposure, brightness, contrast, highlights / shadows, temperature, tint,
//     saturation, vibrance, hue, grayscale, sepia, invert, vignette, grain, sharpen) and filter presets
//   - histogram
//   - rotation geometry: the bounds of a rotated image and how points move when it is rotated or flipped
//   - crop rectangles with an aspect ratio, and how an output size fits a source (cover, contain, width, …)

export const DEFAULT_ADJUSTMENTS = Object.freeze({
  exposure: 0, // -100…100 (±2 stops)
  brightness: 0, // -100…100
  contrast: 0, // -100…100
  highlights: 0, // -100…100
  shadows: 0, // -100…100
  temperature: 0, // -100 (cool) … 100 (warm)
  tint: 0, // -100 (green) … 100 (magenta)
  saturation: 0, // -100…100
  vibrance: 0, // -100…100
  hue: 0, // -180…180 degrees
  grayscale: 0, // 0…100
  sepia: 0, // 0…100
  invert: 0, // 0 | 100
  vignette: 0, // 0…100
  grain: 0, // 0…100
  sharpen: 0, // 0…100
  blur: 0, // 0…20 px (applied by the canvas, not here)
});

/** Named looks: partial adjustments merged over the defaults. */
export const FILTER_PRESETS = Object.freeze({
  none: {},
  vivid: { contrast: 18, saturation: 35, vibrance: 20 },
  warm: { temperature: 35, saturation: 10, exposure: 4 },
  cool: { temperature: -35, tint: -5, contrast: 6 },
  fade: { contrast: -28, brightness: 10, saturation: -20, shadows: 30 },
  mono: { grayscale: 100, contrast: 12 },
  noir: { grayscale: 100, contrast: 45, exposure: -8, vignette: 45 },
  sepia: { sepia: 85, contrast: 6, vignette: 20 },
  vintage: { sepia: 35, contrast: -12, saturation: -15, temperature: 20, vignette: 35, grain: 25 },
  drama: { contrast: 40, highlights: -30, shadows: 25, saturation: 15, vignette: 30 },
  matte: { contrast: -18, shadows: 40, saturation: -10, brightness: 4 },
  newsprint: { grayscale: 100, contrast: 60, grain: 35, sharpen: 30 },
});

export const ASPECT_RATIOS = Object.freeze([
  { id: 'free', label: 'Free', value: null },
  { id: 'original', label: 'Original', value: 'original' },
  { id: '1:1', label: '1:1', value: 1 },
  { id: '4:3', label: '4:3', value: 4 / 3 },
  { id: '3:2', label: '3:2', value: 3 / 2 },
  { id: '16:9', label: '16:9', value: 16 / 9 },
  { id: '21:9', label: '21:9', value: 21 / 9 },
  { id: '4:5', label: '4:5', value: 4 / 5 },
  { id: '3:4', label: '3:4', value: 3 / 4 },
  { id: '9:16', label: '9:16', value: 9 / 16 },
]);

/** Common output sizes for news / sport / art sites. fit: cover | contain | width | height | fill | inside. */
export const SIZE_PRESETS = Object.freeze([
  { name: 'thumbnail', width: 160, height: 160, fit: 'cover' },
  { name: 'card', width: 640, height: 360, fit: 'cover' },
  { name: 'article', width: 1200, fit: 'width' },
  { name: 'hero', width: 1920, height: 1080, fit: 'cover' },
  { name: 'social', width: 1200, height: 630, fit: 'cover' },
  { name: 'square', width: 1080, height: 1080, fit: 'cover' },
  { name: 'story', width: 1080, height: 1920, fit: 'cover' },
]);

const clamp = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);
const clamp255 = (n) => (n < 0 ? 0 : n > 255 ? 255 : n);

export function isNeutral(adj) {
  return Object.keys(DEFAULT_ADJUSTMENTS).every((k) => (adj?.[k] ?? 0) === DEFAULT_ADJUSTMENTS[k]);
}

/** Adjustments with the preset applied over the defaults (unknown preset = defaults). */
export function presetAdjustments(name) {
  return { ...DEFAULT_ADJUSTMENTS, ...(FILTER_PRESETS[name] ?? {}) };
}

/** Hue rotation as a 3×3 matrix (the same one CSS hue-rotate uses). */
function hueMatrix(deg) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}

/** A small deterministic PRNG for grain, so previews and exports match. */
function prng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) / 4294967296) - 0.5; };
}

/**
 * Applies adjustments to RGBA pixels in place. `image` is { data: Uint8ClampedArray, width, height } (an ImageData).
 * Returns the same object.
 */
export function applyAdjustments(image, adjustments) {
  const a = { ...DEFAULT_ADJUSTMENTS, ...(adjustments ?? {}) };
  if (isNeutral(a)) return image;
  const { data, width, height } = image;

  const exposure = 2 ** (a.exposure / 50);
  const brightness = a.brightness * 1.28;
  const contrast = (259 * (a.contrast * 1.28 + 255)) / (255 * (259 - a.contrast * 1.28));
  const temp = a.temperature * 0.3;
  const tint = a.tint * 0.3;
  const sat = 1 + a.saturation / 100;
  const vib = a.vibrance / 100;
  const hl = a.highlights / 100;
  const sh = a.shadows / 100;
  const hue = a.hue ? hueMatrix(a.hue) : null;
  const gray = a.grayscale / 100;
  const sepia = a.sepia / 100;
  const invert = a.invert >= 50;
  const vignette = a.vignette / 100;
  const grain = a.grain * 0.9;
  const rand = grain ? prng(width * 7919 + height) : null;
  const cx = width / 2;
  const cy = height / 2;
  const maxD = Math.hypot(cx, cy) || 1;

  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      if (exposure !== 1) { r *= exposure; g *= exposure; b *= exposure; }
      if (brightness) { r += brightness; g += brightness; b += brightness; }
      if (a.contrast) { r = contrast * (r - 128) + 128; g = contrast * (g - 128) + 128; b = contrast * (b - 128) + 128; }

      if (hl || sh) {
        const l = clamp((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, 0, 1);
        // Highlights act on the bright half, shadows on the dark half, fading out towards the middle.
        const lift = (hl * Math.max(0, l - 0.5) * 2 + sh * Math.max(0, 0.5 - l) * 2) * 80;
        r += lift; g += lift; b += lift;
      }
      if (temp) { r += temp; b -= temp; }
      if (tint) { g -= tint; r += tint * 0.5; b += tint * 0.5; }

      if (sat !== 1 || vib) {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        let s = sat;
        if (vib) {
          // Vibrance boosts muted colours more than saturated ones.
          const mx = Math.max(r, g, b);
          const mn = Math.min(r, g, b);
          const current = mx ? (mx - mn) / mx : 0;
          s *= 1 + vib * (1 - current);
        }
        r = l + (r - l) * s; g = l + (g - l) * s; b = l + (b - l) * s;
      }
      if (hue) {
        const nr = r * hue[0] + g * hue[1] + b * hue[2];
        const ng = r * hue[3] + g * hue[4] + b * hue[5];
        const nb = r * hue[6] + g * hue[7] + b * hue[8];
        r = nr; g = ng; b = nb;
      }
      if (gray) {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r += (l - r) * gray; g += (l - g) * gray; b += (l - b) * gray;
      }
      if (sepia) {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        r += (sr - r) * sepia; g += (sg - g) * sepia; b += (sb - b) * sepia;
      }
      if (invert) { r = 255 - r; g = 255 - g; b = 255 - b; }
      if (vignette) {
        const d = Math.hypot(x - cx, y - cy) / maxD;
        const f = 1 - vignette * Math.max(0, d - 0.35) * 1.4;
        r *= f; g *= f; b *= f;
      }
      if (grain) { const n = rand() * grain; r += n; g += n; b += n; }

      data[i] = clamp255(r);
      data[i + 1] = clamp255(g);
      data[i + 2] = clamp255(b);
    }
  }
  if (a.sharpen) sharpen(image, a.sharpen / 100);
  return image;
}

/** Unsharp-style 3×3 sharpen in place; amount 0…1. */
export function sharpen(image, amount) {
  const { data, width: w, height: h } = image;
  if (w < 3 || h < 3 || !amount) return image;
  const src = new Uint8ClampedArray(data);
  const k = amount * 1.5;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const n = src[i - 4 + c] + src[i + 4 + c] + src[i - w * 4 + c] + src[i + w * 4 + c];
        data[i + c] = clamp255(src[i + c] * (1 + 4 * k) - n * k);
      }
    }
  }
  return image;
}

/** 256-bin histograms of red, green, blue and luminance. `step` samples every nth pixel (faster on big images). */
export function histogram(image, step = 1) {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const l = new Uint32Array(256);
  const { data } = image;
  const stride = 4 * Math.max(1, step | 0);
  for (let i = 0; i < data.length; i += stride) {
    if (data[i + 3] === 0) continue;
    r[data[i]]++; g[data[i + 1]]++; b[data[i + 2]]++;
    l[Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])]++;
  }
  return { r, g, b, l };
}

// ───────── geometry ─────────

/** The size of the box that holds a w×h image rotated by `deg` degrees. */
export function rotatedBounds(w, h, deg) {
  const a = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  // Round away float noise (cos 90° is 6e-17), not real fractions.
  return { width: Math.round(w * c + h * s), height: Math.round(w * s + h * c) };
}

/**
 * Where a point of a rotated/flipped image lands when the transform changes.
 * `from` and `to` are { deg, flipH, flipV }; the source image is w×h; points are in the rotated image's box.
 */
export function mapPoint(p, w, h, from, to) {
  const fb = rotatedBounds(w, h, from.deg);
  const tb = rotatedBounds(w, h, to.deg);
  // The image is drawn as rotate(deg) · flip · source (see drawTransformed). Undo the old one (rotate back,
  // then unflip: a flip is its own inverse), then apply the new one (flip, then rotate).
  let x = p.x - fb.width / 2;
  let y = p.y - fb.height / 2;
  const back = (-from.deg * Math.PI) / 180;
  [x, y] = [x * Math.cos(back) - y * Math.sin(back), x * Math.sin(back) + y * Math.cos(back)];
  if (from.flipH) x = -x;
  if (from.flipV) y = -y;
  if (to.flipH) x = -x;
  if (to.flipV) y = -y;
  const fwd = (to.deg * Math.PI) / 180;
  [x, y] = [x * Math.cos(fwd) - y * Math.sin(fwd), x * Math.sin(fwd) + y * Math.cos(fwd)];
  return { x: x + tb.width / 2, y: y + tb.height / 2 };
}

/** The rectangle around a mapped rectangle (crop after a rotation or a flip), clamped to the new bounds. */
export function mapRect(rect, w, h, from, to) {
  const corners = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]]
    .map(([x, y]) => mapPoint({ x, y }, w, h, from, to));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const tb = rotatedBounds(w, h, to.deg);
  return clampRect({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }, tb);
}

/** Keeps a rectangle inside { width, height }, rounded to whole pixels, at least 1×1. */
export function clampRect(r, bounds) {
  const x = clamp(Math.round(r.x), 0, bounds.width - 1);
  const y = clamp(Math.round(r.y), 0, bounds.height - 1);
  return { x, y, width: clamp(Math.round(r.width), 1, bounds.width - x), height: clamp(Math.round(r.height), 1, bounds.height - y) };
}

/** The ratio value for an aspect id/number ('original' resolves to the image's own ratio). */
export function resolveRatio(ratio, bounds) {
  if (ratio == null || ratio === 'free') return null;
  if (ratio === 'original') return bounds.width / bounds.height;
  if (typeof ratio === 'number') return ratio;
  const found = ASPECT_RATIOS.find((r) => r.id === ratio);
  if (found) return resolveRatio(found.value, bounds);
  const m = /^(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)$/.exec(String(ratio));
  return m ? Number(m[1]) / Number(m[2]) : null;
}

/** The largest rectangle with this ratio, centred in the bounds (or the whole image when the ratio is free). */
export function centeredCrop(bounds, ratio) {
  const r = resolveRatio(ratio, bounds);
  if (!r) return { x: 0, y: 0, width: bounds.width, height: bounds.height };
  let width = bounds.width;
  let height = width / r;
  if (height > bounds.height) { height = bounds.height; width = height * r; }
  return clampRect({ x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height }, bounds);
}

/**
 * Resizes a crop rectangle by dragging one handle (n, s, e, w, ne, nw, se, sw) by dx/dy, keeping the ratio
 * when there is one and the rectangle inside the bounds. Returns a new rectangle.
 */
export function resizeCrop(rect, handle, dx, dy, ratio, bounds, min = 8) {
  let { x, y, width: w, height: h } = rect;
  const right = x + w;
  const bottom = y + h;
  if (handle.includes('e')) w = clamp(w + dx, min, bounds.width - x);
  if (handle.includes('s')) h = clamp(h + dy, min, bounds.height - y);
  if (handle.includes('w')) { const nx = clamp(x + dx, 0, right - min); w = right - nx; x = nx; }
  if (handle.includes('n')) { const ny = clamp(y + dy, 0, bottom - min); h = bottom - ny; y = ny; }
  if (ratio) {
    const horizontal = handle === 'e' || handle === 'w' || (handle.length === 2 && Math.abs(dx) >= Math.abs(dy));
    if (horizontal) h = w / ratio; else w = h * ratio;
    // Grow from the fixed side, then shrink to fit.
    if (handle.includes('n')) y = bottom - h;
    if (handle.includes('w')) x = right - w;
    if (handle === 'e' || handle === 'w') y = rect.y + (rect.height - h) / 2;
    if (handle === 'n' || handle === 's') x = rect.x + (rect.width - w) / 2;
    const scale = Math.min(1, x < 0 ? (w + x) / w : 1, y < 0 ? (h + y) / h : 1,
      x + w > bounds.width ? (bounds.width - Math.max(0, x)) / w : 1, y + h > bounds.height ? (bounds.height - Math.max(0, y)) / h : 1);
    if (scale < 1) {
      const nw = w * scale;
      const nh = h * scale;
      if (handle.includes('w')) x = right - nw;
      if (handle.includes('n')) y = bottom - nh;
      w = nw; h = nh;
    }
    x = Math.max(0, x); y = Math.max(0, y);
  }
  return { x, y, width: w, height: h };
}

/** Moves a rectangle by dx/dy inside the bounds. */
export function moveCrop(rect, dx, dy, bounds) {
  return { ...rect, x: clamp(rect.x + dx, 0, bounds.width - rect.width), y: clamp(rect.y + dy, 0, bounds.height - rect.height) };
}

/**
 * How an output size takes a w×h source. Returns the canvas size and the source rectangle drawn into it.
 *   cover   fill width×height, cropping the overflow (centred)
 *   contain fit inside width×height; the canvas is the fitted size
 *   width   the given width, height from the ratio (or height to the given height)
 *   inside  like contain, but never larger than the source
 *   fill    exactly width×height, stretched
 */
export function fitSize(srcW, srcH, { width, height, fit = 'cover' } = {}) {
  const ratio = srcW / srcH;
  const full = { sx: 0, sy: 0, sw: srcW, sh: srcH };
  if (fit === 'width' || (!height && width)) return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(width / ratio)), ...full };
  if (fit === 'height' || (!width && height)) return { width: Math.max(1, Math.round(height * ratio)), height: Math.max(1, Math.round(height)), ...full };
  if (!width && !height) return { width: srcW, height: srcH, ...full };
  if (fit === 'fill') return { width: Math.round(width), height: Math.round(height), ...full };
  if (fit === 'contain' || fit === 'inside') {
    let s = Math.min(width / srcW, height / srcH);
    if (fit === 'inside') s = Math.min(1, s);
    return { width: Math.max(1, Math.round(srcW * s)), height: Math.max(1, Math.round(srcH * s)), ...full };
  }
  // cover
  const target = width / height;
  let sw = srcW;
  let sh = srcH;
  if (ratio > target) sw = srcH * target; else sh = srcW / target;
  return { width: Math.round(width), height: Math.round(height), sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

/** File type for a format name. */
export function mimeType(format) {
  const f = String(format ?? 'jpeg').toLowerCase().replace('jpg', 'jpeg');
  return f.startsWith('image/') ? f : `image/${f}`;
}

export function extension(mime) {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }[mime] ?? 'img';
}

/** "1.4 MB" */
export function formatBytes(bytes, format = (n) => String(Math.round(n * 10) / 10)) {
  if (!Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${format(i ? n : Math.round(n))} ${units[i]}`;
}
