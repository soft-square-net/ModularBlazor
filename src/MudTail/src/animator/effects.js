// MudTail Animator: clip types. A clip is one animation on a layer's timeline row; its `type` picks how it becomes
// GSAP tweens, and which plugin does the work. Each type describes its parameters (the Studio builds the inspector
// from them) and builds itself into the scene's timeline.

import { shapePath, motionPath, isPathData, MOTION_PATHS, SHAPES } from './shapes.js';
import { toEase, squashEase, WIGGLE_TYPES } from './eases.js';
import { CANVAS_PARAMS } from './canvas-effects.js';

// ───────────── animatable properties ─────────────

/** Properties a tween clip offers in the Studio (any other GSAP-tweenable property works too, typed by name). */
export const TWEEN_PROPS = Object.freeze([
  // [key, label, group, unit, step, default]
  ['x', 'Move X', 'Transform', 'px', 1, 0], ['y', 'Move Y', 'Transform', 'px', 1, 0],
  ['xPercent', 'Move X (% of width)', 'Transform', '%', 1, 0], ['yPercent', 'Move Y (% of height)', 'Transform', '%', 1, 0],
  ['rotation', 'Rotate', 'Transform', '°', 1, 0], ['scale', 'Scale', 'Transform', '×', 0.05, 1],
  ['scaleX', 'Scale X', 'Transform', '×', 0.05, 1], ['scaleY', 'Scale Y', 'Transform', '×', 0.05, 1],
  ['skewX', 'Skew X', 'Transform', '°', 1, 0], ['skewY', 'Skew Y', 'Transform', '°', 1, 0],
  ['rotationX', 'Rotate X (3D)', '3D', '°', 1, 0], ['rotationY', 'Rotate Y (3D)', '3D', '°', 1, 0], ['z', 'Depth Z (3D)', '3D', 'px', 1, 0],
  ['transformPerspective', 'Perspective', '3D', 'px', 10, 800],
  ['opacity', 'Opacity', 'Look', '', 0.05, 1], ['autoAlpha', 'Opacity + visibility', 'Look', '', 0.05, 1],
  ['blur', 'Blur', 'Filter', 'px', 0.5, 0], ['brightness', 'Brightness', 'Filter', '×', 0.05, 1], ['contrast', 'Contrast', 'Filter', '×', 0.05, 1],
  ['saturate', 'Saturation', 'Filter', '×', 0.05, 1], ['hue', 'Hue rotate', 'Filter', '°', 1, 0], ['grayscale', 'Grayscale', 'Filter', '', 0.05, 0],
  ['sepia', 'Sepia', 'Filter', '', 0.05, 0], ['invert', 'Invert', 'Filter', '', 0.05, 0],
  ['clipPath', 'Clip path', 'Mask', '', null, 'inset(0% 0% 0% 0%)'],
  ['backgroundColor', 'Background colour', 'Colour', 'color', null, '#6366f1'], ['color', 'Text / icon colour', 'Colour', 'color', null, '#ffffff'],
  ['fill', 'Fill (shapes)', 'Colour', 'color', null, '#6366f1'], ['stroke', 'Stroke (shapes)', 'Colour', 'color', null, '#ffffff'],
  ['strokeWidth', 'Stroke width', 'Colour', 'px', 0.5, 2],
  ['borderRadius', 'Corner radius', 'Box', 'px', 1, 0], ['boxShadow', 'Shadow', 'Box', '', null, '0 20px 40px rgba(0,0,0,.35)'],
  ['width', 'Width', 'Box', 'px', 1, 200], ['height', 'Height', 'Box', 'px', 1, 120],
  ['fontSize', 'Font size', 'Text', 'px', 1, 48], ['letterSpacing', 'Letter spacing', 'Text', 'px', 0.5, 0],
  ['volume', 'Volume (media)', 'Media', '', 0.05, 1],
]);

const FILTERS = [['blur', 'blur', 'px', 0], ['brightness', 'brightness', '', 1], ['contrast', 'contrast', '', 1], ['saturate', 'saturate', '', 1],
  ['hue', 'hue-rotate', 'deg', 0], ['grayscale', 'grayscale', '', 0], ['sepia', 'sepia', '', 0], ['invert', 'invert', '', 0]];
