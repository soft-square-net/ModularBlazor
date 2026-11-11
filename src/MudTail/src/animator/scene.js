// MudTail Animator: the scene document. Pure data and pure functions (no DOM, no GSAP), shared by the Studio,
// the player and the tests.
//
// A scene is plain JSON, so it can be saved, exported, imported, stored by a .NET API and played anywhere:
//
//   {
//     type: 'mudtail-animator-scene', version: 1, id, name,
//     settings: { duration, background, repeat, yoyo, repeatDelay, speed, mode: 'timeline' | 'slides',
//                 trigger: 'load' | 'visible' | 'scroll' | 'click' | 'hover' | 'none', scroll: { scrub, pin, start, end },
//                 fit: 'contain' | 'cover' | 'width', controls },
//     views:  [{ id: 'desktop', label, width, height, minWidth }, …]       first view = the base design
//     assets: [{ id, kind: 'image' | 'svg' | 'video' | 'audio', name, src?, svg? }]
//     layers: [{ id, name, kind, parentId, hidden, locked, props, views: { <viewId>: partial props }, clips, interactions, draggable }]
//     labels: [{ id, name, time }]
//   }
//
// Layers are a flat list ordered bottom → top; a group's children name it in parentId. A layer's props describe its
// base design; views[viewId] overrides them for one view. A view without overrides is laid out automatically by
// scaling the base design (see resolveLayerProps).

export const SCENE_TYPE = 'mudtail-animator-scene';
export const SCENE_VERSION = 1;

export const LAYER_KINDS = ['group', 'shape', 'text', 'image', 'svg', 'icon', 'video', 'audio', 'html', 'canvas'];

export const DEFAULT_VIEWS = Object.freeze([
  Object.freeze({ id: 'desktop', label: 'Desktop', icon: 'monitor', width: 1280, height: 720, minWidth: 1024 }),
  Object.freeze({ id: 'tablet', label: 'Tablet', icon: 'tablet', width: 820, height: 680, minWidth: 600 }),
  Object.freeze({ id: 'mobile', label: 'Mobile', icon: 'smartphone', width: 390, height: 600, minWidth: 0 }),
]);

export const DEFAULT_SETTINGS = Object.freeze({
  duration: 6,
  background: '#0f172a',
  repeat: 0,
  yoyo: false,
  repeatDelay: 0,
  speed: 1,
  mode: 'timeline', // 'slides': labels are slide stops (prev / next, swipe, wheel, keys)
  slideHold: 0, // slides: seconds to wait after a slide before the next one (0 = wait for the viewer)
  trigger: 'load',
  scroll: Object.freeze({ scrub: 1, pin: false, start: 'top 80%', end: 'bottom 20%' }),
  fit: 'contain',
  controls: false,
  autoView: true, // pick the view from the container's width
  flipOnViewChange: true,
});

/** Props every layer has, with their defaults. */
export const BASE_PROPS = Object.freeze({
  x: 0, y: 0, width: 200, height: 120,
  rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, opacity: 1,
  originX: 50, originY: 50,
  blendMode: 'normal',
  shadow: '',
  blur: 0,
  radius: 0,
  background: '',
  overflow: 'visible',
  cursor: '',
});

