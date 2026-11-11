// MudTail Animator Studio: the Inspector. Four tabs:
//   Design    the selected layer's props in the current view (overrides marked, resettable), alignment, layer actions
//   Animate   the layer's clips, presets, and the selected clip: timing, ease, views, from / to values, stagger, plugin options
//   Interact  click / hover actions and draggable (with inertia) for the player
//   Scene     settings, playback (timeline or slides, trigger, scroll), views, labels

import {
  findLayer, isOverridden, resetOverrides, setLayerProps, groupLayers, moveLayer, createClip, uid, sortedLabels, baseView,
  childrenOf, LAYER_KINDS,
} from '../scene.js';
import { SHAPES } from '../shapes.js';
import { CANVAS_EFFECTS, CANVAS_PARAMS } from '../canvas-effects.js';
import { EFFECTS, TWEEN_PROPS, effectFits, effectGroups, withDefaults } from '../effects.js';
import { presetGroups, clipFromPreset } from '../presets.js';
import { h, row, control, section, iconButton, button, esc, formatTime } from './dom.js';
import { easeEditor } from './ease-editor.js';
import { ICON_NAMES } from './library.js';

const FONTS = [
  ['Inter, system-ui, sans-serif', 'Inter / system'], ['Georgia, "Times New Roman", serif', 'Serif'], ['"Playfair Display", Georgia, serif', 'Display serif'],
  ['ui-monospace, "Cascadia Code", Consolas, monospace', 'Monospace'], ['"Comic Sans MS", "Chalkboard SE", system-ui, sans-serif', 'Comic'],
  ['Impact, "Arial Black", sans-serif', 'Impact'], ['"Segoe UI", Tahoma, sans-serif', 'Segoe UI'], ['"Noto Kufi Arabic", "Segoe UI", Tahoma, sans-serif', 'Arabic (Kufi)'],
  ['"Noto Naskh Arabic", "Traditional Arabic", serif', 'Arabic (Naskh)'],
];
const BLEND = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];

const F = (key, label, type = 'number', extra = {}) => ({ key, label, type, ...extra });

const GEOMETRY = [F('x', 'X'), F('y', 'Y'), F('width', 'Width', 'number', { min: 1 }), F('height', 'Height', 'number', { min: 1 }),
  F('rotation', 'Rotation °'), F('opacity', 'Opacity', 'number', { min: 0, max: 1, step: 0.05 }), F('scaleX', 'Scale X', 'number', { step: 0.05 }), F('scaleY', 'Scale Y', 'number', { step: 0.05 }),
  F('skewX', 'Skew X °'), F('originX', 'Origin X %', 'number', { step: 5 }), F('originY', 'Origin Y %', 'number', { step: 5 }),
  F('responsive', 'In other views', 'select', { options: [['auto', 'Auto (stretch full-stage layers)'], ['stretch', 'Stretch to fill'], ['scale', 'Scale, keep centre'], ['fixed', 'Keep pixels']] })];

const LOOK = [F('background', 'Background', 'color'), F('radius', 'Corner radius', 'number', { min: 0 }), F('shadow', 'Box shadow', 'text', { placeholder: '0 20px 40px rgba(0,0,0,.3)' }),
  F('blur', 'Blur px', 'number', { min: 0, step: 0.5 }), F('blendMode', 'Blend mode', 'select', { options: BLEND }), F('overflow', 'Overflow', 'select', { options: ['visible', 'hidden'] }),
  F('cursor', 'Cursor', 'select', { options: [['', 'default'], ['pointer', 'pointer'], ['grab', 'grab'], ['crosshair', 'crosshair']] }), F('hidden', 'Hidden in this view', 'checkbox')];

function kindFields(kind, S) {
  const assets = (k) => [['', '—'], ...S.scene.assets.filter((a) => a.kind === k).map((a) => [a.id, a.name])];
  switch (kind) {
    case 'shape': return [F('shape', 'Shape', 'select', { options: SHAPES }), F('fill', 'Fill', 'color'), F('fill2', 'Gradient to', 'color'), F('gradientAngle', 'Gradient angle °'),
      F('stroke', 'Stroke', 'color'), F('strokeWidth', 'Stroke width', 'number', { min: 0, step: 0.5 }), F('corner', 'Corner (rect)', 'number', { min: 0 }),
      F('points', 'Points (polygon / star / blob)', 'number', { min: 3, max: 60, step: 1 }), F('innerRadius', 'Inner radius (star / burst)', 'number', { min: 0.05, max: 1, step: 0.05 }),
      F('seed', 'Blob seed', 'number', { min: 1, step: 1 }), F('d', 'Custom path (0–100 box)', 'textarea')];
    case 'text': return [F('text', 'Text', 'textarea'), F('fontFamily', 'Font', 'select', { options: FONTS }), F('fontSize', 'Size', 'number', { min: 1 }),
      F('fontWeight', 'Weight', 'select', { options: ['100', '200', '300', '400', '500', '600', '700', '800', '900'] }), F('color', 'Colour', 'color'),
      F('align', 'Align', 'select', { options: ['left', 'center', 'right', 'justify', 'start', 'end'] }), F('lineHeight', 'Line height', 'number', { step: 0.05 }),
      F('letterSpacing', 'Letter spacing', 'number', { step: 0.5 }), F('italic', 'Italic', 'checkbox'), F('transform', 'Case', 'select', { options: [['', 'as typed'], ['uppercase', 'UPPER'], ['lowercase', 'lower'], ['capitalize', 'Title']] }),
      F('gradient', 'Gradient fill (CSS)', 'text', { placeholder: 'linear-gradient(90deg,#f0f,#0ff)' }), F('textShadow', 'Text shadow', 'text', { placeholder: '0 4px 20px rgba(0,0,0,.5)' })];
    case 'image': return [F('assetId', 'Asset', 'select', { options: assets('image') }), F('src', 'Or URL', 'text'), F('fit', 'Fit', 'select', { options: ['cover', 'contain', 'fill', 'none', 'scale-down'] }), F('alt', 'Alt text', 'text')];
    case 'svg': return [F('assetId', 'Asset', 'select', { options: assets('svg') }), F('svg', 'Or SVG markup', 'textarea'), F('fill', 'Recolour fill', 'color'), F('stroke', 'Recolour stroke', 'color')];
    case 'icon': return [F('icon', 'Icon', 'select', { options: ICON_NAMES.filter((n) => S.deps.hasIcon?.(n) ?? true) }), F('color', 'Colour', 'color'), F('strokeWidth', 'Stroke width', 'number', { min: 0.5, step: 0.25 }), F('iconFill', 'Fill', 'color')];
    case 'video': return [F('assetId', 'Asset', 'select', { options: assets('video') }), F('src', 'Or URL', 'text'), F('poster', 'Poster URL', 'text'), F('fit', 'Fit', 'select', { options: ['cover', 'contain', 'fill'] }),
      F('autoplay', 'Autoplay in the player', 'checkbox'), F('loop', 'Loop', 'checkbox'), F('muted', 'Muted', 'checkbox')];
    case 'audio': return [F('assetId', 'Asset', 'select', { options: assets('audio') }), F('src', 'Or URL', 'text'), F('loop', 'Loop', 'checkbox'), F('volume', 'Volume', 'number', { min: 0, max: 1, step: 0.05 })];
    case 'html': return [F('html', 'HTML (scripts and on* attributes are removed)', 'textarea', { rows: 8 })];
    case 'canvas': return [F('effect', 'Effect', 'select', { options: CANVAS_EFFECTS }), F('count', 'Count', 'number', { min: 0, step: 1 }), F('size', 'Size', 'number', { min: 0.5, step: 0.5 }),
      F('speed', 'Speed', 'number', { step: 0.1 }), F('spread', 'Spread', 'number', { step: 0.1 }), F('color', 'Colour', 'color'), F('color2', 'Colour 2', 'color'), F('opacity2', 'Effect opacity', 'number', { min: 0, max: 1, step: 0.05 })];
    default: return [];
  }
}

