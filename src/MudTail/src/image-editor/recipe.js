// Image recipes: everything needed to turn the original image into the exported files again.
//
// A recipe is plain JSON (store it in a database column next to the original). It records the source it was made
// for (size, type, SHA-256), the edit (rotation, flips, straighten, adjustments, drawings, crop, resize) and the
// outputs (format, quality, sizes). renderRecipe(original, recipe) replays it with the same code the editor exports
// with, so the same original gives the same files; editor.applyRecipe(recipe) reopens it for more editing.
//
//   {
//     "type": "mudtail.image-recipe", "version": 1, "createdAt": "2026-11-10T09:30:00.000Z",
//     "source": { "name": "harbour", "width": 2400, "height": 1600, "type": "image/jpeg", "bytes": 482113, "sha256": "…" },
//     "pipeline": ["rotate", "flip", "straighten", "background", "blur", "adjust", "annotate", "crop", "resize", "sizes", "encode"],
//     "edit": { "quarter": 0, "angle": 0, "flipH": false, "flipV": false, "background": null,
//               "adjust": { "contrast": 15, … }, "preset": "custom", "annotations": [ … ],
//               "crop": { "x": 0, "y": 150, "width": 2400, "height": 1350 }, "resize": { "width": 1600, "height": null } },
//     "output": { "format": "webp", "quality": 0.86, "includeOriginal": true, "fileName": "harbour",
//                 "sizes": [{ "name": "thumbnail", "width": 160, "height": 160, "fit": "cover" }, …] },
//     "files": [{ "name": "thumbnail", "fileName": "harbour-thumbnail.webp", "width": 160, "height": 160, "type": "image/webp", "bytes": 5120 }]
//   }
//
// Coordinates (crop, drawings) are pixels of the full-size original after rotation. When a recipe is replayed on an
// original of another resolution with the same proportions (a higher-resolution master, say), they are scaled.

import { DEFAULT_ADJUSTMENTS } from './pipeline.js';

export const RECIPE_TYPE = 'mudtail.image-recipe';
export const RECIPE_VERSION = 1;
export const PIPELINE = Object.freeze(['rotate', 'flip', 'straighten', 'background', 'blur', 'adjust', 'annotate', 'crop', 'resize', 'sizes', 'encode']);

const FORMATS = ['webp', 'jpeg', 'png', 'avif'];
const FITS = ['cover', 'contain', 'width', 'height', 'inside', 'fill'];
const SHAPES = ['brush', 'highlighter', 'rect', 'ellipse', 'arrow', 'line', 'text'];
const ADJUST_RANGES = {
  exposure: [-100, 100], brightness: [-100, 100], contrast: [-100, 100], highlights: [-100, 100], shadows: [-100, 100],
  temperature: [-100, 100], tint: [-100, 100], saturation: [-100, 100], vibrance: [-100, 100], hue: [-180, 180],
  grayscale: [0, 100], sepia: [0, 100], invert: [0, 100], vignette: [0, 100], grain: [0, 100], sharpen: [0, 100], blur: [0, 20],
};
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,20})$/i;

export class RecipeError extends Error {
  constructor(message, problems = []) {
    super(message);
    this.name = 'RecipeError';
    this.problems = problems;
  }
}