/** Kind-specific defaults (merged over BASE_PROPS when a layer is created). */
export const KIND_PROPS = Object.freeze({
  group: { width: 400, height: 300 },
  shape: { shape: 'rect', fill: '#6366f1', stroke: '', strokeWidth: 0, corner: 16, points: 5, innerRadius: 0.45, d: '', width: 200, height: 200 },
  text: {
    text: 'Your headline', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 56, fontWeight: 800, color: '#ffffff',
    align: 'left', lineHeight: 1.1, letterSpacing: 0, italic: false, width: 640, height: 80, textShadow: '', gradient: '',
  },
  image: { assetId: '', src: '', fit: 'cover', width: 480, height: 320 },
  svg: { assetId: '', svg: '', width: 240, height: 240, fill: '', stroke: '' },
  icon: { icon: 'star', color: '#facc15', strokeWidth: 2, width: 96, height: 96 },
  video: { assetId: '', src: '', fit: 'cover', loop: true, muted: true, autoplay: true, width: 480, height: 270 },
  audio: { assetId: '', src: '', loop: false, volume: 1, width: 48, height: 48 },
  html: { html: '<div style="padding:16px;border-radius:12px;background:#fff;color:#111">HTML block</div>', width: 320, height: 160 },
  canvas: { effect: 'particles', count: 80, color: '#ffffff', color2: '#6366f1', speed: 1, size: 3, width: 1280, height: 720 },
});

/** Props that are pixel lengths along the horizontal / vertical axis, or uniform sizes (scaled by the auto layout). */
const X_PROPS = new Set(['x']);
const Y_PROPS = new Set(['y']);
const SIZE_PROPS = new Set(['width', 'height', 'fontSize', 'strokeWidth', 'radius', 'corner', 'size', 'letterSpacing', 'blur']);

let counter = 0;
/** A short unique id: prefix + time + counter + random, readable in a JSON file. */
export function uid(prefix = 'id') {
  counter = (counter + 1) % 1296;
  return `${prefix}_${Date.now().toString(36).slice(-5)}${counter.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 5)}`;
}

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : d);

export class SceneError extends Error {
  constructor(message) {
    super(`[MudTail Animator] ${message}`);
    this.name = 'SceneError';
  }
}

// ───────────── creation ─────────────

/** A new, empty scene. */
export function createScene({ name = 'Untitled scene', views = DEFAULT_VIEWS, settings = {} } = {}) {
  return {
    type: SCENE_TYPE,
    version: SCENE_VERSION,
    id: uid('scene'),
    name,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    settings: { ...clone(DEFAULT_SETTINGS), ...clone(settings) },
    views: clone(views),
    assets: [],
    layers: [],
    labels: [],
  };
}

/** A new layer of a kind, centred in `view` unless x/y are given. */
export function createLayer(kind, props = {}, { name, view } = {}) {
  if (!LAYER_KINDS.includes(kind)) throw new SceneError(`unknown layer kind "${kind}"`);
  const merged = { ...BASE_PROPS, ...clone(KIND_PROPS[kind]), ...clone(props) };
  if (view && props.x === undefined) merged.x = Math.round((view.width - merged.width) / 2);
  if (view && props.y === undefined) merged.y = Math.round((view.height - merged.height) / 2);
  return {
    id: uid(kind),
    name: name ?? defaultLayerName(kind, merged),
    kind,
    parentId: null,
    hidden: false,
    locked: false,
    props: merged,
    views: {},
    clips: [],
    interactions: [],
    draggable: null,
  };
}

function defaultLayerName(kind, props) {
  if (kind === 'text') return String(props.text).slice(0, 24) || 'Text';
  if (kind === 'shape') return cap(props.shape);
  if (kind === 'icon') return `Icon ${props.icon}`;
  if (kind === 'canvas') return cap(props.effect);
  return cap(kind);
}
const cap = (s) => String(s ?? '').charAt(0).toUpperCase() + String(s ?? '').slice(1);

/** A new clip (an animation on a layer's timeline row). */
export function createClip(type = 'tween', fields = {}) {
  return {
    id: uid('clip'),
    type,
    name: fields.name ?? '',
    start: Math.max(0, num(fields.start, 0)),
    duration: Math.max(0, num(fields.duration, 1)),
    ease: fields.ease ?? 'power2.out',
    repeat: num(fields.repeat, 0),
    yoyo: !!fields.yoyo,
    repeatDelay: num(fields.repeatDelay, 0),
    from: clone(fields.from ?? {}),
    to: clone(fields.to ?? {}),
    params: clone(fields.params ?? {}),
    stagger: clone(fields.stagger ?? null),
    views: fields.views ? [...fields.views] : null, // null = every view
    overrides: clone(fields.overrides ?? {}), // { viewId: { from, to, params } }
  };
}