const FILTER_KEYS = new Set(FILTERS.map((f) => f[0]));
const PATH_KEYS = new Set(['fill', 'stroke', 'strokeWidth', 'fillOpacity', 'strokeOpacity', 'strokeDasharray', 'strokeDashoffset']);
const TEXT_KEYS = new Set(['color', 'fontSize', 'letterSpacing', 'textShadow', 'wordSpacing', 'lineHeight', 'fontWeight']);

/** A filter string with every function present, so GSAP can tween one into another. */
export function filterString(values, base = {}) {
  return FILTERS.map(([key, fn, unit, def]) => `${fn}(${values[key] ?? base[key] ?? def}${unit})`).join(' ');
}

/**
 * Splits a clip's vars by the element they belong to: the layer box (outer), its shape path (path) or text box (text).
 * Filter shortcuts become one filter string; radius → borderRadius; shadow → boxShadow.
 */
export function splitVars(vars, node, baseFilter) {
  const outer = {}; const path = {}; const text = {}; const filter = {};
  for (const [k, v] of Object.entries(vars ?? {})) {
    if (v === '' || v === undefined || v === null) continue;
    if (FILTER_KEYS.has(k)) filter[k] = v;
    else if (node?.path && PATH_KEYS.has(k)) path[k] = v;
    else if (node?.text && TEXT_KEYS.has(k)) text[k] = typeof v === 'number' && k !== 'fontWeight' && k !== 'lineHeight' ? `${v}px` : v;
    else if (k === 'radius') outer.borderRadius = `${v}px`;
    else if (k === 'shadow') outer.boxShadow = v;
    else if (k === 'volume' && node?.media) continue;
    else outer[k] = v;
  }
  if (Object.keys(filter).length) outer.filter = filterString(filter, baseFilter);
  return { outer, path, text };
}

// ───────────── targets ─────────────

const DRAWABLE = 'path, line, polyline, polygon, rect, circle, ellipse';

/** The elements a clip animates: the layer, its children, an SVG's parts or a CSS selector inside it. */
export function clipTargets(node, clip, nodes) {
  const which = clip.params?.targets ?? 'self';
  if (which === 'children') {
    const kids = [...nodes.values()].filter((n) => n.layer.parentId === node.layer.id).map((n) => n.el);
    return kids.length ? kids : [node.el];
  }
  if (which === 'parts') {
    const parts = node.svg ? [...node.svg.querySelectorAll(DRAWABLE)] : [];
    return parts.length ? parts : [node.el];
  }
  if (which === 'selector' && clip.params?.selector) {
    try {
      const found = [...node.el.querySelectorAll(clip.params.selector)];
      return found.length ? found : [node.el];
    } catch { return [node.el]; }
  }
  return [node.el];
}

function staggerVars(stagger) {
  if (!stagger || !(stagger.each || stagger.amount)) return undefined;
  const out = {};
  if (stagger.amount) out.amount = +stagger.amount; else out.each = +stagger.each;
  if (stagger.from !== undefined && stagger.from !== '') out.from = isNaN(+stagger.from) ? stagger.from : +stagger.from;
  if (stagger.grid) out.grid = stagger.grid === 'auto' ? 'auto' : stagger.grid;
  if (stagger.axis) out.axis = stagger.axis;
  if (stagger.ease) out.ease = stagger.ease;
  return out;
}

// ───────────── the clip types ─────────────

/**
 * Field descriptors for the inspector: { key, label, type: number | text | textarea | select | checkbox | color |
 * shape | layer | path | points, options?, min?, max?, step?, default? }.
 */
const F = {
  num: (key, label, def, extra = {}) => ({ key, label, type: 'number', default: def, ...extra }),
  text: (key, label, def = '', extra = {}) => ({ key, label, type: 'text', default: def, ...extra }),
  area: (key, label, def = '') => ({ key, label, type: 'textarea', default: def }),
  sel: (key, label, options, def) => ({ key, label, type: 'select', options, default: def ?? options[0]?.[0] ?? options[0] }),
  bool: (key, label, def = false) => ({ key, label, type: 'checkbox', default: def }),
  color: (key, label, def) => ({ key, label, type: 'color', default: def }),
};

const TARGETS = [['self', 'The layer'], ['children', 'Its child layers (group)'], ['parts', 'Its SVG parts'], ['selector', 'CSS selector inside']];

