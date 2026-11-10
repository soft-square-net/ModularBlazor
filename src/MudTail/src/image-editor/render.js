// Canvas rendering for MudImageEditor: loading a source, drawing it rotated / flipped, adjustments and annotations
// on top, cropping, high-quality resizing and encoding. Uses the pure functions in pipeline.js.

import { applyAdjustments, rotatedBounds, isNeutral, fitSize, mimeType } from './pipeline.js';

/** Loads a URL, data URL, Blob / File or an existing image / canvas / ImageBitmap. Resolves to { image, width, height, name, type }. */
export async function loadSource(src, { crossOrigin = 'anonymous' } = {}) {
  if (src instanceof Blob) {
    const url = URL.createObjectURL(src);
    try {
      const out = await loadSource(url);
      return { ...out, name: src.name ?? out.name, type: src.type || out.type, size: src.size };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (typeof HTMLCanvasElement !== 'undefined' && (src instanceof HTMLCanvasElement || (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap))) {
    return { image: src, width: src.width, height: src.height, name: 'image', type: 'image/png' };
  }
  if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) {
    if (!src.complete) await src.decode();
    return { image: src, width: src.naturalWidth, height: src.naturalHeight, name: nameFromUrl(src.src), type: '' };
  }
  const img = new Image();
  if (!String(src).startsWith('data:') && !String(src).startsWith('blob:')) img.crossOrigin = crossOrigin; // keep the canvas exportable
  img.decoding = 'async';
  img.src = String(src);
  await img.decode();
  return { image: img, width: img.naturalWidth, height: img.naturalHeight, name: nameFromUrl(img.src), type: '' };
}

export function nameFromUrl(url) {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return 'image';
  try { return decodeURIComponent(new URL(url, location.href).pathname.split('/').pop() || 'image').replace(/\.[a-z0-9]+$/i, ''); } catch { return 'image'; }
}

export function createCanvas(width, height) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

/** The transform's angle in degrees (quarter turns + straighten). */
export const angleOf = (state) => (state.quarter ?? 0) * 90 + (state.angle ?? 0);

/** The rotated image's box at full resolution. */
export function geometryBounds(source, state) {
  return rotatedBounds(source.width, source.height, angleOf(state));
}

/**
 * Draws the source with the state's rotation, flips, adjustments, blur and annotations at `scale` (1 = full size).
 * Returns a canvas the size of the rotated box × scale.
 */
export function compose(source, state, scale = 1, { annotations = true, adjustments = true } = {}) {
  const bounds = geometryBounds(source, state);
  const canvas = createCanvas(bounds.width * scale, bounds.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (state.background) { ctx.fillStyle = state.background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((angleOf(state) * Math.PI) / 180);
  ctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
  ctx.imageSmoothingQuality = 'high';
  if (adjustments && state.adjust?.blur) ctx.filter = `blur(${state.adjust.blur * scale}px)`;
  ctx.drawImage(source.image, (-source.width * scale) / 2, (-source.height * scale) / 2, source.width * scale, source.height * scale);
  ctx.restore();
  ctx.filter = 'none';

  if (adjustments && state.adjust && !isNeutral({ ...state.adjust, blur: 0 })) {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyAdjustments(data, { ...state.adjust, blur: 0 });
    ctx.putImageData(data, 0, 0);
  }
  if (annotations && state.annotations?.length) {
    ctx.save();
    ctx.scale(scale, scale);
    state.annotations.forEach((a) => drawAnnotation(ctx, a));
    ctx.restore();
  }
  return canvas;
}

/** Draws one annotation (coordinates in the rotated box at full size). */
export function drawAnnotation(ctx, a) {
  ctx.save();
  ctx.globalAlpha = a.opacity ?? 1;
  ctx.strokeStyle = a.color ?? '#ff3e7f';
  ctx.fillStyle = a.color ?? '#ff3e7f';
  ctx.lineWidth = a.size ?? 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (a.type === 'brush' || a.type === 'highlighter') {
    if (a.type === 'highlighter') { ctx.globalAlpha = 0.35; ctx.globalCompositeOperation = 'multiply'; }
    const pts = a.points ?? [];
    if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
    else if (pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      // Smooth: quadratic curves through the midpoints.
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
  } else if (a.type === 'rect') {
    if (a.fill) ctx.fillRect(a.x, a.y, a.w, a.h); else ctx.strokeRect(a.x, a.y, a.w, a.h);
  } else if (a.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, Math.abs(a.w / 2), Math.abs(a.h / 2), 0, 0, Math.PI * 2);
    if (a.fill) ctx.fill(); else ctx.stroke();
  } else if (a.type === 'arrow' || a.type === 'line') {
    ctx.beginPath();
    ctx.moveTo(a.x1, a.y1);
    ctx.lineTo(a.x2, a.y2);
    ctx.stroke();
    if (a.type === 'arrow') {
      const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
      const head = Math.max(10, ctx.lineWidth * 3.2);
      ctx.beginPath();
      ctx.moveTo(a.x2, a.y2);
      ctx.lineTo(a.x2 - head * Math.cos(angle - Math.PI / 7), a.y2 - head * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(a.x2 - head * Math.cos(angle + Math.PI / 7), a.y2 - head * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();
    }
  } else if (a.type === 'text') {
    ctx.font = `${a.bold ? '700 ' : ''}${a.size ?? 48}px ${a.font ?? 'system-ui, sans-serif'}`;
    ctx.textBaseline = 'top';
    ctx.direction = a.dir ?? 'inherit';
    if (a.stroke) { ctx.lineWidth = Math.max(2, (a.size ?? 48) / 12); ctx.strokeStyle = a.stroke; String(a.text).split('\n').forEach((line, i) => ctx.strokeText(line, a.x, a.y + i * (a.size ?? 48) * 1.2)); }
    String(a.text).split('\n').forEach((line, i) => ctx.fillText(line, a.x, a.y + i * (a.size ?? 48) * 1.2));
  }
  ctx.restore();
}

/** A rectangle of a canvas as a new canvas. */
export function cropCanvas(canvas, r) {
  const out = createCanvas(r.width, r.height);
  out.getContext('2d').drawImage(canvas, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
  return out;
}

/**
 * Resizes with good quality: big reductions go down in halving steps (which avoids the jagged look of one
 * large step), then a final step to the exact size. `source` is a canvas; `rect` the part of it to use.
 */
export function resizeCanvas(source, width, height, rect = { sx: 0, sy: 0, sw: source.width, sh: source.height }, background = null) {
  let current = source;
  let { sx, sy, sw, sh } = rect;
  while (sw / 2 >= width && sh / 2 >= height) {
    const half = createCanvas(sw / 2, sh / 2);
    const hctx = half.getContext('2d');
    hctx.imageSmoothingQuality = 'high';
    hctx.drawImage(current, sx, sy, sw, sh, 0, 0, half.width, half.height);
    current = half; sx = 0; sy = 0; sw = half.width; sh = half.height;
  }
  const out = createCanvas(width, height);
  const ctx = out.getContext('2d');
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, out.width, out.height); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(current, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

/** A canvas at an output size ({ width, height, fit }) from a source canvas. */
export function renderSize(canvas, size, background = null) {
  const f = fitSize(canvas.width, canvas.height, size);
  return resizeCanvas(canvas, f.width, f.height, f, background);
}

/** Encodes a canvas. Formats the browser can't write (e.g. AVIF) fall back to PNG, as canvas.toBlob does. */
export function toBlob(canvas, format = 'jpeg', quality = 0.9) {
  const type = mimeType(format);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded.'))), type, quality);
  });
}

/** JPEG has no transparency: paint a background under it. */
export function flatten(canvas, background = '#ffffff') {
  const out = createCanvas(canvas.width, canvas.height);
  const ctx = out.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}