export function createAsset(kind, fields = {}) {
  return { id: uid('asset'), kind, name: fields.name ?? cap(kind), src: fields.src ?? '', svg: fields.svg ?? '', size: fields.size ?? 0, mime: fields.mime ?? '' };
}

// ───────────── views and layout ─────────────

/** The view of the scene with this id (or the base view). */
export function getView(scene, viewId) {
  return scene.views.find((v) => v.id === viewId) ?? scene.views[0];
}

/** The base (design) view: the first one. */
export function baseView(scene) {
  return scene.views[0];
}

/** The view for a container this wide: the one with the largest minWidth that fits. */
export function pickView(scene, containerWidth) {
  const sorted = [...scene.views].sort((a, b) => (b.minWidth ?? 0) - (a.minWidth ?? 0));
  return sorted.find((v) => containerWidth >= (v.minWidth ?? 0)) ?? sorted[sorted.length - 1];
}

/** Scale factors from the base view to `view`: sx, sy and the uniform s = min(sx, sy). */
export function viewScale(scene, view) {
  const base = baseView(scene);
  const sx = view.width / base.width;
  const sy = view.height / base.height;
  return { sx, sy, s: Math.min(sx, sy) };
}

/**
 * A layer's props in a view. The base view uses props as they are. Another view uses its overrides when it has any
 * (`views[viewId]`), on top of the auto layout: the base design scaled into the view, sizes scaled uniformly and the
 * layer's centre kept at the same relative place. Children of groups scale with their group (positions inside a
 * group are relative to it), so only top-level layers are re-centred.
 */
export function resolveLayerProps(scene, layer, viewId) {
  const view = getView(scene, viewId);
  const base = baseView(scene);
  const props = { ...BASE_PROPS, ...KIND_PROPS[layer.kind], ...layer.props };
  if (view.id === base.id) return props;
  const auto = autoLayout(props, viewScale(scene, view), !layer.parentId, base);
  return { ...auto, ...(layer.views?.[view.id] ?? {}) };
}

/**
 * How a layer follows the base design into another view: 'stretch' (fill the same share of the stage, for
 * backgrounds and canvas effects), 'scale' (uniform size, centre kept in place) or 'fixed' (same pixels).
 * props.responsive picks it; 'auto' (default) stretches top-level layers that cover the whole base stage.
 */
export function responsiveMode(props, base, topLevel) {
  const mode = props.responsive ?? 'auto';
  if (mode !== 'auto') return mode;
  const covers = props.x <= 1 && props.y <= 1 && props.x + props.width >= base.width - 1 && props.y + props.height >= base.height - 1;
  return topLevel && covers ? 'stretch' : 'scale';
}

function autoLayout(props, { sx, sy, s }, topLevel, base) {
  const out = { ...props };
  const mode = responsiveMode(props, base, topLevel);
  if (mode === 'fixed') return out;
  if (mode === 'stretch') {
    for (const key of SIZE_PROPS) if (typeof out[key] === 'number' && key !== 'width' && key !== 'height') out[key] = round(out[key] * s);
    Object.assign(out, { x: round(props.x * sx), y: round(props.y * sy), width: round(props.width * sx), height: round(props.height * sy) });
    return out;
  }
  for (const key of SIZE_PROPS) if (typeof out[key] === 'number') out[key] = round(out[key] * s);
  if (topLevel) {
    const cx = (props.x + props.width / 2) * sx;
    const cy = (props.y + props.height / 2) * sy;
    out.x = round(cx - out.width / 2);
    out.y = round(cy - out.height / 2);
  } else {
    out.x = round(props.x * s);
    out.y = round(props.y * s);
  }
  return out;
}