// which param fields show, by the value of another param
const SHOW_WHEN = {
  morph: { shape: (p) => (p.into ?? 'shape') === 'shape', points: (p) => (p.into ?? 'shape') === 'shape', innerRadius: (p) => (p.into ?? 'shape') === 'shape', target: (p) => p.into === 'layer', d: (p) => p.into === 'path' },
  motionPath: { preset: (p) => (p.source ?? 'preset') === 'preset', width: (p) => (p.source ?? 'preset') === 'preset', height: (p) => (p.source ?? 'preset') === 'preset', points: (p) => p.source === 'points', curviness: (p) => p.source === 'points', target: (p) => p.source === 'layer', d: (p) => p.source === 'path', rotateOffset: (p) => !!p.autoRotate },
  scramble: { customChars: (p) => p.chars === 'custom' },
  tween: { selector: (p) => p.targets === 'selector' },
  set: { selector: (p) => p.targets === 'selector' },
  draw: { selector: (p) => p.targets === 'selector' },
  media: { time: (p) => p.action === 'seek' },
};

const ACTIONS = [['play', 'Play'], ['pause', 'Pause'], ['toggle', 'Play / pause'], ['restart', 'Restart'], ['reverse', 'Reverse'], ['seek', 'Jump to label / time'],
  ['playFrom', 'Play from label / time'], ['next', 'Next slide'], ['prev', 'Previous slide'], ['animate', 'Animate this layer'], ['url', 'Open a link'], ['scrollTo', 'Scroll the page to'], ['emit', 'Raise an event (Blazor / JS)']];

