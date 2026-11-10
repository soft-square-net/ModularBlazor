import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipe, normalizeRecipe, scaleEdit, matchSource, RECIPE_TYPE, RECIPE_VERSION, RecipeError } from './recipe.js';
import { DEFAULT_ADJUSTMENTS } from './pipeline.js';

const source = { name: 'harbour', width: 2400, height: 1600, type: 'image/jpeg', bytes: 482113, sha256: 'a'.repeat(64) };
const edit = {
  quarter: 1, angle: 2.5, flipH: true, flipV: false, background: '#ffffff',
  adjust: { ...DEFAULT_ADJUSTMENTS, contrast: 15, temperature: 30 }, preset: 'custom',
  annotations: [
    { type: 'brush', color: '#22d3ee', size: 12, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] },
    { type: 'text', text: 'Harbour at dusk', x: 100, y: 120, size: 64, color: '#fff', font: 'Georgia, serif', bold: true },
  ],
  crop: { x: 0, y: 150, width: 1600, height: 900 },
  resize: { width: 1200, height: null },
};
const output = { format: 'webp', quality: 0.86, fileName: 'harbour', sizes: [{ name: 'thumbnail', width: 160, height: 160, fit: 'cover' }, { name: 'article', width: 1200, fit: 'width' }] };

test('createRecipe → JSON → normalizeRecipe keeps every operation', () => {
  const recipe = createRecipe({ source, edit, output, files: [{ name: 'thumbnail', fileName: 'harbour-thumbnail.webp', width: 160, height: 160, type: 'image/webp', size: 5120 }], createdAt: '2026-11-10T09:30:00.000Z' });
  assert.equal(recipe.type, RECIPE_TYPE);
  assert.equal(recipe.version, RECIPE_VERSION);
  const back = normalizeRecipe(JSON.stringify(recipe));
  assert.deepEqual(back.edit, recipe.edit);
  assert.deepEqual(back.output, recipe.output);
  assert.deepEqual(back.source, recipe.source);
  assert.equal(back.files[0].bytes, 5120);
  assert.equal(back.edit.quarter, 1);
  assert.equal(back.edit.adjust.contrast, 15);
  assert.equal(back.edit.annotations[1].text, 'Harbour at dusk');
  assert.ok(back.pipeline.indexOf('adjust') < back.pipeline.indexOf('crop'), 'the pipeline order is recorded');
});

test('normalizeRecipe refuses what is not a recipe, and cleans what is', () => {
  assert.throws(() => normalizeRecipe('{nope'), RecipeError);
  assert.throws(() => normalizeRecipe({ type: 'other', version: 1 }), /not an image recipe/);
  assert.throws(() => normalizeRecipe({ type: RECIPE_TYPE, version: 99, source }), /version 99/);
  assert.throws(() => normalizeRecipe({ type: RECIPE_TYPE, version: 1, source: {} }), RecipeError);
  const dirty = normalizeRecipe({
    type: RECIPE_TYPE, version: 1, source: { ...source, sha256: 'not-a-hash' },
    edit: {
      quarter: 7, angle: 400, adjust: { contrast: 999, evil: 1 }, crop: { x: 5, y: 5, width: -1, height: 10 },
      annotations: [{ type: 'script', x: 1 }, { type: 'text', text: 'x', font: 'a;}</style>', color: 'url(javascript:alert(1))' }],
    },
    output: { format: 'exe', quality: 9, sizes: [{ name: '../../etc', width: 99999 }, { name: 'dup', width: 10 }, { name: 'dup', width: 20 }, { name: 'none' }] },
  });
  assert.equal(dirty.source.sha256, null);
  assert.equal(dirty.edit.quarter, 3);
  assert.equal(dirty.edit.angle, 45);
  assert.equal(dirty.edit.adjust.contrast, 100);
  assert.equal('evil' in dirty.edit.adjust, false);
  assert.equal(dirty.edit.crop, null, 'a crop with no size is dropped');
  assert.equal(dirty.edit.annotations.length, 1, 'unknown shapes are dropped');
  assert.equal(dirty.edit.annotations[0].font, 'system-ui, sans-serif');
  assert.equal(dirty.edit.annotations[0].color, '#ff3e7f', 'unsafe colours fall back');
  assert.equal(dirty.output.format, 'webp');
  assert.equal(dirty.output.quality, 1);
  assert.deepEqual(dirty.output.sizes.map((s) => [s.name, s.width]), [['etc', 20000], ['dup', 10]]);
});

test('scaleEdit and matchSource: a higher-resolution master gets the same crop', () => {
  const recipe = normalizeRecipe(createRecipe({ source, edit, output }));
  const same = matchSource(recipe, { width: 2400, height: 1600, sha256: 'a'.repeat(64) });
  assert.deepEqual(same, { scale: 1, warnings: [] });
  const bigger = matchSource(recipe, { width: 4800, height: 3200 });
  assert.deepEqual(bigger, { scale: 2, warnings: ['different-resolution'] });
  const scaled = scaleEdit(recipe.edit, bigger.scale);
  assert.deepEqual(scaled.crop, { x: 0, y: 300, width: 3200, height: 1800 });
  assert.deepEqual(scaled.annotations[0].points, [{ x: 20, y: 40 }, { x: 60, y: 80 }]);
  assert.equal(scaled.annotations[1].size, 128);
  assert.deepEqual(matchSource(recipe, { width: 2400, height: 2400 }).warnings, ['different-proportions']);
  assert.deepEqual(matchSource(recipe, { width: 2400, height: 1600, sha256: 'b'.repeat(64) }).warnings, ['different-file']);
});