const round = (v) => Math.round(v * 100) / 100;

/**
 * Changes a layer's props in a view: the base view edits props, another view edits only its overrides.
 * Returns the layer (mutated).
 */
export function setLayerProps(scene, layer, viewId, changes) {
  const base = baseView(scene);
  if (!viewId || viewId === base.id) Object.assign(layer.props, changes);
  else {
    layer.views ??= {};
    layer.views[viewId] = { ...(layer.views[viewId] ?? {}), ...changes };
  }
  return layer;
}

/** Whether a prop of the layer is overridden in the view. */
export function isOverridden(layer, viewId, key) {
  return !!layer.views?.[viewId] && Object.prototype.hasOwnProperty.call(layer.views[viewId], key);
}

/** Removes a view's overrides of a layer (all, or the given keys). */
export function resetOverrides(layer, viewId, keys = null) {
  if (!layer.views?.[viewId]) return;
  if (!keys) delete layer.views[viewId];
  else {
    for (const k of keys) delete layer.views[viewId][k];
    if (!Object.keys(layer.views[viewId]).length) delete layer.views[viewId];
  }
}

/**
 * A clip as it plays in a view: its view overrides merged in, and pixel offsets (x, y in from / to) scaled to the view
 * when it has no override for them. Returns null when the clip does not play in that view.
 */
export function resolveClip(scene, clip, viewId) {
  const view = getView(scene, viewId);
  if (clip.views && clip.views.length && !clip.views.includes(view.id)) return null;
  const over = clip.overrides?.[view.id] ?? {};
  const out = { ...clip, from: { ...clip.from }, to: { ...clip.to }, params: { ...clip.params, ...(over.params ?? {}) } };
  if (view.id !== baseView(scene).id) {
    const { sx, sy, s } = viewScale(scene, view);
    for (const side of ['from', 'to']) {
      for (const [k, v] of Object.entries(out[side])) {
        if (typeof v !== 'number') continue;
        if (X_PROPS.has(k)) out[side][k] = round(v * sx);
        else if (Y_PROPS.has(k)) out[side][k] = round(v * sy);
        else if (SIZE_PROPS.has(k)) out[side][k] = round(v * s);
      }
    }
  }
  Object.assign(out.from, over.from ?? {});
  Object.assign(out.to, over.to ?? {});
  return out;
}

// ───────────── queries ─────────────

export function findLayer(scene, id) {
  return scene.layers.find((l) => l.id === id) ?? null;
}

export function findClip(scene, clipId) {
  for (const layer of scene.layers) {
    const clip = layer.clips.find((c) => c.id === clipId);
    if (clip) return { layer, clip };
  }
  return null;
}

export function childrenOf(scene, parentId) {
  return scene.layers.filter((l) => (l.parentId ?? null) === (parentId ?? null));
}

/** All descendants' ids of a layer (not the layer itself). */
export function descendantIds(scene, id) {
  const out = [];
  const walk = (pid) => { for (const l of scene.layers) if (l.parentId === pid) { out.push(l.id); walk(l.id); } };
  walk(id);
  return out;
}

/** Where a clip ends, counting its repeats. Infinite repeats count once. */
export function clipEnd(clip) {
  const reps = clip.repeat > 0 ? clip.repeat : 0;
  return clip.start + clip.duration * (reps + 1) + clip.repeatDelay * reps + staggerSpan(clip);
}

function staggerSpan(clip) {
  // A rough upper bound only: the real span depends on how many targets there are.
  const each = clip.stagger?.each ?? clip.params?.stagger?.each ?? 0;
  return each > 0 ? each * 8 : 0;
}

/** The scene's length: the larger of settings.duration and the last clip's end. */
export function sceneDuration(scene) {
  let end = 0;
  for (const layer of scene.layers) for (const clip of layer.clips) end = Math.max(end, clip.start + clip.duration * ((clip.repeat > 0 ? clip.repeat : 0) + 1) + clip.repeatDelay * Math.max(0, clip.repeat));
  return Math.max(num(scene.settings?.duration, 0), end);
}

