import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createScene, createLayer, createClip, addLayer, normalizeScene, validateScene, serializeScene, parseScene, resolveLayerProps,
  setLayerProps, resolveClip, pickView, sceneDuration, duplicateLayer, removeLayer, moveLayer, groupLayers, reparentLayer,
  descendantIds, sceneFileName, SceneError, SCENE_TYPE, isOverridden, resetOverrides,
} from './scene.js';
import { shapePath, motionPath, scalePath, SHAPES, MOTION_PATHS, isPathData } from './shapes.js';
import { easeKey, bezierPath, EASE_NAMES } from './eases.js';
import { PRESETS, clipFromPreset, presetGroups } from './presets.js';
import { EFFECTS, splitVars, filterString, effectFits, withDefaults } from './effects.js';
import { TEMPLATES } from './templates.js';

const sample = () => {
  const s = createScene({ name: 'Test' });
  const a = addLayer(s, createLayer('shape', { x: 100, y: 100, width: 200, height: 100 }));
  const b = addLayer(s, createLayer('text', { x: 600, y: 300 }));
  return { s, a, b };
};

test('createScene has three views, the first is the base design', () => {
  const s = createScene();
  assert.equal(s.type, SCENE_TYPE);
  assert.deepEqual(s.views.map((v) => v.id), ['desktop', 'tablet', 'mobile']);
});

test('pickView picks the largest view whose minWidth fits', () => {
  const s = createScene();
  assert.equal(pickView(s, 1400).id, 'desktop');
  assert.equal(pickView(s, 800).id, 'tablet');
  assert.equal(pickView(s, 320).id, 'mobile');
});

test('auto layout keeps the centre and scales sizes uniformly; overrides win', () => {
  const { s, a } = sample();
  const base = resolveLayerProps(s, a, 'desktop');
  assert.equal(base.x, 100);
  const m = resolveLayerProps(s, a, 'mobile');
  const sx = 390 / 1280; const sy = 600 / 720; const k = Math.min(sx, sy);
  assert.ok(Math.abs(m.width - 200 * k) < 0.01);
  assert.ok(Math.abs(m.x + m.width / 2 - 200 * sx) < 0.02);
  assert.ok(Math.abs(m.y + m.height / 2 - 150 * sy) < 0.02);
  setLayerProps(s, a, 'mobile', { x: 5 });
  assert.equal(resolveLayerProps(s, a, 'mobile').x, 5);
  assert.equal(a.props.x, 100, 'the base design is untouched');
  assert.ok(isOverridden(a, 'mobile', 'x'));
  resetOverrides(a, 'mobile', ['x']);
  assert.equal(isOverridden(a, 'mobile', 'x'), false);
});

test('resolveClip scales pixel offsets per view and skips clips limited to other views', () => {
  const s = createScene();
  const clip = createClip('tween', { from: { x: 100, y: 72, opacity: 0 }, views: ['desktop', 'mobile'] });
  const m = resolveClip(s, clip, 'mobile');
  assert.ok(Math.abs(m.from.x - 100 * 390 / 1280) < 0.01);
  assert.ok(Math.abs(m.from.y - 72 * 600 / 720) < 0.01);
  assert.equal(m.from.opacity, 0);
  assert.equal(resolveClip(s, clip, 'tablet'), null);
  clip.overrides = { mobile: { from: { x: 7 } } };
  assert.equal(resolveClip(s, clip, 'mobile').from.x, 7);
});

test('sceneDuration covers the last clip and its repeats', () => {
  const { s, a } = sample();
  a.clips.push(createClip('tween', { start: 4, duration: 2, repeat: 2, repeatDelay: 0.5 }));
  assert.equal(sceneDuration(s), 4 + 2 * 3 + 0.5 * 2);
  a.clips.push(createClip('tween', { start: 1, duration: 1, repeat: -1 }));
  assert.equal(sceneDuration(s), 11, 'infinite repeats count once');
});

test('normalizeScene fills defaults, fixes ids and orphaned parents, keeps unknown fields', () => {
  const raw = {
    type: SCENE_TYPE, name: 'x', custom: 42,
    layers: [{ id: 'a', kind: 'text', parentId: 'nope' }, { id: 'a', kind: 'weird', props: { x: '12' } }],
  };
  const s = normalizeScene(raw);
  assert.equal(s.custom, 42);
  assert.equal(s.layers[0].parentId, null);
  assert.notEqual(s.layers[0].id, s.layers[1].id);
  assert.equal(s.layers[1].kind, 'html');
  assert.equal(s.layers[1].props.x, 12);
  assert.equal(s.views.length, 3);
});

test('normalizeScene rejects other documents and newer versions', () => {
  assert.throws(() => normalizeScene({ type: 'something-else' }), SceneError);
  assert.throws(() => normalizeScene({ type: SCENE_TYPE, version: 99 }), /newer/);
  assert.throws(() => normalizeScene('{ not json'), /JSON/);
});

test('serialize → parse round-trips', () => {
  const { s, a } = sample();
  a.clips.push(createClip('morph', { start: 1, params: { shape: 'star' } }));
  const back = parseScene(serializeScene(s));
  assert.equal(back.layers.length, 2);
  assert.equal(back.layers[0].clips[0].type, 'morph');
  assert.equal(back.layers[0].clips[0].params.shape, 'star');
});

