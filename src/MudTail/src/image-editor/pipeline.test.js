import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAdjustments, histogram, rotatedBounds, mapPoint, mapRect, centeredCrop, resizeCrop, moveCrop, fitSize,
  resolveRatio, presetAdjustments, isNeutral, DEFAULT_ADJUSTMENTS, mimeType, extension, formatBytes,
} from './pipeline.js';

const pixels = (rgba, width = rgba.length / 4, height = 1) => ({ data: new Uint8ClampedArray(rgba), width, height });

test('adjustments: neutral leaves pixels alone; each control moves them the expected way', () => {
  const img = pixels([100, 150, 200, 255]);
  assert.deepEqual([...applyAdjustments(img, {}).data], [100, 150, 200, 255]);
  assert.ok(applyAdjustments(pixels([100, 100, 100, 255]), { brightness: 50 }).data[0] > 100);
  assert.ok(applyAdjustments(pixels([100, 100, 100, 255]), { exposure: -50 }).data[0] < 100);
  const c = applyAdjustments(pixels([60, 60, 60, 255, 200, 200, 200, 255]), { contrast: 50 }).data;
  assert.ok(c[0] < 60 && c[4] > 200, 'contrast spreads darks and lights');
  const g = applyAdjustments(pixels([200, 50, 50, 255]), { grayscale: 100 }).data;
  assert.equal(g[0], g[1]);
  assert.equal(g[1], g[2]);
  const w = applyAdjustments(pixels([128, 128, 128, 255]), { temperature: 100 }).data;
  assert.ok(w[0] > w[2], 'warm: more red than blue');
  assert.deepEqual([...applyAdjustments(pixels([10, 20, 30, 77]), { invert: 100 }).data], [245, 235, 225, 77], 'alpha is kept');
  const s = applyAdjustments(pixels([200, 100, 100, 255]), { saturation: -100 }).data;
  assert.ok(Math.abs(s[0] - s[1]) <= 1, 'no saturation: grey');
});

test('presets and neutral checks', () => {
  assert.equal(isNeutral(DEFAULT_ADJUSTMENTS), true);
  assert.equal(isNeutral(presetAdjustments('mono')), false);
  assert.equal(presetAdjustments('mono').grayscale, 100);
  assert.deepEqual(presetAdjustments('nope'), { ...DEFAULT_ADJUSTMENTS });
});

test('histogram counts luminance and channels', () => {
  const h = histogram(pixels([0, 0, 0, 255, 255, 255, 255, 255, 9, 9, 9, 0]));
  assert.equal(h.l[0], 1);
  assert.equal(h.l[255], 1);
  assert.equal(h.r[9], 0, 'transparent pixels are skipped');
});

test('rotation: bounds, and points follow quarter turns and flips', () => {
  assert.deepEqual(rotatedBounds(400, 200, 90), { width: 200, height: 400 });
  assert.deepEqual(rotatedBounds(400, 200, 180), { width: 400, height: 200 });
  const b45 = rotatedBounds(100, 100, 45);
  assert.equal(b45.width, 141);
  const none = { deg: 0, flipH: false, flipV: false };
  // Top-left corner of a 400×200 image: after 90° clockwise it is the top-right of a 200×400 box.
  const p = mapPoint({ x: 0, y: 0 }, 400, 200, none, { deg: 90, flipH: false, flipV: false });
  assert.deepEqual({ x: Math.round(p.x), y: Math.round(p.y) }, { x: 200, y: 0 });
  const f = mapPoint({ x: 10, y: 20 }, 400, 200, none, { deg: 0, flipH: true, flipV: false });
  assert.deepEqual(f, { x: 390, y: 20 });
  // There and back again.
  const there = mapPoint({ x: 33, y: 77 }, 400, 200, none, { deg: 270, flipH: true, flipV: false });
  const back = mapPoint(there, 400, 200, { deg: 270, flipH: true, flipV: false }, none);
  assert.deepEqual({ x: Math.round(back.x), y: Math.round(back.y) }, { x: 33, y: 77 });
  assert.deepEqual(mapRect({ x: 0, y: 0, width: 100, height: 50 }, 400, 200, none, { deg: 90, flipH: false, flipV: false }), { x: 150, y: 0, width: 50, height: 100 });
});

test('crop: ratios, centred crop, resize with a ratio, move inside the bounds', () => {
  const bounds = { width: 1600, height: 900 };
  assert.equal(resolveRatio('1:1', bounds), 1);
  assert.equal(resolveRatio('original', bounds), 1600 / 900);
  assert.equal(resolveRatio('5x4', bounds), 1.25);
  assert.equal(resolveRatio('free', bounds), null);
  assert.deepEqual(centeredCrop(bounds, '1:1'), { x: 350, y: 0, width: 900, height: 900 });
  assert.deepEqual(centeredCrop(bounds, null), { x: 0, y: 0, width: 1600, height: 900 });
  const r = resizeCrop({ x: 100, y: 100, width: 400, height: 400 }, 'se', 100, 0, 1, bounds);
  assert.equal(r.width, 500);
  assert.equal(r.height, 500);
  const big = resizeCrop({ x: 1000, y: 100, width: 400, height: 400 }, 'se', 900, 0, 1, bounds);
  assert.ok(big.x + big.width <= 1600 && big.y + big.height <= 900, 'stays inside');
  assert.equal(Math.round(big.width), Math.round(big.height));
  const free = resizeCrop({ x: 100, y: 100, width: 400, height: 400 }, 'nw', -50, 30, null, bounds);
  assert.deepEqual(free, { x: 50, y: 130, width: 450, height: 370 });
  assert.deepEqual(moveCrop({ x: 100, y: 100, width: 400, height: 400 }, 5000, -5000, bounds), { x: 1200, y: 0, width: 400, height: 400 });
});

test('fitSize: cover, contain, width, inside, fill', () => {
  assert.deepEqual(fitSize(1600, 900, { width: 160, height: 160, fit: 'cover' }), { width: 160, height: 160, sx: 350, sy: 0, sw: 900, sh: 900 });
  assert.deepEqual(fitSize(1600, 900, { width: 800, height: 800, fit: 'contain' }), { width: 800, height: 450, sx: 0, sy: 0, sw: 1600, sh: 900 });
  assert.deepEqual(fitSize(1600, 900, { width: 1200, fit: 'width' }), { width: 1200, height: 675, sx: 0, sy: 0, sw: 1600, sh: 900 });
  assert.deepEqual(fitSize(800, 450, { width: 1920, height: 1080, fit: 'inside' }), { width: 800, height: 450, sx: 0, sy: 0, sw: 800, sh: 450 });
  assert.deepEqual(fitSize(1600, 900, { width: 300, height: 300, fit: 'fill' }), { width: 300, height: 300, sx: 0, sy: 0, sw: 1600, sh: 900 });
});

test('formats and sizes', () => {
  assert.equal(mimeType('jpg'), 'image/jpeg');
  assert.equal(mimeType('webp'), 'image/webp');
  assert.equal(extension('image/jpeg'), 'jpg');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(512), '512 B');
});