/** The labels, sorted by time. */
export function sortedLabels(scene) {
  return [...(scene.labels ?? [])].sort((a, b) => a.time - b.time);
}

// ───────────── editing helpers (mutate the scene) ─────────────

/** Adds a layer above `aboveId` (or on top), inside `parentId` when given. Returns the layer. */
export function addLayer(scene, layer, { parentId = null, index = null } = {}) {
  layer.parentId = parentId;
  if (index === null || index >= scene.layers.length) scene.layers.push(layer);
  else scene.layers.splice(Math.max(0, index), 0, layer);
  return layer;
}

/** Removes a layer, its descendants, and references to them (morph / motion path targets stay as dangling names). */
export function removeLayer(scene, id) {
  const ids = new Set([id, ...descendantIds(scene, id)]);
  scene.layers = scene.layers.filter((l) => !ids.has(l.id));
  return ids;
}

/** Deep-copies a layer (and its descendants) with new ids, placed right above it. Returns the copy. */
export function duplicateLayer(scene, id, { offset = 20 } = {}) {
  const source = findLayer(scene, id);
  if (!source) return null;
  const ids = [id, ...descendantIds(scene, id)];
  const map = new Map(ids.map((old) => [old, uid(findLayer(scene, old).kind)]));
  const copies = ids.map((old) => {
    const c = clone(findLayer(scene, old));
    c.id = map.get(old);
    c.parentId = map.get(c.parentId) ?? c.parentId;
    c.clips = c.clips.map((clip) => ({ ...clip, id: uid('clip') }));
    return c;
  });
  copies[0].name = `${source.name} copy`;
  copies[0].props.x += offset;
  copies[0].props.y += offset;
  const at = scene.layers.indexOf(scene.layers.filter((l) => ids.includes(l.id)).pop()) + 1;
  scene.layers.splice(at, 0, ...copies);
  return copies[0];
}

/** Moves a layer one step up (+1) or down (-1) among its siblings. */
export function moveLayer(scene, id, step) {
  const layer = findLayer(scene, id);
  if (!layer) return false;
  const siblings = childrenOf(scene, layer.parentId);
  const i = siblings.indexOf(layer);
  const j = i + step;
  if (j < 0 || j >= siblings.length) return false;
  const a = scene.layers.indexOf(layer);
  const b = scene.layers.indexOf(siblings[j]);
  scene.layers[a] = siblings[j];
  scene.layers[b] = layer;
  return true;
}

/** Moves a layer (and its subtree) to sit right above `targetId`, or into the group `targetId` with into=true. */
export function reparentLayer(scene, id, targetId, { into = false } = {}) {
  if (id === targetId || descendantIds(scene, id).includes(targetId)) return false;
  const ids = [id, ...descendantIds(scene, id)];
  const moving = scene.layers.filter((l) => ids.includes(l.id));
  scene.layers = scene.layers.filter((l) => !ids.includes(l.id));
  const target = findLayer(scene, targetId);
  moving[0].parentId = into ? targetId : (target?.parentId ?? null);
  let at = scene.layers.length;
  if (target) {
    const subtree = [targetId, ...descendantIds(scene, targetId)];
    at = Math.max(...subtree.map((t) => scene.layers.findIndex((l) => l.id === t))) + 1;
  }
  scene.layers.splice(at, 0, ...moving);
  return true;
}