test('validateScene warns about dangling references', () => {
  const { s, a } = sample();
  a.clips.push(createClip('motionPath', { params: { source: 'layer', path: 'layer:missing' } }));
  a.props.assetId = 'gone';
  const warnings = validateScene(s);
  assert.equal(warnings.length, 2);
});

test('layer tree editing: group, reparent, move, duplicate, remove', () => {
  const { s, a, b } = sample();
  const g = groupLayers(s, [a.id, b.id]);
  assert.equal(a.parentId, g.id);
  assert.equal(a.props.x, 0, 'children are positioned relative to the group');
  assert.deepEqual(descendantIds(s, g.id).sort(), [a.id, b.id].sort());
  assert.ok(moveLayer(s, b.id, -1));
  const copy = duplicateLayer(s, g.id);
  assert.equal(descendantIds(s, copy.id).length, 2);
  assert.equal(reparentLayer(s, g.id, a.id, { into: true }), false, 'cannot move a group into its own child');
  removeLayer(s, g.id);
  assert.equal(s.layers.length, 3);
});

test('every shape and motion path produces path data', () => {
  for (const [shape] of SHAPES) assert.ok(isPathData(shapePath(shape, 120, 80, { d: 'M0,0 L100,100' })), shape);
  for (const [name] of MOTION_PATHS) assert.ok(isPathData(motionPath(name, 400, 200)), name);
  assert.match(scalePath('M0,0 L100,100', 2, 3), /200/);
});

test('ease keys are stable and distinct', () => {
  assert.equal(easeKey('power2.out'), 'power2.out');
  assert.equal(easeKey({ kind: 'bezier', x1: 0.1, y1: 0, x2: 0.2, y2: 1 }), easeKey({ y2: 1, x2: 0.2, kind: 'bezier', y1: 0, x1: 0.1 }));
  assert.notEqual(easeKey({ kind: 'wiggle', wiggles: 4 }), easeKey({ kind: 'wiggle', wiggles: 5 }));
  assert.equal(bezierPath({ x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.4 }), 'M0,0 C0.1,0.2 0.3,0.4 1,1');
  assert.ok(EASE_NAMES.includes('elastic.inOut'));
});

test('splitVars routes filters, shape paint and text props', () => {
  const node = { path: {}, text: null };
  const r = splitVars({ x: 10, blur: 4, fill: '#f00', radius: 8 }, node, { blur: 0 });
  assert.equal(r.outer.x, 10);
  assert.equal(r.outer.borderRadius, '8px');
  assert.match(r.outer.filter, /^blur\(4px\) brightness\(1\)/);
  assert.equal(r.path.fill, '#f00');
  assert.equal(filterString({ hue: 90 }).includes('hue-rotate(90deg)'), true);
});

test('every preset makes a clip of a known type with valid timing', () => {
  const view = { width: 1280, height: 720 };
  for (const p of PRESETS) {
    const layer = createLayer(p.kinds?.[0] ?? 'shape', {});
    const clip = clipFromPreset(p.id, layer, view, 2);
    assert.ok(EFFECTS[clip.type], `${p.id}: ${clip.type}`);
    assert.equal(clip.start, 2);
    assert.ok(clip.duration > 0, p.id);
    if (p.kinds) assert.ok(effectFits(clip.type, p.kinds[0]), `${p.id} fits ${p.kinds[0]}`);
  }
  assert.ok(presetGroups('text').some(([g]) => g === 'Text'));
  assert.ok(!presetGroups('image').some(([, ps]) => ps.some((p) => p.type === 'typewriter')));
});

test('withDefaults fills a type\'s params', () => {
  const p = withDefaults('motionPath', { preset: 'wave' });
  assert.equal(p.preset, 'wave');
  assert.equal(p.source, 'preset');
  assert.equal(p.points.length, 4);
});

test('templates build valid scenes', () => {
  for (const t of TEMPLATES) {
    const scene = t.create();
    const warnings = validateScene(scene);
    assert.deepEqual(warnings, [], t.id);
    assert.equal(normalizeScene(JSON.parse(serializeScene(scene))).layers.length, scene.layers.length);
  }
});

test('sceneFileName slugs the name', () => {
  assert.equal(sceneFileName({ name: 'Hero  Banner!' }), 'hero-banner.mudscene.json');
  assert.equal(sceneFileName({ name: '' }), 'scene.mudscene.json');
});

test('full-stage layers stretch into other views; responsive picks the mode', () => {
  const s = createScene();
  const bg = addLayer(s, createLayer('shape', { x: 0, y: 0, width: 1280, height: 720 }));
  const t = resolveLayerProps(s, bg, 'tablet');
  assert.deepEqual([t.x, t.y, t.width, t.height], [0, 0, 820, 680]);
  bg.props.responsive = 'scale';
  assert.notEqual(resolveLayerProps(s, bg, 'tablet').height, 680);
  bg.props.responsive = 'fixed';
  assert.equal(resolveLayerProps(s, bg, 'mobile').width, 1280);
});