const num = (v, lo, hi, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const color = (v, fallback = null) => (typeof v === 'string' && COLOR.test(v.trim()) ? v.trim() : fallback);
const safeName = (v, fallback) => (String(v ?? '').toLowerCase().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback);

/** Builds a recipe from what the editor knows. `files` (optional) records what was produced, for checking later. */
export function createRecipe({ source, edit, output, files = null, createdAt = new Date().toISOString() }) {
  const recipe = {
    type: RECIPE_TYPE,
    version: RECIPE_VERSION,
    createdAt,
    source: {
      name: source?.name ?? 'image',
      width: source?.width ?? 0,
      height: source?.height ?? 0,
      type: source?.type || null,
      bytes: source?.bytes ?? source?.size ?? null,
      sha256: source?.sha256 ?? null,
    },
    pipeline: [...PIPELINE],
    edit: normalizeEdit(edit),
    output: normalizeOutput(output),
  };
  if (files?.length) {
    recipe.files = files.map((f) => ({ name: f.name, fileName: f.fileName, width: f.width, height: f.height, type: f.type, bytes: f.size ?? f.bytes ?? null }));
  }
  return recipe;
}

/**
 * Reads a recipe (object or JSON text), checks it and fills in defaults. Values out of range are clamped and
 * unknown fields dropped, so a stored recipe can never inject anything; a recipe that is not one throws RecipeError.
 */
export function normalizeRecipe(input) {
  let r = input;
  if (typeof r === 'string') {
    try { r = JSON.parse(r); } catch { throw new RecipeError('The recipe is not valid JSON.'); }
  }
  if (!r || typeof r !== 'object') throw new RecipeError('The recipe is empty.');
  if (r.type !== RECIPE_TYPE) throw new RecipeError(`This is not an image recipe (type "${r.type ?? ''}").`);
  if (!Number.isInteger(r.version) || r.version < 1) throw new RecipeError('The recipe has no valid version.');
  if (r.version > RECIPE_VERSION) throw new RecipeError(`The recipe is version ${r.version}; this MudTail reads up to version ${RECIPE_VERSION}.`);
  const problems = [];
  const width = Math.round(num(r.source?.width, 0, 100000));
  const height = Math.round(num(r.source?.height, 0, 100000));
  if (!width || !height) problems.push('source.width / source.height are missing.');
  if (problems.length) throw new RecipeError('The recipe is incomplete.', problems);
  return {
    type: RECIPE_TYPE,
    version: RECIPE_VERSION,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : null,
    source: {
      name: typeof r.source.name === 'string' ? r.source.name.slice(0, 200) : 'image',
      width,
      height,
      type: typeof r.source.type === 'string' ? r.source.type.slice(0, 60) : null,
      bytes: Number.isFinite(r.source.bytes) ? r.source.bytes : null,
      sha256: typeof r.source.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(r.source.sha256) ? r.source.sha256.toLowerCase() : null,
    },
    pipeline: [...PIPELINE],
    edit: normalizeEdit(r.edit),
    output: normalizeOutput(r.output),
    ...(Array.isArray(r.files) ? { files: r.files.slice(0, 50).map((f) => ({
      name: safeName(f?.name, 'file'), fileName: typeof f?.fileName === 'string' ? f.fileName.slice(0, 200) : null,
      width: Math.round(num(f?.width, 0, 100000)), height: Math.round(num(f?.height, 0, 100000)),
      type: typeof f?.type === 'string' ? f.type.slice(0, 60) : null, bytes: Number.isFinite(f?.bytes) ? f.bytes : null,
    })) } : {}),
  };
}

/** The edit part, checked and with defaults. */
export function normalizeEdit(e = {}) {
  const adjust = { ...DEFAULT_ADJUSTMENTS };
  for (const [key, [lo, hi]] of Object.entries(ADJUST_RANGES)) if (e?.adjust?.[key] != null) adjust[key] = num(e.adjust[key], lo, hi);
  const rect = (r) => (r && Number.isFinite(Number(r.x)) && Number(r.width) > 0 && Number(r.height) > 0
    ? { x: Math.max(0, Number(r.x)), y: Math.max(0, Number(r.y) || 0), width: Number(r.width), height: Number(r.height) } : null);
  const size = (s) => {
    const width = s?.width ? Math.round(num(s.width, 1, 20000)) : null;
    const height = s?.height ? Math.round(num(s.height, 1, 20000)) : null;
    return width || height ? { width, height } : null;
  };
  return {
    quarter: ((Math.round(num(e?.quarter, -100, 100)) % 4) + 4) % 4,
    angle: num(e?.angle, -45, 45),
    flipH: !!e?.flipH,
    flipV: !!e?.flipV,
    background: color(e?.background),
    adjust,
    preset: typeof e?.preset === 'string' ? e.preset.slice(0, 40) : 'none',
    annotations: Array.isArray(e?.annotations) ? e.annotations.slice(0, 500).map(normalizeAnnotation).filter(Boolean) : [],
    crop: rect(e?.crop),
    resize: size(e?.resize),
  };
}

function normalizeAnnotation(a) {
  if (!a || !SHAPES.includes(a.type)) return null;
  const n = (v) => num(v, -100000, 100000);
  const base = { type: a.type, color: color(a.color, '#ff3e7f'), size: num(a.size, 0.1, 2000, 6), opacity: num(a.opacity ?? 1, 0, 1, 1) };
  switch (a.type) {
    case 'brush':
    case 'highlighter':
      return { ...base, points: (Array.isArray(a.points) ? a.points.slice(0, 20000) : []).map((p) => ({ x: n(p?.x), y: n(p?.y) })) };
    case 'rect':
    case 'ellipse':
      return { ...base, x: n(a.x), y: n(a.y), w: n(a.w), h: n(a.h), fill: !!a.fill };
    case 'arrow':
    case 'line':
      return { ...base, x1: n(a.x1), y1: n(a.y1), x2: n(a.x2), y2: n(a.y2) };
    default: { // text
      const font = typeof a.font === 'string' && !/[;{}<>]/.test(a.font) ? a.font.slice(0, 100) : 'system-ui, sans-serif';
      return { ...base, text: String(a.text ?? '').slice(0, 2000), x: n(a.x), y: n(a.y), size: num(a.size, 4, 2000, 48), font, bold: !!a.bold, stroke: color(a.stroke) };
    }
  }
}

/** The output part, checked and with defaults. */
export function normalizeOutput(o = {}) {
  const format = FORMATS.includes(String(o?.format).toLowerCase().replace('jpg', 'jpeg')) ? String(o.format).toLowerCase().replace('jpg', 'jpeg') : 'webp';
  const seen = new Set();
  const sizes = (Array.isArray(o?.sizes) ? o.sizes : []).slice(0, 30).map((s, i) => ({
    name: safeName(s?.name, `size-${i + 1}`),
    width: s?.width ? Math.round(num(s.width, 1, 20000)) : null,
    height: s?.height ? Math.round(num(s.height, 1, 20000)) : null,
    fit: FITS.includes(s?.fit) ? s.fit : 'cover',
  })).filter((s) => (s.width || s.height) && !seen.has(s.name) && seen.add(s.name));
  return {
    format,
    quality: num(o?.quality ?? 0.86, 0.1, 1, 0.86),
    includeOriginal: o?.includeOriginal !== false,
    fileName: o?.fileName ? safeName(o.fileName, 'image') : null,
    sizes,
  };
}

/** Scales an edit's pixel coordinates and sizes (for an original of another resolution). */
export function scaleEdit(edit, factor) {
  if (!factor || factor === 1) return edit;
  const s = (v) => v * factor;
  return {
    ...edit,
    crop: edit.crop ? { x: s(edit.crop.x), y: s(edit.crop.y), width: s(edit.crop.width), height: s(edit.crop.height) } : null,
    annotations: edit.annotations.map((a) => {
      const out = { ...a, size: s(a.size) };
      if (a.points) out.points = a.points.map((p) => ({ x: s(p.x), y: s(p.y) }));
      ['x', 'y', 'w', 'h', 'x1', 'y1', 'x2', 'y2'].forEach((k) => { if (a[k] != null) out[k] = s(a[k]); });
      return out;
    }),
    adjust: { ...edit.adjust, blur: edit.adjust.blur * factor },
  };
}

/**
 * How a recipe fits a given original: the scale for its coordinates, and warnings when it is not the original the
 * recipe was made for. `actual` is { width, height, sha256? }.
 */
export function matchSource(recipe, actual) {
  const warnings = [];
  const want = recipe.source;
  if (want.sha256 && actual.sha256 && want.sha256 !== actual.sha256) warnings.push('different-file');
  let scale = 1;
  if (want.width !== actual.width || want.height !== actual.height) {
    const ratioWant = want.width / want.height;
    const ratioHave = actual.width / actual.height;
    if (Math.abs(ratioWant - ratioHave) / ratioWant > 0.01) warnings.push('different-proportions');
    else warnings.push('different-resolution');
    scale = actual.width / want.width;
  }
  return { scale, warnings };
}

/** SHA-256 of a Blob as lowercase hex (null where Web Crypto is unavailable, e.g. plain-HTTP pages). */
export async function fingerprint(blob) {
  try {
    if (!globalThis.crypto?.subtle || !blob?.arrayBuffer) return null;
    const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}
