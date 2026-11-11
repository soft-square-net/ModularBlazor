// MudTail Animator Studio: the Timeline. One row per layer (top of the stack first, groups indented), clips as bars
// you drag to move and stretch by their edges (GSAP Draggable, snapping to the grid, the playhead and other clips),
// a ruler to scrub, labels (slide stops in slideshows) you drag on the ruler, and zoom.

import { findLayer, createClip, clipEnd, sortedLabels, uid } from '../scene.js';
import { EFFECTS, effectFits, withDefaults } from '../effects.js';
import { h, iconButton, esc, formatTime } from './dom.js';

const ROW = 30;
const LEFT = 220;

export function createTimelinePanel(S, mount) {
  const { gsap, plugins, T, icon } = S;
  let pps = 110; // pixels per second
  let snapOn = true;
  let collapsed = new Set();
  const draggables = [];

  const bar = h('div.mud-anim-tlbar');
  const scroller = h('div.mud-anim-tl', { tabIndex: -1 });
  mount.append(bar, scroller);

  const snapTime = (t, exceptClipId = null) => {
    if (!snapOn) return Math.max(0, Math.round(t * 100) / 100);
    const tol = 8 / pps;
    const candidates = [S.time, 0, ...sortedLabels(S.scene).map((l) => l.time)];
    for (const l of S.scene.layers) for (const c of l.clips) if (c.id !== exceptClipId) candidates.push(c.start, c.start + c.duration);
    for (const c of candidates) if (Math.abs(c - t) <= tol) return Math.max(0, c);
    return Math.max(0, Math.round(t * 20) / 20); // 0.05 s grid
  };

  function renderBar() {
    const zoom = h('input.mud-anim-range', { type: 'range', min: 20, max: 500, step: 5, value: pps, 'aria-label': T('tl.zoom', 'Timeline zoom') });
    zoom.addEventListener('input', () => { pps = +zoom.value; render(); });
    const sel = S.selectedLayer;
    bar.replaceChildren(
      h('strong.mud-anim-tlbar__title', {}, T('tl.title', 'Timeline')),
      iconButton(icon('anim-flag', 16), T('tl.addLabel', 'Add a label at the playhead (slides stop at labels)'), addLabel),
      iconButton(icon('plus', 16), T('tl.addClip', 'Add an animation to the selected layer at the playhead'), () => sel && addClip(sel, 'tween', S.time), { disabled: !sel }),
      iconButton(icon('anim-magnet', 16), T('tl.snap', 'Snap to grid, playhead, labels and clips'), () => { snapOn = !snapOn; renderBar(); }, { active: snapOn }),
      h('div.mud-anim-spacer'),
      h('span.mud-anim-tlbar__hint', {}, T('tl.hint', 'Drag clips to move, edges to stretch · double-click a row to add · Alt+drag a number to scrub')),
      iconButton(icon('zoomOut', 16), T('tl.zoomOut', 'Zoom out'), () => { pps = Math.max(20, pps / 1.3); render(); }),
      zoom,
      iconButton(icon('zoomIn', 16), T('tl.zoomIn', 'Zoom in'), () => { pps = Math.min(500, pps * 1.3); render(); }),
    );
  }

  function addLabel() {
    const name = prompt(T('tl.labelName', 'Label name'), `slide ${sortedLabels(S.scene).length + 1}`);
    if (!name) return;
    S.commit(T('history.addLabel', 'Add label'), (s) => { s.labels.push({ id: uid('label'), name: name.trim(), time: Math.round(S.time * 100) / 100 }); });
  }

  function addClip(layer, type, at) {
    const fits = effectFits(type, layer.kind) ? type : 'tween';
    const clip = createClip(fits, { start: Math.round(at * 20) / 20, duration: 1, name: EFFECTS[fits].label, from: fits === 'tween' ? { opacity: 0, y: 40 } : {}, params: withDefaults(fits) });
    S.commit(T('history.addClip', 'Add animation'), () => layer.clips.push(clip));
    S.select([layer.id], clip.id);
  }

  // rows: layers top-down (last in the array is on top), children under their group
  function rows() {
    const out = [];
    const walk = (parentId, depth) => {
      const kids = S.scene.layers.filter((l) => (l.parentId ?? null) === parentId).reverse();
      for (const l of kids) {
        out.push({ layer: l, depth });
        if (l.kind === 'group' && !collapsed.has(l.id)) walk(l.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }

  function render() {
    for (const d of draggables.splice(0)) d.kill();
    renderBar();
    const duration = Math.max(S.duration + 2, (scroller.clientWidth - LEFT) / pps);
    const width = Math.ceil(duration * pps) + 40;
    const list = rows();
    const grid = h('div.mud-anim-tl__grid', { style: { width: `${LEFT + width}px`, '--pps': `${pps}px` } });

    // ruler
    const ruler = h('div.mud-anim-tl__ruler', { style: { width: `${width}px` } });
    const step = pps >= 200 ? 0.25 : pps >= 80 ? 0.5 : pps >= 40 ? 1 : 2;
    for (let t = 0; t <= duration + 1e-6; t += step) {
      const major = Math.abs(t - Math.round(t)) < 1e-6;
      ruler.append(h(`span.mud-anim-tick${major ? '.is-major' : ''}`, { style: { left: `${t * pps}px` } }, major ? `${Math.round(t)}s` : ''));
    }
    ruler.append(h('span.mud-anim-tl__end', { style: { left: `${S.duration * pps}px` }, title: T('tl.end', 'Scene end') }));
    for (const label of sortedLabels(S.scene)) {
      const flag = h('span.mud-anim-label', { style: { left: `${label.time * pps}px` }, title: `${label.name} · ${formatTime(label.time)} (${T('tl.labelHint', 'drag to move, double-click to rename, right-click to delete')})` }, label.name);
      ruler.append(flag);
      dragLabel(flag, label);
    }
    const rulerRow = h('div.mud-anim-tl__row.mud-anim-tl__row--ruler', {}, [
      h('div.mud-anim-tl__head', {}, h('span.mud-anim-tl__time', {}, formatTime(S.time))),
      ruler,
    ]);
    ruler.addEventListener('pointerdown', (e) => { if (e.target.closest('.mud-anim-label')) return; scrubFrom(e, ruler); });
    grid.append(rulerRow);

    // layer rows
    if (!list.length) grid.append(h('div.mud-anim-tl__empty', {}, T('tl.empty', 'Add layers from the library on the left, then animations here.')));
    for (const { layer, depth } of list) {
      const selected = S.selection.layers.includes(layer.id);
      const head = h(`div.mud-anim-tl__head${selected ? '.is-selected' : ''}`, { style: { paddingInlineStart: `${8 + depth * 14}px` } });
      if (layer.kind === 'group') {
        head.append(h('button.mud-anim-twisty', { type: 'button', 'aria-label': T('tl.toggleGroup', 'Show or hide the group\'s layers'), 'aria-expanded': String(!collapsed.has(layer.id)), onclick: (e) => { e.stopPropagation(); if (collapsed.has(layer.id)) collapsed.delete(layer.id); else collapsed.add(layer.id); render(); }, html: icon(collapsed.has(layer.id) ? 'chevronRight' : 'chevronDown', 14) }));
      }
      head.append(
        h('span.mud-anim-tl__kind', { html: kindIcon(layer.kind) }),
        h('span.mud-anim-tl__name', { title: layer.name }, layer.name),
        iconButton(icon(layer.hidden ? 'eyeOff' : 'eye', 14), layer.hidden ? T('tl.show', 'Show') : T('tl.hide', 'Hide'), (e) => { e.stopPropagation(); S.commit(T('history.visibility', 'Visibility'), () => { layer.hidden = !layer.hidden; }); }, { cls: layer.hidden ? 'is-off' : '' }),
        iconButton(icon(layer.locked ? 'anim-lock' : 'anim-unlock', 14), layer.locked ? T('tl.unlock', 'Unlock') : T('tl.lock', 'Lock'), (e) => { e.stopPropagation(); S.commit(T('history.lock', 'Lock'), () => { layer.locked = !layer.locked; }); }, { cls: layer.locked ? 'is-on' : 'is-faint' }),
      );
      head.addEventListener('click', (e) => {
        if (e.shiftKey) { const set = new Set(S.selection.layers); if (set.has(layer.id)) set.delete(layer.id); else set.add(layer.id); S.select([...set]); }
        else S.select([layer.id]);
      });
      const track = h(`div.mud-anim-tl__track${selected ? '.is-selected' : ''}${layer.hidden ? '.is-hidden' : ''}`, { style: { width: `${width}px` } });
      track.addEventListener('dblclick', (e) => {
        if (e.target.closest('.mud-anim-clip')) return;
        const r = track.getBoundingClientRect();
        addClip(layer, 'tween', snapTime((e.clientX - r.left) / pps));
      });
      track.addEventListener('pointerdown', (e) => { if (!e.target.closest('.mud-anim-clip')) S.select([layer.id]); });
      for (const clip of layer.clips) track.append(clipBar(layer, clip));
      grid.append(h('div.mud-anim-tl__row', { dataset: { layerId: layer.id } }, [head, track]));
    }

    // playhead
    const playhead = h('div.mud-anim-playhead', { style: { left: `${LEFT + S.time * pps}px` } }, h('span.mud-anim-playhead__knob'));
    grid.append(playhead);
    const scrollLeft = scroller.scrollLeft; const scrollTop = scroller.scrollTop;
    scroller.replaceChildren(grid);
    scroller.scrollLeft = scrollLeft; scroller.scrollTop = scrollTop;
    if (plugins?.Draggable) {
      const [d] = plugins.Draggable.create(playhead, {
        type: 'left', bounds: { minX: LEFT, maxX: LEFT + width }, cursor: 'ew-resize',
        onDrag() { S.seek((this.x - LEFT) / pps); },
        trigger: playhead.firstChild,
      });
      draggables.push(d);
    }
  }

  function kindIcon(kind) {
    return icon({ group: 'folder', shape: 'anim-shapes', text: 'type', image: 'image', svg: 'anim-draw', icon: 'star', video: 'anim-video', audio: 'anim-audio', html: 'anim-html', canvas: 'anim-canvas' }[kind] ?? 'square', 14);
  }

  function clipBar(layer, clip) {
    const effect = EFFECTS[clip.type];
    const selected = S.selection.clip === clip.id;
    const reps = clip.repeat < 0 ? Infinity : clip.repeat;
    const loopEnd = Number.isFinite(reps) ? clipEnd({ ...clip, stagger: null, params: {} }) : null;
    const el = h(`div.mud-anim-clip.mud-anim-clip--${clip.type}${selected ? '.is-selected' : ''}${clip.disabled ? '.is-disabled' : ''}`, {
      style: { left: `${clip.start * pps}px`, width: `${Math.max(6, clip.duration * pps)}px` },
      title: `${clip.name || effect?.label || clip.type} · ${formatTime(clip.start)} → ${formatTime(clip.start + clip.duration)}${clip.repeat ? ` · ${T('tl.repeat', 'repeat')} ${clip.repeat < 0 ? '∞' : clip.repeat}${clip.yoyo ? ' yoyo' : ''}` : ''} · ${effect?.plugin ?? ''}`,
      dataset: { clipId: clip.id },
    }, [
      h('span.mud-anim-clip__edge.is-start'),
      h('span.mud-anim-clip__label', { html: `${icon(effect?.icon ?? 'anim-tween', 12)}<span>${esc(clip.name || effect?.label || clip.type)}</span>` }),
      h('span.mud-anim-clip__edge.is-end'),
    ]);
    if (clip.repeat) {
      const extra = Number.isFinite(reps) ? (loopEnd - clip.start - clip.duration) * pps : 60;
      el.append(h(`span.mud-anim-clip__repeat${Number.isFinite(reps) ? '' : '.is-infinite'}`, { style: { width: `${Math.max(4, extra)}px` } }));
    }
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (S.selection.clip !== clip.id) S.select([layer.id], clip.id); });
    el.addEventListener('dblclick', (e) => { e.stopPropagation(); S.seek(clip.start); });
    if (plugins?.Draggable) wireClipDrag(el, layer, clip);
    return el;
  }

  function wireClipDrag(el, layer, clip) {
    let before = null; let start0 = 0; let dur0 = 0;
    const live = (start, duration) => {
      el.style.left = `${start * pps}px`;
      el.style.width = `${Math.max(6, duration * pps)}px`;
      S.preview(() => { clip.start = start; clip.duration = duration; });
    };
    const press = () => { before = S.snapshot(); start0 = clip.start; dur0 = clip.duration; };
    const release = (label) => { S.commitSnapshot(label, before); };
    const [move] = plugins.Draggable.create(el, {
      type: 'x', cursor: 'grab', activeCursor: 'grabbing', minimumMovement: 3, dragClickables: true,
      onPress: press,
      onDrag() {
        gsap.set(el, { x: 0 });
        const start = snapTime(start0 + this.x / pps, clip.id);
        const end = snapTime(start0 + dur0 + this.x / pps, clip.id);
        live(Math.abs(end - (start0 + dur0 + this.x / pps)) < Math.abs(start - (start0 + this.x / pps)) ? Math.max(0, end - dur0) : start, dur0);
      },
      onRelease() { gsap.set(el, { x: 0 }); if (this.isDragging || clip.start !== start0) release(T('history.moveClip', 'Move animation')); },
    });
    draggables.push(move);
    for (const edge of el.querySelectorAll('.mud-anim-clip__edge')) {
      const isStart = edge.classList.contains('is-start');
      const [d] = plugins.Draggable.create(edge, {
        type: 'x', cursor: 'ew-resize',
        onPress(e) { e.stopPropagation?.(); press(); move.disable(); },
        onDrag() {
          gsap.set(edge, { x: 0 });
          if (isStart) { const start = Math.min(snapTime(start0 + this.x / pps, clip.id), start0 + dur0 - 0.05); live(start, start0 + dur0 - start); }
          else { const end = Math.max(snapTime(start0 + dur0 + this.x / pps, clip.id), start0 + 0.05); live(start0, end - start0); }
        },
        onRelease() { gsap.set(edge, { x: 0 }); move.enable(); release(T('history.resizeClip', 'Stretch animation')); },
      });
      draggables.push(d);
    }
  }

  function dragLabel(flag, label) {
    flag.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const name = prompt(T('tl.labelName', 'Label name'), label.name);
      if (name) S.commit(T('history.renameLabel', 'Rename label'), (s) => { const l = s.labels.find((x) => x.id === label.id); if (l) l.name = name.trim(); });
    });
    flag.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (confirm(T('tl.deleteLabel', 'Delete the label "{name}"?', { name: label.name }))) S.commit(T('history.deleteLabel', 'Delete label'), (s) => { s.labels = s.labels.filter((x) => x.id !== label.id); });
    });
    if (!plugins?.Draggable) return;
    let before = null; let t0 = 0;
    const [d] = plugins.Draggable.create(flag, {
      type: 'x', minimumMovement: 3,
      onPress() { before = S.snapshot(); t0 = label.time; },
      onDrag() { gsap.set(flag, { x: 0 }); const t = snapTime(t0 + this.x / pps); flag.style.left = `${t * pps}px`; S.preview((s) => { const l = s.labels.find((x) => x.id === label.id); if (l) l.time = t; }); },
      onRelease() { gsap.set(flag, { x: 0 }); S.commitSnapshot(T('history.moveLabel', 'Move label'), before); },
      onClick() { S.seek(label.time); },
    });
    draggables.push(d);
  }

  function scrubFrom(e, ruler) {
    const r = ruler.getBoundingClientRect();
    const at = (ev) => S.seek((ev.clientX - r.left) / pps);
    at(e);
    const move = (ev) => at(ev);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // keep the playhead and time label in step without re-rendering every row
  const onTime = (t) => {
    const ph = scroller.querySelector('.mud-anim-playhead');
    if (ph) gsap.set(ph, { left: LEFT + t * pps, x: 0 });
    const label = scroller.querySelector('.mud-anim-tl__time');
    if (label) label.textContent = formatTime(t);
    if (S.playing) {
      const x = LEFT + t * pps;
      if (x > scroller.scrollLeft + scroller.clientWidth - 40 || x < scroller.scrollLeft + LEFT) scroller.scrollLeft = Math.max(0, x - LEFT - 40);
    }
  };

  // Only re-render when not mid-drag: a drag's own preview edits come back as 'change' events.
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; if (!draggables.some((d) => d.isDragging || d.isPressed)) render(); });
  };
  const offs = [S.on('change', queue), S.on('select', queue), S.on('time', onTime), S.on('scene', () => { collapsed = new Set(); queue(); })];
  const ro = new ResizeObserver(queue);
  ro.observe(scroller);
  render();

  return {
    render,
    dispose() { offs.forEach((o) => o()); ro.disconnect(); for (const d of draggables) d.kill(); },
    _find: findLayer,
  };
}