export function createInspector(S, mount) {
  const { T, icon } = S;
  let tab = 'scene';
  let viewOnlyValues = false;
  let ease = null;
  const tabs = h('div.mud-anim-tabs', { role: 'tablist' });
  const body = h('div.mud-anim-inspector');
  mount.append(tabs, body);

  function renderTabs() {
    const has = !!S.selectedLayer || S.selection.layers.length > 1;
    const list = [['design', T('ins.design', 'Design'), 'sliders'], ['animate', T('ins.animate', 'Animate'), 'anim-tween'], ['interact', T('ins.interact', 'Interact'), 'anim-interact'], ['scene', T('ins.scene', 'Scene'), 'anim-template']];
    tabs.replaceChildren(...list.map(([id, label, ic]) => h('button.mud-anim-tab', {
      type: 'button', role: 'tab', 'aria-selected': String(tab === id), disabled: id !== 'scene' && !has,
      onclick: () => { tab = id; render(); }, html: `${icon(ic, 15)}<span>${esc(label)}</span>`,
    })));
  }

  function render() {
    ease?.dispose(); ease = null;
    const has = !!S.selectedLayer || S.selection.layers.length > 1;
    if (!has && tab !== 'scene') tab = 'scene';
    renderTabs();
    const scroll = body.scrollTop;
    if (tab === 'scene') body.replaceChildren(sceneTab());
    else if (S.selection.layers.length > 1) body.replaceChildren(multiTab());
    else if (tab === 'design') body.replaceChildren(designTab(S.selectedLayer));
    else if (tab === 'animate') body.replaceChildren(animateTab(S.selectedLayer));
    else body.replaceChildren(interactTab(S.selectedLayer));
    body.scrollTop = scroll;
  }

  // ───── Design ─────
  function field(layer, f, props) {
    const over = !S.isBaseView && isOverridden(layer, S.viewId, f.key);
    const ctl = control(f, props[f.key], (v, { final }) => {
      const value = f.type === 'select' && f.key === 'fontWeight' ? +v : v;
      S.setProps(layer.id, { [f.key]: value }, { merge: `${layer.id}:${S.viewId}:${f.key}`, source: final && ['shape', 'assetId', 'effect'].includes(f.key) ? null : 'inspector' });
    });
    const reset = over ? iconButton(icon('anim-reset', 14), T('ins.resetField', 'Back to the auto layout'), (e) => { e.preventDefault(); S.commit(T('history.resetOverride', 'Reset override'), () => resetOverrides(layer, S.viewId, [f.key])); render(); }, { cls: 'mud-anim-reset' }) : null;
    return row(T(`prop.${f.key}`, f.label), ctl, { override: over, trailing: reset, wide: f.type === 'textarea' });
  }

  function designTab(layer) {
    if (!layer) return h('div');
    const props = S.propsOf(layer);
    const head = h('div.mud-anim-ins-head');
    const name = h('input.mud-anim-input.mud-anim-ins-name', { value: layer.name, 'aria-label': T('ins.layerName', 'Layer name') });
    name.addEventListener('change', () => S.commit(T('history.renameLayer', 'Rename layer'), () => { layer.name = name.value.trim() || layer.name; }));
    head.append(
      h('span.mud-anim-badge', {}, T(`kind.${layer.kind}`, layer.kind)), name,
      h('div.mud-anim-ins-actions', {}, [
        iconButton(icon('arrowUp', 15), T('ins.up', 'Bring forward'), () => S.commit(T('history.reorder', 'Reorder'), (s) => moveLayer(s, layer.id, 1))),
        iconButton(icon('arrowDown', 15), T('ins.down', 'Send backward'), () => S.commit(T('history.reorder', 'Reorder'), (s) => moveLayer(s, layer.id, -1))),
        iconButton(icon('copy', 15), T('ins.duplicate', 'Duplicate (Ctrl+D)'), () => S.duplicateSelection()),
        layer.kind === 'group' ? iconButton(icon('anim-ungroup', 15), T('ins.ungroup', 'Ungroup'), () => ungroup(layer)) : null,
        iconButton(icon('anim-trash', 15), T('ins.delete', 'Delete (Del)'), () => S.deleteSelection()),
      ]),
    );
    const out = h('div', {}, [head]);
    if (!S.isBaseView) {
      const n = Object.keys(layer.views?.[S.viewId] ?? {}).length;
      out.append(h('div.mud-anim-note.is-override', {}, [
        h('span', {}, n ? T('ins.overrides', '{n} value(s) set for {view} only.', { n, view: S.view.label }) : T('ins.autoLayout', '{view} follows the base design (scaled). Edits here apply to {view} only.', { view: S.view.label })),
        n ? button(T('ins.resetAll', 'Reset {view}', { view: S.view.label }), () => { S.commit(T('history.resetOverride', 'Reset override'), () => resetOverrides(layer, S.viewId)); render(); }, { variant: 'text' }) : null,
      ]));
    }
    out.append(section(T('ins.align', 'Align to stage'), alignBar([layer])));
    out.append(section(T('ins.geometry', 'Position & transform'), h('div.mud-anim-grid2', {}, GEOMETRY.map((f) => field(layer, f, props)))));
    const kf = kindFields(layer.kind, S);
    if (kf.length) out.append(section(T(`kind.${layer.kind}`, layer.kind), h('div.mud-anim-grid2', {}, kf.map((f) => field(layer, f, props)))));
    out.append(section(T('ins.look', 'Look'), h('div.mud-anim-grid2', {}, LOOK.map((f) => field(layer, f, props))), { open: false }));
    return out;
  }

  function ungroup(group) {
    S.commit(T('history.ungroup', 'Ungroup'), (s) => {
      const gp = group.props;
      for (const child of childrenOf(s, group.id)) {
        child.parentId = group.parentId;
        child.props.x += gp.x; child.props.y += gp.y;
      }
      s.layers = s.layers.filter((l) => l.id !== group.id);
    });
    S.select([]);
  }

  function alignBar(layers) {
    const W = S.view.width; const H = S.view.height;
    const apply = (label, fn) => S.commit(label, () => { for (const l of layers) { if (l.locked) continue; const p = S.propsOf(l); setLayerProps(S.scene, l, S.viewId, fn(p)); } });
    const btn = (ic, label, fn) => iconButton(ic, label, () => apply(label, fn));
    const svg = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${d}</svg>`;
    return h('div.mud-anim-align', {}, [
      btn(svg('<path d="M4 3v18"/><rect x="7" y="6" width="12" height="4" rx="1"/><rect x="7" y="14" width="8" height="4" rx="1"/>'), T('ins.alignLeft', 'Align left'), () => ({ x: 0 })),
      btn(svg('<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="7" y="14" width="10" height="4" rx="1"/>'), T('ins.alignCenter', 'Centre horizontally'), (p) => ({ x: Math.round((W - p.width) / 2) })),
      btn(svg('<path d="M20 3v18"/><rect x="5" y="6" width="12" height="4" rx="1"/><rect x="9" y="14" width="8" height="4" rx="1"/>'), T('ins.alignRight', 'Align right'), (p) => ({ x: W - p.width })),
      btn(svg('<path d="M3 4h18"/><rect x="6" y="7" width="4" height="12" rx="1"/><rect x="14" y="7" width="4" height="8" rx="1"/>'), T('ins.alignTop', 'Align top'), () => ({ y: 0 })),
      btn(svg('<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="7" width="4" height="10" rx="1"/>'), T('ins.alignMiddle', 'Centre vertically'), (p) => ({ y: Math.round((H - p.height) / 2) })),
      btn(svg('<path d="M3 20h18"/><rect x="6" y="5" width="4" height="12" rx="1"/><rect x="14" y="9" width="4" height="8" rx="1"/>'), T('ins.alignBottom', 'Align bottom'), (p) => ({ y: H - p.height })),
      btn(svg('<rect x="3" y="3" width="18" height="18" rx="2"/>'), T('ins.fill', 'Fill the stage'), () => ({ x: 0, y: 0, width: W, height: H })),
    ]);
  }

  function multiTab() {
    const layers = S.selection.layers.map((id) => findLayer(S.scene, id)).filter(Boolean);
    const sameParent = layers.every((l) => l.parentId === layers[0].parentId);
    return h('div', {}, [
      h('p.mud-anim-note', {}, T('ins.multi', '{n} layers selected. Drag them together on the Stage.', { n: layers.length })),
      section(T('ins.align', 'Align to stage'), alignBar(layers)),
      h('div.mud-anim-row', {}, [
        button(T('ins.group', 'Group'), () => { if (!sameParent) return S.toast(T('toast.groupParent', 'Pick layers from the same group to group them.'), 'warning'); let g; S.commit(T('history.group', 'Group'), (s) => { g = groupLayers(s, layers.map((l) => l.id)); }); S.select([g.id]); }, { icon: icon('anim-group', 16) }),
        button(T('ins.delete', 'Delete'), () => S.deleteSelection(), { icon: icon('anim-trash', 16), variant: 'danger' }),
      ]),
    ]);
  }

  // ───── Animate ─────
  function animateTab(layer) {
    if (!layer) return h('div');
    const out = h('div');
    const clips = [...layer.clips].sort((a, b) => a.start - b.start);
    const list = h('div.mud-anim-cliplist', {}, clips.length ? clips.map((c) => {
      const e = EFFECTS[c.type];
      return h(`button.mud-anim-clipitem${S.selection.clip === c.id ? '.is-selected' : ''}${c.disabled ? '.is-disabled' : ''}`, { type: 'button', onclick: () => S.select([layer.id], c.id) }, [
        h('span.mud-anim-clipitem__icon', { html: icon(e?.icon ?? 'anim-tween', 15) }),
        h('span.mud-anim-clipitem__name', {}, c.name || e?.label || c.type),
        h('span.mud-anim-clipitem__time', {}, `${formatTime(c.start)} · ${c.duration}s${c.repeat ? ` ×${c.repeat < 0 ? '∞' : c.repeat + 1}` : ''}`),
      ]);
    }) : h('p.mud-anim-note', {}, T('ins.noClips', 'No animations yet: pick a preset or add one.')));
    out.append(section(T('ins.clips', 'Animations on {name}', { name: layer.name }), list));

    // add by type
    const typeSel = h('select.mud-anim-input', {}, effectGroups().map(([group, items]) => h('optgroup', { label: group }, items.filter(([type]) => effectFits(type, layer.kind)).map(([type, e]) => h('option', { value: type }, `${e.label} · ${e.plugin}`)))));
    const add = button(T('ins.add', 'Add at playhead'), () => {
      const type = typeSel.value;
      const clip = createClip(type, { start: Math.round(S.time * 20) / 20, duration: 1, name: EFFECTS[type].label, params: withDefaults(type), from: type === 'tween' ? { opacity: 0, y: 40 } : {} });
      S.commit(T('history.addClip', 'Add animation'), () => layer.clips.push(clip));
      S.select([layer.id], clip.id);
    }, { icon: icon('plus', 16), variant: 'primary' });
    out.append(section(T('ins.addClip', 'Add an animation'), h('div.mud-anim-row', {}, [typeSel, add]), { open: !S.selection.clip }));

    // presets
    const groups = presetGroups(layer.kind);
    out.append(section(T('ins.presets', 'Presets (at the playhead)'), h('div.mud-anim-presets', {}, groups.map(([group, presets]) => h('div.mud-anim-presets__group', {}, [
      h('h4', {}, group),
      h('div.mud-anim-presets__list', {}, presets.map((p) => h('button.mud-anim-chipbtn', {
        type: 'button', title: `${EFFECTS[p.type].label} · ${EFFECTS[p.type].plugin}`,
        onclick: () => {
          const clip = clipFromPreset(p.id, layer, S.view, Math.round(S.time * 20) / 20);
          S.commit(T('history.preset', 'Add {name}', { name: p.label }), () => layer.clips.push(clip));
          S.select([layer.id], clip.id);
        },
      }, p.label))),
    ]))), { open: !S.selection.clip }));

    const found = S.selectedClip;
    if (found && found.layer.id === layer.id) out.prepend(clipEditor(layer, found.clip));
    return out;
  }

  function clipEditor(layer, clip) {
    const effect = EFFECTS[clip.type];
    const merge = (k) => `${clip.id}:${k}`;
    const set = (changes, { final = true, rerender = false, key = 'x' } = {}) => {
      S.commit(T('history.editClip', 'Edit animation'), () => Object.assign(clip, changes), { merge: merge(key), source: 'inspector' });
      if (rerender && final) render();
    };
    const box = h('div.mud-anim-clipedit');
    const title = h('div.mud-anim-ins-head', {}, [
      h('span.mud-anim-badge', { title: effect?.description ?? '' }, effect?.plugin ?? clip.type),
      (() => { const i = h('input.mud-anim-input.mud-anim-ins-name', { value: clip.name || '', placeholder: effect?.label ?? clip.type, 'aria-label': T('ins.clipName', 'Animation name') }); i.addEventListener('change', () => set({ name: i.value }, { key: 'name' })); return i; })(),
      h('div.mud-anim-ins-actions', {}, [
        iconButton(icon('anim-play', 15), T('ins.playClip', 'Play from this animation'), () => { S.seek(clip.start); S.play(); }),
        iconButton(icon(clip.disabled ? 'eyeOff' : 'eye', 15), clip.disabled ? T('ins.enable', 'Enable') : T('ins.disable', 'Disable'), () => { set({ disabled: !clip.disabled }, { key: 'disabled' }); render(); }),
        iconButton(icon('copy', 15), T('ins.duplicateClip', 'Duplicate animation'), () => { const c = JSON.parse(JSON.stringify(clip)); c.id = uid('clip'); c.start = Math.round((clip.start + clip.duration) * 100) / 100; S.commit(T('history.duplicate', 'Duplicate'), () => layer.clips.push(c)); S.select([layer.id], c.id); }),
        iconButton(icon('anim-trash', 15), T('ins.deleteClip', 'Delete animation'), () => S.deleteSelection()),
      ]),
    ]);
    box.append(title);
    if (effect?.description) box.append(h('p.mud-anim-note', {}, effect.description));

    // type + timing
    const typeSel = control({ type: 'select', options: Object.entries(EFFECTS).filter(([t]) => effectFits(t, layer.kind)).map(([t, e]) => [t, `${e.label} · ${e.plugin}`]) }, clip.type, (v) => {
      S.commit(T('history.clipType', 'Change animation type'), () => { clip.type = v; clip.params = withDefaults(v, {}); if (!EFFECTS[v].vars) { clip.from = {}; clip.to = {}; } });
      render();
    });
    const infinite = clip.repeat < 0;
    const timing = h('div.mud-anim-grid2', {}, [
      row(T('ins.type', 'Type'), typeSel, { wide: true }),
      row(T('ins.start', 'Start (s)'), control({ type: 'number', min: 0, step: 0.05 }, clip.start, (v, o) => set({ start: Math.max(0, v) }, { ...o, key: 'start' }))),
      effect?.instant ? null : row(T('ins.duration', 'Duration (s)'), control({ type: 'number', min: 0, step: 0.05 }, clip.duration, (v, o) => set({ duration: Math.max(0, v) }, { ...o, key: 'duration' }))),
      effect?.instant ? null : row(T('ins.repeat', 'Repeat'), control({ type: 'number', min: -1, step: 1 }, infinite ? -1 : clip.repeat, (v, o) => set({ repeat: Math.round(v) }, { ...o, key: 'repeat' })), { hint: T('ins.repeatHint', '-1 repeats forever') }),
      effect?.instant ? null : row(T('ins.forever', 'Repeat forever'), control({ type: 'checkbox' }, infinite, (v) => { set({ repeat: v ? -1 : 0 }, { key: 'repeat' }); render(); })),
      effect?.instant ? null : row(T('ins.yoyo', 'Yoyo (back and forth)'), control({ type: 'checkbox' }, clip.yoyo, (v) => set({ yoyo: v }, { key: 'yoyo' }))),
      effect?.instant ? null : row(T('ins.repeatDelay', 'Repeat delay (s)'), control({ type: 'number', min: 0, step: 0.05 }, clip.repeatDelay, (v, o) => set({ repeatDelay: Math.max(0, v) }, { ...o, key: 'repeatDelay' }))),
    ]);
    box.append(section(T('ins.timing', 'Timing'), timing));

    // ease
    if (!effect?.noEase && !effect?.instant) {
      ease = easeEditor(S, clip.ease, (spec, o) => set({ ease: spec }, { ...o, key: 'ease' }));
      box.append(section(T('ins.ease', 'Ease'), ease.el));
    }

    // params
    if (effect?.fields?.length) {
      const p = { ...withDefaults(clip.type), ...clip.params };
      const showWhen = SHOW_WHEN[clip.type] ?? {};
      const grid = h('div.mud-anim-grid2');
      for (const f of effect.fields) {
        if (showWhen[f.key] && !showWhen[f.key](p)) continue;
        if (f.type === 'points') {
          const ta = control({ type: 'textarea' }, JSON.stringify(p.points), (v, o) => { if (!o.final) return; try { const pts = JSON.parse(v); if (Array.isArray(pts)) setParam('points', pts, true); } catch { S.toast(T('toast.points', 'Points must be JSON like [[0,0],[100,-50]]'), 'warning'); } });
          grid.append(h('p.mud-anim-note.mud-anim-field--wide', {}, T('ins.pointsHint', 'Drag the points on the Stage. Double-click the path to add a point, a point to remove it.')), row(T('ins.points', 'Points [x, y] from the layer centre'), ta, { wide: true }));
          continue;
        }
        const ctl = control(f, p[f.key], (v, o) => setParam(f.key, v, o.final && ['into', 'source', 'targets', 'chars', 'autoRotate', 'action'].includes(f.key)), { layers: S.layerOptions(layer.id) });
        grid.append(row(T(`fx.${clip.type}.${f.key}`, f.label), ctl, { wide: f.type === 'textarea' }));
      }
      box.append(section(T('ins.options', '{plugin} options', { plugin: effect.plugin }), grid));
    }
    function setParam(key, value, rerender) {
      S.commit(T('history.editClip', 'Edit animation'), () => { clip.params = { ...clip.params, [key]: value }; }, { merge: merge(`p.${key}`), source: 'inspector' });
      if (rerender) render();
    }

    // values
    if (effect?.vars) box.append(varsEditor(layer, clip, effect));

    // stagger
    const canStagger = effect?.stagger || (clip.type === 'tween' && (clip.params?.targets ?? 'self') !== 'self') || clip.type === 'physics2D' || clip.type === 'physicsProps';
    if (canStagger) {
      const st = clip.stagger ?? {};
      const setSt = (k, v, o) => S.commit(T('history.editClip', 'Edit animation'), () => { clip.stagger = { ...(clip.stagger ?? {}), [k]: v }; }, { merge: merge(`s.${k}`), source: 'inspector' });
      box.append(section(T('ins.stagger', 'Stagger'), h('div.mud-anim-grid2', {}, [
        row(T('ins.each', 'Each (s)'), control({ type: 'number', min: 0, step: 0.01 }, st.each ?? '', (v, o) => setSt('each', v, o))),
        row(T('ins.amount', 'Or total (s)'), control({ type: 'number', min: 0, step: 0.05 }, st.amount ?? '', (v, o) => setSt('amount', v, o))),
        row(T('ins.from', 'From'), control({ type: 'select', options: [['', 'start'], ['center', 'centre'], ['end', 'end'], ['edges', 'edges'], ['random', 'random']] }, st.from ?? '', (v, o) => setSt('from', v, o))),
        row(T('ins.grid', 'Grid'), control({ type: 'select', options: [['', 'none'], ['auto', 'auto (from layout)']] }, st.grid ?? '', (v, o) => setSt('grid', v, o))),
        row(T('ins.axis', 'Grid axis'), control({ type: 'select', options: [['', 'both'], ['x', 'x'], ['y', 'y']] }, st.axis ?? '', (v, o) => setSt('axis', v, o))),
        row(T('ins.staggerEase', 'Stagger ease'), control({ type: 'text', placeholder: 'power1.in' }, st.ease ?? '', (v, o) => setSt('ease', v, o))),
      ]), { open: !!(st.each || st.amount) }));
    }

    // views
    const views = h('div.mud-anim-row.mud-anim-wrap-row', {}, S.scene.views.map((v) => {
      const cb = control({ type: 'checkbox' }, !clip.views || clip.views.includes(v.id), (checked) => {
        S.commit(T('history.clipViews', 'Animation views'), () => {
          const all = S.scene.views.map((x) => x.id);
          const cur = new Set(clip.views ?? all);
          if (checked) cur.add(v.id); else cur.delete(v.id);
          clip.views = cur.size === all.length ? null : [...cur];
        });
        render();
      });
      return h('label.mud-anim-inline', {}, [cb, h('span', {}, v.label)]);
    }));
    box.append(section(T('ins.plays', 'Plays in'), views, { open: !!clip.views }));
    return box;
  }

  function varsEditor(layer, clip, effect) {
    const onlyTo = effect.vars === 'to';
    const keys = effect.varKeys ?? null;
    const forView = !S.isBaseView && viewOnlyValues;
    const src = forView ? (clip.overrides?.[S.viewId] ?? {}) : clip;
    const from = { ...(src.from ?? {}) }; const to = { ...(src.to ?? {}) };
    const all = [...new Set([...Object.keys(from), ...Object.keys(to)])];
    const write = (nextFrom, nextTo, o = {}) => {
      S.commit(T('history.editValues', 'Edit values'), () => {
        if (forView) {
          clip.overrides = { ...(clip.overrides ?? {}) };
          clip.overrides[S.viewId] = { ...(clip.overrides[S.viewId] ?? {}), from: nextFrom, to: nextTo };
        } else { clip.from = nextFrom; clip.to = nextTo; }
      }, { merge: o.merge ?? null, source: o.live ? 'inspector' : null });
    };
    const propInfo = (k) => TWEEN_PROPS.find((p) => p[0] === k);
    const parse = (k, v) => {
      if (v === '' || v === null || v === undefined) return undefined;
      const info = propInfo(k);
      if (info && info[3] !== 'color' && info[4] !== null && Number.isFinite(+v)) return +v;
      if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return +v;
      if (k === 'keyframes') { try { return JSON.parse(v); } catch { return v; } }
      return v;
    };
    const show = (v) => (v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
    const table = h('div.mud-anim-vars');
    table.append(h('div.mud-anim-vars__head', {}, [h('span', {}, T('ins.property', 'Property')), onlyTo ? null : h('span', {}, T('ins.fromValue', 'From')), h('span', {}, onlyTo ? T('ins.value', 'Value') : T('ins.toValue', 'To')), h('span')]));
    for (const k of all) {
      const info = propInfo(k);
      const cell = (side, value) => {
        const isColor = info?.[3] === 'color' || (keys && /color/.test(k));
        if (isColor) return control({ type: 'color' }, value ?? '', (v, o) => { const f = { ...from }; const t2 = { ...to }; (side === 'from' ? f : t2)[k] = v || undefined; if (!v) delete (side === 'from' ? f : t2)[k]; write(f, t2, { merge: `${clip.id}:${side}:${k}`, live: !o.final }); });
        const input = h('input.mud-anim-input', { type: 'text', value: show(value), placeholder: side === 'from' ? T('ins.current', 'current') : '—' });
        input.addEventListener('change', () => { const f = { ...from }; const t2 = { ...to }; const target = side === 'from' ? f : t2; const val = parse(k, input.value); if (val === undefined) delete target[k]; else target[k] = val; write(f, t2); render(); });
        return input;
      };
      table.append(h('div.mud-anim-vars__row', {}, [
        h('span.mud-anim-vars__key', { title: info ? `${info[1]}${info[3] && info[3] !== 'color' ? ` (${info[3]})` : ''}` : k }, info ? info[1] : k),
        onlyTo ? null : cell('from', from[k]),
        cell('to', to[k]),
        iconButton(icon('close', 14), T('ins.removeProp', 'Remove'), () => { const f = { ...from }; const t2 = { ...to }; delete f[k]; delete t2[k]; write(f, t2); render(); }),
      ]));
    }
    // add a property
    const available = (keys ? keys.map((k) => [k, k]) : TWEEN_PROPS.map((p) => [p[0], `${p[2]} · ${p[1]}`])).filter(([k]) => !all.includes(k));
    const pick = h('select.mud-anim-input', {}, [h('option', { value: '' }, T('ins.addProp', '+ Add a property…')), ...available.map(([k, l]) => h('option', { value: k }, l)), h('option', { value: '__custom' }, T('ins.customProp', 'Other (type its name)…'))]);
    pick.addEventListener('change', () => {
      let k = pick.value;
      if (!k) return;
      if (k === '__custom') { k = prompt(T('ins.customPropName', 'Property name (any GSAP-tweenable property, CSS variable --name, or keyframes)'), '') ?? ''; if (!k.trim()) return; k = k.trim(); }
      const info = propInfo(k);
      const def = info ? info[5] : 0;
      const f = { ...from }; const t2 = { ...to };
      if (onlyTo) t2[k] = def; else if (Object.keys(t2).length && !Object.keys(f).length) t2[k] = def; else f[k] = def;
      write(f, t2);
      render();
    });
    table.append(pick);
    const note = onlyTo ? '' : T('ins.varsHint', 'Only "From": animates from those values to the layer\'s design. Only "To": from the design to them. Both: from → to.');
    const viewToggle = S.isBaseView ? null : h('label.mud-anim-inline', {}, [control({ type: 'checkbox' }, viewOnlyValues, (v) => { viewOnlyValues = v; render(); }), h('span', {}, T('ins.viewValues', 'Values for {view} only', { view: S.view.label }))]);
    return section(onlyTo ? T('ins.values', 'Values') : T('ins.fromTo', 'From → To'), h('div', {}, [viewToggle, table, note ? h('p.mud-anim-note', {}, note) : null]));
  }

  // ───── Interact ─────
  function interactTab(layer) {
    if (!layer) return h('div');
    const out = h('div');
    out.append(h('p.mud-anim-note', {}, T('ins.interactHint', 'Interactions run in Preview and wherever the scene plays (MudTail sites, Blazor).')));
    const labels = sortedLabels(S.scene).map((l) => [l.name, l.name]);
    const list = h('div.mud-anim-interactions');
    (layer.interactions ?? []).forEach((it, i) => {
      const upd = (changes, rerender = false) => { S.commit(T('history.interaction', 'Edit interaction'), () => { layer.interactions[i] = { ...layer.interactions[i], ...changes }; }, { merge: `${layer.id}:it:${i}`, source: 'inspector' }); if (rerender) render(); };
      const card = h('div.mud-anim-card', {}, [
        h('div.mud-anim-grid2', {}, [
          row(T('ins.on', 'When'), control({ type: 'select', options: [['click', 'Clicked / tapped'], ['hover', 'Pointer enters'], ['leave', 'Pointer leaves'], ['dblclick', 'Double-clicked']] }, it.on, (v) => upd({ on: v }))),
          row(T('ins.do', 'Do'), control({ type: 'select', options: ACTIONS }, it.action, (v) => upd({ action: v }, true))),
          ['seek', 'playFrom'].includes(it.action) ? row(T('ins.target', 'Label or seconds'), control({ type: 'select', options: [['', '—'], ...labels, ...[0, 1, 2, 5].map((n) => [String(n), `${n}s`])] }, it.label ?? '', (v) => upd({ label: v === '' ? null : Number.isFinite(+v) ? +v : v }))) : null,
          it.action === 'animate' ? row(T('ins.toVars', 'To values (JSON)'), control({ type: 'textarea' }, JSON.stringify(it.to ?? { scale: 1.08 }), (v, o) => { if (!o.final) return; try { upd({ to: JSON.parse(v) }); } catch { S.toast(T('toast.json', 'Not valid JSON'), 'warning'); } }), { wide: true }) : null,
          it.action === 'animate' ? row(T('ins.duration', 'Duration (s)'), control({ type: 'number', min: 0, step: 0.05 }, it.duration ?? 0.35, (v) => upd({ duration: v }))) : null,
          it.action === 'url' ? row(T('ins.url', 'URL'), control({ type: 'text' }, it.url ?? '', (v) => upd({ url: v })), { wide: true }) : null,
          it.action === 'url' ? row(T('ins.target', 'Open in'), control({ type: 'select', options: [['_self', 'This tab'], ['_blank', 'New tab']] }, it.target ?? '_self', (v) => upd({ target: v }))) : null,
          it.action === 'scrollTo' ? row(T('ins.selector', 'Selector or y'), control({ type: 'text', placeholder: '#comments' }, it.selector ?? '', (v) => upd({ selector: v }))) : null,
          it.action === 'emit' ? row(T('ins.event', 'Event name'), control({ type: 'text', placeholder: 'cta' }, it.event ?? '', (v) => upd({ event: v }))) : null,
        ]),
        button(T('ins.remove', 'Remove'), () => { S.commit(T('history.interaction', 'Edit interaction'), () => layer.interactions.splice(i, 1)); render(); }, { variant: 'text', icon: icon('anim-trash', 14) }),
      ]);
      list.append(card);
    });
    out.append(section(T('ins.interactions', 'Interactions'), h('div', {}, [list, button(T('ins.addInteraction', 'Add an interaction'), () => { S.commit(T('history.interaction', 'Edit interaction'), () => { layer.interactions = [...(layer.interactions ?? []), { on: 'click', action: 'toggle' }]; }); render(); }, { icon: icon('plus', 16) })])));

    const d = layer.draggable;
    const setD = (changes) => { S.commit(T('history.draggable', 'Draggable'), () => { layer.draggable = changes === null ? null : { ...(layer.draggable ?? { type: 'x,y', inertia: true, bounds: true }), ...changes }; }, { source: 'inspector' }); render(); };
    out.append(section(T('ins.draggable', 'Draggable (Draggable + InertiaPlugin)'), h('div.mud-anim-grid2', {}, [
      row(T('ins.dragOn', 'Viewers can drag it'), control({ type: 'checkbox' }, !!d, (v) => setD(v ? {} : null))),
      d ? row(T('ins.dragType', 'Drag'), control({ type: 'select', options: [['x,y', 'Freely'], ['x', 'Horizontally'], ['y', 'Vertically'], ['rotation', 'Spin (rotation)']] }, d.type, (v) => setD({ type: v }))) : null,
      d ? row(T('ins.inertia', 'Throw with inertia'), control({ type: 'checkbox' }, d.inertia !== false, (v) => setD({ inertia: v }))) : null,
      d ? row(T('ins.bounds', 'Keep inside the stage'), control({ type: 'checkbox' }, d.bounds !== false, (v) => setD({ bounds: v }))) : null,
      d ? row(T('ins.resistance', 'Edge resistance'), control({ type: 'number', min: 0, max: 1, step: 0.05 }, d.edgeResistance ?? 0.65, (v) => setD({ edgeResistance: v }))) : null,
    ])));
    return out;
  }

  // ───── Scene ─────
  function sceneTab() {
    const s = S.scene;
    const st = s.settings;
    const setS = (changes, o = {}) => S.commit(T('history.settings', 'Scene settings'), () => Object.assign(s.settings, changes), { merge: `settings:${Object.keys(changes)[0]}`, source: 'inspector' });
    const setScroll = (changes) => S.commit(T('history.settings', 'Scene settings'), () => { s.settings.scroll = { ...s.settings.scroll, ...changes }; }, { source: 'inspector' });
    const out = h('div');
    const nameInput = control({ type: 'text' }, s.name, (v, o) => { if (o.final) S.commit(T('history.rename', 'Rename scene'), () => { s.name = v.trim() || s.name; }); });
    out.append(section(T('ins.scene', 'Scene'), h('div.mud-anim-grid2', {}, [
      row(T('ins.name', 'Name'), nameInput, { wide: true }),
      row(T('ins.background', 'Background'), control({ type: 'color' }, st.background, (v) => setS({ background: v }))),
      row(T('ins.length', 'Length (s)'), control({ type: 'number', min: 0, step: 0.5 }, st.duration, (v) => setS({ duration: Math.max(0, v) })), { hint: T('ins.lengthHint', 'At least this long; the last animation can make it longer') }),
      row(T('ins.speed', 'Speed'), control({ type: 'number', min: 0.1, step: 0.1 }, st.speed, (v) => setS({ speed: v || 1 }))),
      row(T('ins.repeat', 'Repeat'), control({ type: 'number', min: -1, step: 1 }, st.repeat, (v) => setS({ repeat: Math.round(v) })), { hint: T('ins.repeatHint', '-1 repeats forever') }),
      row(T('ins.yoyo', 'Yoyo'), control({ type: 'checkbox' }, st.yoyo, (v) => setS({ yoyo: v }))),
      row(T('ins.repeatDelay', 'Repeat delay (s)'), control({ type: 'number', min: 0, step: 0.1 }, st.repeatDelay, (v) => setS({ repeatDelay: v }))),
    ])));

    out.append(section(T('ins.playback', 'Playback in the player'), h('div.mud-anim-grid2', {}, [
      row(T('ins.mode', 'Mode'), control({ type: 'select', options: [['timeline', 'Timeline (one animation)'], ['slides', 'Slideshow (labels are slides)']] }, st.mode, (v) => { setS({ mode: v }); render(); })),
      st.mode === 'slides' ? row(T('ins.slideHold', 'Auto-advance after (s, 0 = off)'), control({ type: 'number', min: 0, step: 0.5 }, st.slideHold ?? 0, (v) => setS({ slideHold: v }))) : null,
      row(T('ins.trigger', 'Starts'), control({ type: 'select', options: [['load', 'When the page loads'], ['visible', 'When scrolled into view (ScrollTrigger)'], ['scroll', 'Scrubbed by scrolling (ScrollTrigger)'], ['click', 'On click'], ['hover', 'On hover (reverses on leave)'], ['none', 'Only from code']] }, st.trigger, (v) => { setS({ trigger: v }); render(); })),
      st.trigger === 'scroll' ? row(T('ins.scrub', 'Scrub smoothing (s)'), control({ type: 'number', min: 0, step: 0.1 }, st.scroll?.scrub === true ? 0 : st.scroll?.scrub ?? 1, (v) => setScroll({ scrub: v || true }))) : null,
      st.trigger === 'scroll' ? row(T('ins.pin', 'Pin while scrubbing'), control({ type: 'checkbox' }, st.scroll?.pin, (v) => setScroll({ pin: v }))) : null,
      st.trigger === 'scroll' ? row(T('ins.scrollStart', 'Start'), control({ type: 'text' }, st.scroll?.start, (v) => setScroll({ start: v }))) : null,
      st.trigger === 'scroll' ? row(T('ins.scrollEnd', 'End'), control({ type: 'text' }, st.scroll?.end, (v) => setScroll({ end: v }))) : null,
      row(T('ins.fit', 'Fit'), control({ type: 'select', options: [['contain', 'Contain (letterbox)'], ['cover', 'Cover (crop)'], ['width', 'Fill the width']] }, st.fit, (v) => setS({ fit: v }))),
      row(T('ins.controls', 'Show controls'), control({ type: 'checkbox' }, st.controls, (v) => setS({ controls: v }))),
      row(T('ins.autoView', 'Pick the view by width'), control({ type: 'checkbox' }, st.autoView !== false, (v) => setS({ autoView: v }))),
      row(T('ins.flip', 'Animate view changes (Flip)'), control({ type: 'checkbox' }, st.flipOnViewChange !== false, (v) => setS({ flipOnViewChange: v }))),
    ])));

    // views
    const views = h('div.mud-anim-views-edit');
    s.views.forEach((v, i) => {
      const upd = (changes) => S.commit(T('history.views', 'Edit views'), () => Object.assign(s.views[i], changes), { merge: `view:${v.id}:${Object.keys(changes)[0]}`, source: 'inspector' });
      views.append(h(`div.mud-anim-card${v.id === S.viewId ? '.is-current' : ''}`, {}, [
        h('div.mud-anim-grid2', {}, [
          row(T('ins.viewLabel', 'Label'), control({ type: 'text' }, v.label, (val) => upd({ label: val }))),
          row(T('ins.minWidth', 'From width (px)'), control({ type: 'number', min: 0, step: 10 }, v.minWidth, (val) => upd({ minWidth: Math.max(0, val) }))),
          row(T('ins.width', 'Stage width'), control({ type: 'number', min: 50, step: 10 }, v.width, (val) => upd({ width: Math.max(50, val) }))),
          row(T('ins.height', 'Stage height'), control({ type: 'number', min: 50, step: 10 }, v.height, (val) => upd({ height: Math.max(50, val) }))),
        ]),
        h('div.mud-anim-row', {}, [
          i === 0 ? h('span.mud-anim-badge', {}, T('ins.baseView', 'Base design')) : null,
          button(T('ins.editView', 'Edit this view'), () => S.setView(v.id), { variant: 'text' }),
          i > 0 ? button(T('ins.removeView', 'Remove'), () => { if (confirm(T('ins.removeViewConfirm', 'Remove the view "{name}" and its overrides?', { name: v.label }))) { S.commit(T('history.views', 'Edit views'), () => { s.views.splice(i, 1); for (const l of s.layers) delete l.views?.[v.id]; }); if (S.viewId === v.id) S.setView(s.views[0].id); render(); } }, { variant: 'text' }) : null,
        ]),
      ]));
    });
    views.append(button(T('ins.addView', 'Add a view'), () => {
      const id = `view${s.views.length + 1}`;
      S.commit(T('history.views', 'Edit views'), () => s.views.push({ id, label: 'Wide', icon: 'anim-views', width: 1920, height: 600, minWidth: 1600 }));
      render();
    }, { icon: icon('plus', 16) }));
    out.append(section(T('ins.views', 'Views (responsive)'), h('div', {}, [h('p.mud-anim-note', {}, T('ins.viewsHint', 'The player picks the view with the largest "from width" that fits its container. Layers follow the base design scaled, unless you edit them in a view.')), views]), { open: false }));

    // labels
    const labels = sortedLabels(s);
    out.append(section(T('ins.labels', 'Labels'), h('div.mud-anim-labels', {}, [
      ...labels.map((l) => h('div.mud-anim-row', {}, [
        control({ type: 'text' }, l.name, (v, o) => { if (o.final) S.commit(T('history.renameLabel', 'Rename label'), () => { const x = s.labels.find((q) => q.id === l.id); if (x) x.name = v; }); }),
        control({ type: 'number', min: 0, step: 0.05 }, l.time, (v, o) => { if (o.final) S.commit(T('history.moveLabel', 'Move label'), () => { const x = s.labels.find((q) => q.id === l.id); if (x) x.time = Math.max(0, v); }); }),
        iconButton(icon('anim-play', 14), T('ins.goLabel', 'Go there'), () => S.seek(l.time)),
        iconButton(icon('anim-trash', 14), T('ins.remove', 'Remove'), () => { S.commit(T('history.deleteLabel', 'Delete label'), () => { s.labels = s.labels.filter((q) => q.id !== l.id); }); render(); }),
      ])),
      button(T('ins.addLabel', 'Add a label at the playhead'), () => { S.commit(T('history.addLabel', 'Add label'), () => s.labels.push({ id: uid('label'), name: `slide ${labels.length + 1}`, time: Math.round(S.time * 100) / 100 })); render(); }, { icon: icon('anim-flag', 16) }),
      h('p.mud-anim-note', {}, T('ins.labelsHint', 'In a slideshow each label starts a slide. Interactions can jump to labels.')),
    ]), { open: st.mode === 'slides' }));

    // stats
    const count = (k) => s.layers.filter((l) => l.kind === k).length;
    const kinds = LAYER_KINDS.filter((k) => count(k)).map((k) => `${count(k)} ${k}`).join(' · ');
    const clips = s.layers.reduce((n, l) => n + l.clips.length, 0);
    const bytes = new Blob([JSON.stringify(s)]).size;
    out.append(h('p.mud-anim-note', {}, `${kinds || T('ins.noLayers', 'no layers')} · ${clips} ${T('ins.animations', 'animations')} · ${(bytes / 1024).toFixed(1)} KB · ${T('ins.base', 'base')} ${baseView(s).width}×${baseView(s).height}`));
    return out;
  }

  const offs = [
    S.on('select', () => {
      if (S.selection.clip) tab = 'animate';
      else if (S.selectedLayer && tab === 'scene') tab = 'design';
      render();
    }),
    S.on('change', ({ source }) => { if (source !== 'inspector') render(); }),
    S.on('view', render),
    S.on('scene', render),
  ];
  render();
  return { render, dispose() { offs.forEach((o) => o()); ease?.dispose(); } };
}