export const EFFECTS = {
  tween: {
    label: 'Tween', group: 'Core', plugin: 'GSAP core', icon: 'anim-tween',
    description: 'Animate any properties: from, to, or from → to. Stagger across children or SVG parts.',
    fields: [F.sel('targets', 'Animate', TARGETS, 'self'), F.text('selector', 'Selector (when "CSS selector")', ''), F.text('transformOrigin', 'Transform origin', '')],
    vars: true,
    build(c) {
      const targets = clipTargets(c.node, c.clip, c.nodes);
      const own = targets.length === 1 && targets[0] === c.node.el;
      const from = splitVars(c.clip.from, own ? c.node : null, c.baseFilter);
      const to = splitVars(c.clip.to, own ? c.node : null, c.baseFilter);
      const extra = {};
      if (c.clip.params?.transformOrigin) extra.transformOrigin = c.clip.params.transformOrigin;
      const stagger = staggerVars(c.clip.stagger);
      tweenGroup(c, targets, from.outer, to.outer, { ...extra, stagger });
      if (own && c.node.path) tweenGroup(c, [c.node.path], from.path, to.path, {});
      if (own && c.node.text) tweenGroup(c, [c.node.text], from.text, to.text, {});
      if (own && c.node.media && (c.clip.to?.volume !== undefined)) tweenGroup(c, [c.node.media], c.clip.from?.volume !== undefined ? { volume: c.clip.from.volume } : {}, { volume: c.clip.to.volume }, {});
    },
  },

  set: {
    label: 'Set (instant)', group: 'Core', plugin: 'GSAP core', icon: 'anim-set',
    description: 'Jump to values at a moment, with no animation (show / hide, swap colours, reset).',
    fields: [F.sel('targets', 'Apply to', TARGETS, 'self'), F.text('selector', 'Selector', '')],
    vars: 'to', instant: true,
    build(c) {
      const targets = clipTargets(c.node, c.clip, c.nodes);
      const own = targets.length === 1 && targets[0] === c.node.el;
      const to = splitVars(c.clip.to, own ? c.node : null, c.baseFilter);
      if (Object.keys(to.outer).length) c.tl.set(targets, to.outer, c.at);
      if (own && c.node.path && Object.keys(to.path).length) c.tl.set(c.node.path, to.path, c.at);
      if (own && c.node.text && Object.keys(to.text).length) c.tl.set(c.node.text, to.text, c.at);
    },
  },

  morph: {
    label: 'Morph shape', group: 'SVG', plugin: 'MorphSVGPlugin', icon: 'anim-morph', kinds: ['shape', 'svg', 'icon'],
    description: 'Morph the shape into another shape, another layer\'s shape or any SVG path.',
    fields: [
      F.sel('into', 'Morph into', [['shape', 'A shape'], ['layer', 'Another layer'], ['path', 'Path data']], 'shape'),
      { key: 'shape', label: 'Shape', type: 'select', options: SHAPES.filter(([k]) => k !== 'custom'), default: 'star' },
      F.num('points', 'Points (polygon / star)', 5, { min: 3, max: 40, step: 1 }),
      F.num('innerRadius', 'Inner radius (star)', 0.45, { min: 0.05, max: 1, step: 0.05 }),
      { key: 'target', label: 'Layer', type: 'layer', default: '' },
      F.area('d', 'Path data (in the layer\'s box)', ''),
      F.sel('type', 'Morph type', [['linear', 'Linear'], ['rotational', 'Rotational']], 'linear'),
      F.text('shapeIndex', 'Shape index ("auto" or a number)', 'auto'),
      F.text('selector', 'SVG part (svg / icon layers)', 'path'),
    ],
    vars: 'to',
    build(c) {
      const p = c.clip.params ?? {};
      const el = c.node.path ?? c.node.svg?.querySelector(p.selector || 'path');
      if (!el) return warnOnce(c, 'nothing to morph: use a shape, SVG or icon layer');
      let shape = '';
      const { width, height } = c.node.props;
      if ((p.into ?? 'shape') === 'shape') shape = shapePath(p.shape || 'star', width, height, { points: p.points, innerRadius: p.innerRadius, corner: c.node.props.corner });
      else if (p.into === 'layer') {
        const id = String(p.target ?? '').replace(/^layer:/, '');
        const other = c.nodes.get(id);
        if (other?.layer.kind === 'shape') shape = shapePath(other.props.shape, width, height, other.props);
        else if (other) shape = other.path ?? other.svg?.querySelector('path') ?? '';
      } else if (isPathData(p.d)) shape = p.d;
      if (!shape) return warnOnce(c, 'morph has no target shape');
      const vars = { morphSVG: { shape, type: p.type || 'linear', shapeIndex: p.shapeIndex === '' || p.shapeIndex === 'auto' || p.shapeIndex == null ? 'auto' : +p.shapeIndex }, ...c.common };
      const to = splitVars(c.clip.to, c.node, c.baseFilter);
      Object.assign(vars, to.path);
      c.tl.to(el, vars, c.at);
      if (Object.keys(to.outer).length) c.tl.to(c.node.el, { ...to.outer, ...c.common }, c.at);
    },
  },

  draw: {
    label: 'Draw stroke', group: 'SVG', plugin: 'DrawSVGPlugin', icon: 'anim-draw', kinds: ['shape', 'svg', 'icon'],
    description: 'Draw the outline on (or off): line art, signatures, icons, progress rings.',
    fields: [
      F.text('from', 'From (DrawSVG value)', '0%'), F.text('to', 'To (DrawSVG value)', '100%'),
      F.bool('fillAfter', 'Fade the fill in at the end', true), F.num('strokeWidth', 'Stroke width (if none)', 3, { min: 0.5, step: 0.5 }),
      F.sel('targets', 'Draw', [['self', 'The shape'], ['parts', 'Every SVG part'], ['selector', 'CSS selector inside']], 'parts'),
      F.text('selector', 'Selector', 'path'),
    ],
    stagger: true,
    build(c) {
      const p = c.clip.params ?? {};
      let targets = c.node.path ? [c.node.path] : c.node.svg ? [...c.node.svg.querySelectorAll(p.targets === 'selector' && p.selector ? p.selector : DRAWABLE)] : [];
      targets = targets.filter((t) => t.tagName);
      if (!targets.length) return warnOnce(c, 'nothing to draw: use a shape, SVG or icon layer');
      for (const t of targets) {
        const cs = getComputedStyle(t);
        if (!cs.stroke || cs.stroke === 'none') {
          const fill = t.getAttribute('fill');
          t.setAttribute('stroke', fill && fill !== 'none' ? fill : c.node.props.color || '#ffffff');
          t.setAttribute('stroke-width', String(p.strokeWidth ?? 3));
        }
      }
      c.tl.fromTo(targets, { drawSVG: p.from ?? '0%' }, { drawSVG: p.to ?? '100%', ...c.common, stagger: staggerVars(c.clip.stagger) }, c.at);
      if (p.fillAfter !== false && c.node.path && (c.node.props.fill && !['line', 'wave'].includes(c.node.props.shape))) {
        c.tl.fromTo(targets, { fillOpacity: 0 }, { fillOpacity: 1, duration: Math.max(0.2, c.clip.duration * 0.4), ease: 'power1.out' }, c.at + c.clip.duration * 0.75);
      }
    },
  },

  motionPath: {
    label: 'Motion path', group: 'Motion', plugin: 'MotionPathPlugin', icon: 'anim-path',
    description: 'Move along a curve: a built-in path, points you drag on the Stage, a shape layer or path data.',
    fields: [
      F.sel('source', 'Path', [['preset', 'Built-in path'], ['points', 'Points (edit on the Stage)'], ['layer', 'A shape layer'], ['path', 'Path data']], 'preset'),
      { key: 'preset', label: 'Built-in path', type: 'select', options: MOTION_PATHS, default: 'arc' },
      F.num('width', 'Path width', 600, { step: 10 }), F.num('height', 'Path height', 200, { step: 10 }),
      { key: 'points', label: 'Points', type: 'points', default: [[0, 0], [160, -140], [320, 0], [480, -90]] },
      F.num('curviness', 'Curviness (points)', 1.5, { min: 0, max: 3, step: 0.1 }),
      { key: 'target', label: 'Shape layer', type: 'layer', default: '' },
      F.area('d', 'Path data (from the layer\'s position)', ''),
      { key: 'autoRotate', label: 'Auto-rotate', type: 'checkbox', default: false },
      F.num('rotateOffset', 'Rotation offset', 0, { step: 5 }),
      F.num('start', 'Start (0–1)', 0, { min: 0, max: 1, step: 0.05 }), F.num('end', 'End (0–1)', 1, { min: 0, max: 1, step: 0.05 }),
    ],
    build(c) {
      const p = c.clip.params ?? {};
      const mp = { start: num(p.start, 0), end: num(p.end, 1) };
      if (p.autoRotate) mp.autoRotate = num(p.rotateOffset, 0) || true;
      const source = p.source ?? 'preset';
      if (source === 'layer') {
        const other = c.nodes.get(String(p.target ?? '').replace(/^layer:/, ''));
        const path = other?.path ?? other?.svg?.querySelector('path');
        if (!path) return warnOnce(c, 'motion path layer not found (pick a shape layer)');
        Object.assign(mp, { path, align: path, alignOrigin: [0.5, 0.5] });
      } else if (source === 'points') {
        const pts = Array.isArray(p.points) && p.points.length > 1 ? p.points : [[0, 0], [200, -150], [400, 0]];
        Object.assign(mp, { path: pts.map(([x, y]) => ({ x: x * c.scale.sx, y: y * c.scale.sy })), curviness: num(p.curviness, 1.5) });
      } else if (source === 'path' && isPathData(p.d)) mp.path = p.d;
      else mp.path = motionPath(p.preset || 'arc', num(p.width, 600) * c.scale.sx, num(p.height, 200) * c.scale.sy);
      c.tl.to(c.node.el, { motionPath: mp, ...c.common, ...splitVars(c.clip.to, null).outer }, c.at);
    },
  },

  split: {
    label: 'Split text', group: 'Text', plugin: 'SplitText', icon: 'anim-split', kinds: ['text', 'html'],
    description: 'Animate characters, words or lines one after another, with optional masks for clean reveals.',
    fields: [
      F.sel('split', 'Split into', [['chars', 'Characters'], ['words', 'Words'], ['lines', 'Lines']], 'chars'),
      F.bool('mask', 'Mask (reveal from behind a clip)', false),
    ],
    vars: true, stagger: true,
    build(c) {
      const p = c.clip.params ?? {};
      const SplitText = c.plugins.SplitText;
      const host = c.node.text ?? c.node.el;
      const kind = ['chars', 'words', 'lines'].includes(p.split) ? p.split : 'chars';
      const type = kind === 'chars' ? 'words,chars' : kind === 'lines' ? 'lines,words' : 'words';
      const split = SplitText.create(host, { type, mask: p.mask ? kind : undefined, aria: 'auto' });
      const parts = split[kind];
      if (!parts?.length) return;
      // Gradient text (background-clip: text) does not reach transformed children: give each piece its slice of it.
      if (c.node.props.gradient && host.offsetWidth) {
        const hostRect = host.getBoundingClientRect();
        const k = hostRect.width / host.offsetWidth || 1;
        const size = `${host.offsetWidth}px ${host.offsetHeight}px`;
        const pieces = split.chars?.length ? split.chars : parts;
        const pos = pieces.map((el) => { const r = el.getBoundingClientRect(); return [(r.left - hostRect.left) / k, (r.top - hostRect.top) / k]; });
        c.gsap.set(host, { backgroundImage: 'none', color: 'transparent' });
        pieces.forEach((el, i) => c.gsap.set(el, {
          backgroundImage: c.node.props.gradient, backgroundSize: size, backgroundRepeat: 'no-repeat',
          backgroundPosition: `${-pos[i][0]}px ${-pos[i][1]}px`, webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }));
      }
      const stagger = staggerVars(c.clip.stagger) ?? { each: kind === 'chars' ? 0.03 : 0.08 };
      tweenGroup(c, parts, splitVars(c.clip.from, null).outer, splitVars(c.clip.to, null).outer, { stagger }, { defaultFrom: { yPercent: 100, opacity: 0 } });
    },
  },

  typewriter: {
    label: 'Typewriter', group: 'Text', plugin: 'TextPlugin', icon: 'anim-type', kinds: ['text'],
    description: 'Type text in (or replace it with new text), character by character or word by word.',
    fields: [F.area('text', 'Text to type (empty: the layer\'s text)', ''), F.sel('delimiter', 'Step by', [['', 'Character'], [' ', 'Word']], ''),
      F.bool('fromEmpty', 'Start from empty', true), F.bool('cursor', 'Blinking cursor', true)],
    build(c) {
      const p = c.clip.params ?? {};
      const host = c.node.text ?? c.node.el;
      const value = p.text || c.node.props.text || '';
      if (p.cursor !== false) host.classList.add('mud-anim-caret');
      const vars = { text: { value, delimiter: p.delimiter ?? '' }, ...c.common, ease: c.common.ease === 'power2.out' ? 'none' : c.common.ease };
      if (p.fromEmpty !== false) c.tl.fromTo(host, { text: '' }, vars, c.at);
      else c.tl.to(host, vars, c.at);
    },
  },

  scramble: {
    label: 'Scramble text', group: 'Text', plugin: 'ScrambleTextPlugin', icon: 'anim-scramble', kinds: ['text'],
    description: 'Decode text out of random characters: tech, reveal and glitch effects.',
    fields: [F.area('text', 'Final text (empty: the layer\'s text)', ''),
      F.sel('chars', 'Characters', [['upperCase', 'UPPERCASE'], ['lowerCase', 'lowercase'], ['upperAndLowerCase', 'Mixed case'], ['01', 'Binary'], ['!<>-_\\/[]{}—=+*^?#', 'Symbols'], ['custom', 'Custom…']], 'upperCase'),
      F.text('customChars', 'Custom characters', 'ABCDEF0123456789'), F.num('revealDelay', 'Reveal delay (s)', 0.3, { min: 0, step: 0.1 }),
      F.num('speed', 'Scramble speed', 0.4, { min: 0.05, max: 3, step: 0.05 }), F.bool('rightToLeft', 'Reveal right to left', false)],
    build(c) {
      const p = c.clip.params ?? {};
      const host = c.node.text ?? c.node.el;
      const chars = p.chars === 'custom' ? (p.customChars || 'ABCDEF0123456789') : (p.chars || 'upperCase');
      c.tl.to(host, { scrambleText: { text: p.text || c.node.props.text || '', chars, revealDelay: num(p.revealDelay, 0.3), speed: num(p.speed, 0.4), rightToLeft: !!p.rightToLeft, tweenLength: true }, ...c.common, ease: 'none' }, c.at);
    },
  },

  counter: {
    label: 'Number counter', group: 'Text', plugin: 'GSAP core', icon: 'anim-counter', kinds: ['text'],
    description: 'Count a number up or down: stats, scores, prices, with prefix, suffix and separators.',
    fields: [F.num('from', 'From', 0), F.num('to', 'To', 100), F.num('decimals', 'Decimals', 0, { min: 0, max: 6, step: 1 }),
      F.text('prefix', 'Prefix', ''), F.text('suffix', 'Suffix', ''), F.bool('separator', 'Thousands separator', true), F.text('locale', 'Number locale (empty: page)', '')],
    build(c) {
      const p = c.clip.params ?? {};
      const host = c.node.text ?? c.node.el;
      const decimals = Math.max(0, Math.min(6, Math.round(num(p.decimals, 0))));
      let fmt;
      try { fmt = new Intl.NumberFormat(p.locale || undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: p.separator !== false }); } catch { fmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
      const show = (v) => { host.textContent = `${p.prefix ?? ''}${fmt.format(v)}${p.suffix ?? ''}`; };
      const proxy = { v: num(p.from, 0) };
      show(proxy.v);
      c.tl.fromTo(proxy, { v: num(p.from, 0) }, { v: num(p.to, 100), ...c.common, onUpdate: () => show(proxy.v) }, c.at);
    },
  },

  bounce: {
    label: 'Squash & bounce', group: 'Physics', plugin: 'CustomBounce', icon: 'anim-bounce',
    description: 'Drop in and bounce, squashing on every landing: cartoon-style weight.',
    fields: [F.num('height', 'Drop height (px)', 300, { step: 10 }), F.num('strength', 'Bounciness', 0.6, { min: 0.1, max: 0.99, step: 0.05 }),
      F.num('squash', 'Squash amount', 2, { min: 0, max: 6, step: 0.25 }), F.bool('endAtStart', 'End where it started (jump)', false)],
    noEase: true,
    build(c) {
      const p = c.clip.params ?? {};
      const spec = { kind: 'bounce', strength: num(p.strength, 0.6), squash: num(p.squash, 2), endAtStart: !!p.endAtStart };
      const ease = toEase(spec, c.gsap, c.plugins);
      const squash = squashEase(spec, c.gsap);
      const h = num(p.height, 300) * c.scale.sy;
      const common = { ...c.common, ease };
      if (p.endAtStart) c.tl.to(c.node.el, { y: -h, ...common }, c.at);
      else c.tl.from(c.node.el, { y: -h, ...common }, c.at);
      if (squash && spec.squash > 0) c.tl.to(c.node.el, { scaleX: 1 + 0.2 * spec.squash / 2, scaleY: 1 - 0.2 * spec.squash / 2, transformOrigin: '50% 100%', ease: squash, duration: c.clip.duration, repeat: c.common.repeat, yoyo: c.common.yoyo }, c.at);
    },
  },

  wiggle: {
    label: 'Wiggle / shake', group: 'Emphasis', plugin: 'CustomWiggle', icon: 'anim-wiggle',
    description: 'Shake, wobble, jello or nudge: the property swings back and forth and settles.',
    fields: [F.sel('prop', 'Property', [['rotation', 'Rotation'], ['x', 'Horizontal'], ['y', 'Vertical'], ['scale', 'Scale'], ['skewX', 'Skew (jello)']], 'rotation'),
      F.num('amount', 'Amount', 15, { step: 1 }), F.num('wiggles', 'Wiggles', 8, { min: 1, max: 40, step: 1 }),
      F.sel('type', 'Wiggle type', WIGGLE_TYPES.map((w) => [w, w]), 'easeOut')],
    noEase: true,
    build(c) {
      const p = c.clip.params ?? {};
      const ease = toEase({ kind: 'wiggle', wiggles: num(p.wiggles, 8), type: p.type || 'easeOut' }, c.gsap, c.plugins);
      const prop = p.prop || 'rotation';
      const amount = num(p.amount, 15);
      const value = prop === 'scale' ? 1 + amount / 100 : prop === 'x' ? amount * c.scale.sx : prop === 'y' ? amount * c.scale.sy : amount;
      c.tl.to(c.node.el, { [prop]: prop === 'scale' ? value : `+=${value}`, ...c.common, ease, ...(prop === 'scale' ? {} : {}) }, c.at);
    },
  },

  physics2D: {
    label: 'Throw (2D physics)', group: 'Physics', plugin: 'Physics2DPlugin', icon: 'anim-physics',
    description: 'Throw the layer with a velocity and angle; gravity and friction take it from there.',
    fields: [F.num('velocity', 'Velocity (px/s)', 600, { step: 10 }), F.num('angle', 'Angle (°, -90 = up)', -60, { step: 5 }),
      F.num('gravity', 'Gravity (px/s²)', 800, { step: 10 }), F.num('friction', 'Friction (0–1)', 0, { min: 0, max: 1, step: 0.01 }),
      F.num('spin', 'Spin (° over the clip)', 0, { step: 15 })],
    noEase: true,
    build(c) {
      const p = c.clip.params ?? {};
      const vars = { physics2D: { velocity: num(p.velocity, 600) * c.scale.s, angle: num(p.angle, -60), gravity: num(p.gravity, 800) * c.scale.s, friction: num(p.friction, 0) }, duration: c.clip.duration, ease: 'none', repeat: c.common.repeat, yoyo: c.common.yoyo, repeatDelay: c.common.repeatDelay };
      if (num(p.spin, 0)) vars.rotation = `+=${num(p.spin, 0)}`;
      c.tl.to(clipTargets(c.node, c.clip, c.nodes), { ...vars, stagger: staggerVars(c.clip.stagger) }, c.at);
    },
  },

  physicsProps: {
    label: 'Velocity & friction', group: 'Physics', plugin: 'PhysicsPropsPlugin', icon: 'anim-physics',
    description: 'Give properties a velocity, acceleration and friction: drifting, coasting, spinning down.',
    fields: [F.num('vx', 'X velocity', 300, { step: 10 }), F.num('vy', 'Y velocity', 0, { step: 10 }), F.num('ay', 'Y acceleration', 0, { step: 10 }),
      F.num('vr', 'Rotation velocity (°/s)', 0, { step: 10 }), F.num('friction', 'Friction (0–1)', 0.1, { min: 0, max: 1, step: 0.01 })],
    noEase: true,
    build(c) {
      const p = c.clip.params ?? {};
      const fr = num(p.friction, 0.1);
      const props = {};
      if (num(p.vx, 0)) props.x = { velocity: num(p.vx, 0) * c.scale.sx, friction: fr };
      if (num(p.vy, 0) || num(p.ay, 0)) props.y = { velocity: num(p.vy, 0) * c.scale.sy, acceleration: num(p.ay, 0) * c.scale.sy, friction: fr };
      if (num(p.vr, 0)) props.rotation = { velocity: num(p.vr, 0), friction: fr };
      if (!Object.keys(props).length) return;
      c.tl.to(clipTargets(c.node, c.clip, c.nodes), { physicsProps: props, duration: c.clip.duration, ease: 'none', stagger: staggerVars(c.clip.stagger) }, c.at);
    },
  },

  canvas: {
    label: 'Canvas effect', group: 'Canvas', plugin: 'GSAP core', icon: 'anim-canvas', kinds: ['canvas'],
    description: 'Tween a canvas effect\'s parameters: particle count, speed, size, colours, spread.',
    vars: true, varKeys: CANVAS_PARAMS,
    build(c) {
      const target = c.node.canvas?.params;
      if (!target) return;
      const pick = (vars) => Object.fromEntries(Object.entries(vars ?? {}).filter(([k]) => CANVAS_PARAMS.includes(k)));
      tweenGroup(c, [target], pick(c.clip.from), pick(c.clip.to), {});
    },
  },

  media: {
    label: 'Media control', group: 'Media', plugin: 'GSAP core', icon: 'anim-media', kinds: ['video', 'audio'],
    description: 'Play, pause or restart a video or sound at a moment of the timeline.',
    fields: [F.sel('action', 'Action', [['play', 'Play'], ['pause', 'Pause'], ['restart', 'Restart'], ['seek', 'Seek to']], 'play'), F.num('time', 'Seek to (s)', 0, { min: 0, step: 0.1 })],
    instant: true,
    build(c) {
      const media = c.node.media;
      if (!media) return;
      const p = c.clip.params ?? {};
      c.tl.call(() => {
        if (c.studio && !c.isPlaying()) return;
        try {
          if (p.action === 'pause') media.pause();
          else if (p.action === 'seek') media.currentTime = num(p.time, 0);
          else { if (p.action === 'restart') media.currentTime = 0; const r = media.play(); r?.catch?.(() => {}); }
        } catch { /* autoplay blocked */ }
      }, null, c.at);
    },
  },

  css: {
    label: 'CSS variables', group: 'Core', plugin: 'GSAP core', icon: 'anim-tween',
    description: 'Tween CSS custom properties (--hue, --progress …) on the layer, for styles in HTML layers.',
    vars: true,
    build(c) {
      const only = (vars) => Object.fromEntries(Object.entries(vars ?? {}).filter(([k]) => k.startsWith('--')));
      tweenGroup(c, [c.node.el], only(c.clip.from), only(c.clip.to), {});
    },
  },
};