/** Groups layers (siblings) into a new group sized to their bounds in the base view. Returns the group. */
export function groupLayers(scene, ids) {
  const layers = ids.map((id) => findLayer(scene, id)).filter(Boolean);
  if (!layers.length) return null;
  const parentId = layers[0].parentId ?? null;
  const minX = Math.min(...layers.map((l) => l.props.x));
  const minY = Math.min(...layers.map((l) => l.props.y));
  const maxX = Math.max(...layers.map((l) => l.props.x + l.props.width));
  const maxY = Math.max(...layers.map((l) => l.props.y + l.props.height));
  const group = createLayer('group', { x: minX, y: minY, width: maxX - minX, height: maxY - minY }, { name: 'Group' });
  const firstIndex = Math.min(...layers.map((l) => scene.layers.indexOf(l)));
  scene.layers.splice(firstIndex, 0, group);
  group.parentId = parentId;
  for (const l of layers) {
    l.parentId = group.id;
    l.props.x -= minX;
    l.props.y -= minY;
  }
  // keep the children right after the group, in their order
  const kids = scene.layers.filter((l) => l.parentId === group.id);
  scene.layers = scene.layers.filter((l) => l.parentId !== group.id);
  scene.layers.splice(scene.layers.indexOf(group) + 1, 0, ...kids);
  return group;
}

/** Shifts every clip of the scene that starts at or after `time` by `delta` seconds. */
export function shiftClips(scene, time, delta) {
  for (const layer of scene.layers) for (const clip of layer.clips) if (clip.start >= time) clip.start = Math.max(0, round(clip.start + delta));
}

// ───────────── validation, migration, (de)serialisation ─────────────

/**
 * Checks and completes a scene (any version this player knows), returning a new, normalised scene.
 * Unknown fields are kept, so newer Studio versions can add data older players ignore.
 * Throws SceneError for something that is not a scene.
 */
export function normalizeScene(input) {
  const raw = typeof input === 'string' ? parseJson(input) : clone(input);
  if (!isObj(raw)) throw new SceneError('a scene must be an object');
  if (raw.type && raw.type !== SCENE_TYPE) throw new SceneError(`not a MudTail Animator scene (type "${raw.type}")`);
  const version = num(raw.version, SCENE_VERSION);
  if (version > SCENE_VERSION) throw new SceneError(`scene version ${version} is newer than this player (${SCENE_VERSION}); update MudTail`);

  const scene = { ...raw, type: SCENE_TYPE, version: SCENE_VERSION };
  scene.id = typeof raw.id === 'string' && raw.id ? raw.id : uid('scene');
  scene.name = typeof raw.name === 'string' ? raw.name : 'Untitled scene';
  scene.settings = { ...clone(DEFAULT_SETTINGS), ...(isObj(raw.settings) ? raw.settings : {}) };
  scene.settings.scroll = { ...DEFAULT_SETTINGS.scroll, ...(isObj(raw.settings?.scroll) ? raw.settings.scroll : {}) };
  scene.settings.duration = Math.max(0, num(scene.settings.duration, DEFAULT_SETTINGS.duration));
  scene.settings.speed = num(scene.settings.speed, 1) || 1;

  const views = Array.isArray(raw.views) && raw.views.length ? raw.views : clone(DEFAULT_VIEWS);
  const seenViews = new Set();
  scene.views = views.filter(isObj).map((v, i) => {
    let id = typeof v.id === 'string' && v.id ? v.id : `view${i + 1}`;
    while (seenViews.has(id)) id = `${id}_`;
    seenViews.add(id);
    return { ...v, id, label: v.label ?? cap(id), width: Math.max(1, num(v.width, 1280)), height: Math.max(1, num(v.height, 720)), minWidth: Math.max(0, num(v.minWidth, 0)) };
  });
  if (!scene.views.length) scene.views = clone(DEFAULT_VIEWS);

  scene.assets = (Array.isArray(raw.assets) ? raw.assets : []).filter(isObj).map((a) => ({ ...a, id: String(a.id ?? uid('asset')), kind: a.kind ?? 'image', name: a.name ?? 'Asset' }));

  const ids = new Set();
  scene.layers = (Array.isArray(raw.layers) ? raw.layers : []).filter(isObj).map((l) => {
    const kind = LAYER_KINDS.includes(l.kind) ? l.kind : 'html';
    let id = typeof l.id === 'string' && l.id ? l.id : uid(kind);
    if (ids.has(id)) id = uid(kind);
    ids.add(id);
    const props = { ...BASE_PROPS, ...KIND_PROPS[kind], ...(isObj(l.props) ? l.props : {}) };
    for (const k of ['x', 'y', 'width', 'height', 'rotation', 'scaleX', 'scaleY', 'opacity']) props[k] = num(props[k], BASE_PROPS[k] ?? KIND_PROPS[kind][k] ?? 0);
    return {
      ...l,
      id,
      kind,
      name: typeof l.name === 'string' ? l.name : defaultLayerName(kind, props),
      parentId: l.parentId ?? null,
      hidden: !!l.hidden,
      locked: !!l.locked,
      props,
      views: isObj(l.views) ? l.views : {},
      clips: (Array.isArray(l.clips) ? l.clips : []).filter(isObj).map((c) => ({ ...createClip(c.type ?? 'tween', c), ...c, id: typeof c.id === 'string' ? c.id : uid('clip'), start: Math.max(0, num(c.start, 0)), duration: Math.max(0, num(c.duration, 1)) })),
      interactions: Array.isArray(l.interactions) ? l.interactions.filter(isObj) : [],
      draggable: isObj(l.draggable) ? l.draggable : null,
    };
  });
  // a parent must exist and come before its children; otherwise the layer goes to the top level
  const index = new Map(scene.layers.map((l, i) => [l.id, i]));
  for (const [i, l] of scene.layers.entries()) {
    if (l.parentId && !(index.has(l.parentId) && index.get(l.parentId) < i && scene.layers[index.get(l.parentId)].kind === 'group')) l.parentId = null;
  }
  scene.labels = (Array.isArray(raw.labels) ? raw.labels : []).filter(isObj).map((lb) => ({ id: lb.id ?? uid('label'), name: String(lb.name ?? 'label'), time: Math.max(0, num(lb.time, 0)) }));
  return scene;
}