/** Clip types grouped for a picker: [[group, [[type, effect], …]], …]. */
export function effectGroups() {
  const groups = new Map();
  for (const [type, e] of Object.entries(EFFECTS)) {
    if (!groups.has(e.group)) groups.set(e.group, []);
    groups.get(e.group).push([type, e]);
  }
  return [...groups];
}

/** Whether a clip type can play on a layer kind. */
export function effectFits(type, kind) {
  const e = EFFECTS[type];
  return !!e && (!e.kinds || e.kinds.includes(kind) || (kind === 'group' && type === 'tween'));
}

/** A clip's params with its type's defaults filled in. */
export function withDefaults(type, params = {}) {
  const out = {};
  for (const f of EFFECTS[type]?.fields ?? []) if (f.default !== undefined) out[f.key] = Array.isArray(f.default) ? f.default.map((v) => (Array.isArray(v) ? [...v] : v)) : f.default;
  return { ...out, ...params };
}

// ───────────── helpers ─────────────

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : v !== '' && v != null && Number.isFinite(+v) ? +v : d);

/** from / to / fromTo depending on which sides have values. */
function tweenGroup(c, targets, from, to, extra, { defaultFrom = null } = {}) {
  let hasFrom = Object.keys(from).length > 0;
  const hasTo = Object.keys(to).length > 0;
  if (!hasFrom && !hasTo && defaultFrom) { from = defaultFrom; hasFrom = true; }
  if (!hasFrom && !hasTo) return;
  const vars = { ...c.common, ...clean(extra) };
  if (hasFrom && hasTo) c.tl.fromTo(targets, from, { ...to, ...vars }, c.at);
  else if (hasFrom) c.tl.from(targets, { ...from, ...vars }, c.at);
  else c.tl.to(targets, { ...to, ...vars }, c.at);
}

const clean = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined));

function warnOnce(c, message) {
  c.warn?.(`${c.node.layer.name}: ${message}`);
}