/** Throws SceneError when the input is not a scene; returns a list of warnings (dangling references, …) otherwise. */
export function validateScene(input) {
  const scene = normalizeScene(input);
  const warnings = [];
  const layerIds = new Set(scene.layers.map((l) => l.id));
  const assetIds = new Set(scene.assets.map((a) => a.id));
  for (const l of scene.layers) {
    if (l.props.assetId && !assetIds.has(l.props.assetId)) warnings.push(`layer "${l.name}" uses a missing asset (${l.props.assetId})`);
    for (const c of l.clips) {
      for (const ref of [c.params?.target, c.params?.path]) {
        if (typeof ref === 'string' && ref.startsWith('layer:') && !layerIds.has(ref.slice(6))) warnings.push(`clip "${c.name || c.type}" on "${l.name}" points to a missing layer (${ref})`);
      }
    }
  }
  return warnings;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new SceneError(`the file is not valid JSON (${e.message})`);
  }
}

/** The scene as a JSON string for a .mudscene.json file (updated timestamp refreshed). */
export function serializeScene(scene, { pretty = true } = {}) {
  const out = { ...scene, type: SCENE_TYPE, version: SCENE_VERSION, updated: new Date().toISOString() };
  return JSON.stringify(out, null, pretty ? 2 : 0);
}

/** A scene from JSON text or an object; alias of normalizeScene that reads better at call sites. */
export function parseScene(input) {
  return normalizeScene(input);
}

/** A deep copy (for undo snapshots and templates). */
export function cloneScene(scene) {
  return clone(scene);
}

/** A file name for a scene: "hero-banner.mudscene.json". */
export function sceneFileName(scene, ext = '.mudscene.json') {
  const slug = String(scene?.name ?? 'scene').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'scene';
  return `${slug}${ext}`;
}
