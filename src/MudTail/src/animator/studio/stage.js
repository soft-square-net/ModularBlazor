// MudTail Animator Studio: the Stage. Shows the scene at the current view and time, and edits layers directly:
// click to select (Shift adds, double-click enters groups / edits text), drag to move with snapping guides
// (GSAP Draggable + liveSnap), resize and rotate handles, and on-stage editing of motion-path points.

import { findLayer, resolveLayerProps, setLayerProps, childrenOf } from '../scene.js';
import { motionPath } from '../shapes.js';
import { rawPathToString } from 'gsap/utils/paths.js';
import { h, iconButton } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function createStagePanel(S, mount) {
  const { gsap, plugins, T, icon } = S;
  let zoom = 1;
  let zoomMode = 'fit';
  let snap = true;
  let dragging = false;
  let moveDraggable = null;
  let pointDraggables = [];
  let editingText = null;

  const toolbar = h('div.mud-anim-stagebar');
  const viewport = h('div.mud-anim-viewport', { tabIndex: -1 });
  const wrap = h('div.mud-anim-wrap');
  const stage = h('div.mud-anim-stage');
  const overlay = h('div.mud-anim-overlay');
  const guides = h('div.mud-anim-guides');
  const pathSvg = document.createElementNS(SVG_NS, 'svg');
  pathSvg.classList.add('mud-anim-pathedit');
  overlay.append(guides, pathSvg);
  wrap.append(stage, overlay);
  viewport.append(wrap);
  mount.append(toolbar, viewport);

  // ───── zoom ─────
  function fit() {
    const v = S.view;
    if (zoomMode === 'fit') {
      const pad = 48;
      zoom = Math.max(0.05, Math.min((viewport.clientWidth - pad) / v.width, (viewport.clientHeight - pad) / v.height, 4));
    }
    wrap.style.width = `${v.width * zoom}px`;
    wrap.style.height = `${v.height * zoom}px`;
    for (const el of [stage, overlay]) {
      el.style.width = `${v.width}px`;
      el.style.height = `${v.height}px`;
      el.style.transformOrigin = '0 0';
      el.style.transform = `scale(${zoom})`;
    }
    overlay.style.setProperty('--zoom', String(zoom));
    renderToolbar();
    renderOverlay();
  }
  const setZoom = (z) => { zoomMode = z === 'fit' ? 'fit' : 'manual'; if (z !== 'fit') zoom = Math.max(0.05, Math.min(8, z)); fit(); };
  const ro = new ResizeObserver(() => { if (zoomMode === 'fit') fit(); });
  ro.observe(viewport);
  viewport.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });

  function renderToolbar() {
    const v = S.view;
    toolbar.replaceChildren(
      h('span.mud-anim-stagebar__view', {}, `${v.label} · ${v.width} × ${v.height}`),
      S.isBaseView ? h('span.mud-anim-chip', { title: T('stage.baseHint', 'Edits here change the base design; other views follow it unless you override them there.') }, T('stage.base', 'Base design')) :
        h('span.mud-anim-chip.is-override', { title: T('stage.overrideHint', 'Edits here only change this view (overrides). Reset them in the inspector.') }, T('stage.override', 'Editing {view} overrides', { view: v.label })),
      h('div.mud-anim-spacer'),
      iconButton(icon('anim-magnet', 16), T('stage.snap', 'Snap to guides'), () => { snap = !snap; renderToolbar(); }, { active: snap }),
      iconButton(icon('zoomOut', 16), T('stage.zoomOut', 'Zoom out'), () => setZoom(zoom / 1.25)),
      h('button.mud-anim-zoom', { type: 'button', title: T('stage.zoomFit', 'Fit to window'), onclick: () => setZoom('fit') }, `${Math.round(zoom * 100)}%`),
      iconButton(icon('zoomIn', 16), T('stage.zoomIn', 'Zoom in'), () => setZoom(zoom * 1.25)),
      iconButton(icon('anim-fit', 16), T('stage.zoomFit', 'Fit to window'), () => setZoom('fit'), { active: zoomMode === 'fit' }),
      iconButton(icon('scanEye', 16), T('stage.actual', 'Actual size (100%)'), () => setZoom(1)),
    );
  }

  // ───── geometry helpers ─────
  /** A layer's box in stage coordinates (its own x/y plus its groups' offsets). */
  function absBox(layer) {
    const p = resolveLayerProps(S.scene, layer, S.viewId);
    let x = p.x; let y = p.y;
    let parent = layer.parentId ? findLayer(S.scene, layer.parentId) : null;
    while (parent) { const pp = resolveLayerProps(S.scene, parent, S.viewId); x += pp.x; y += pp.y; parent = parent.parentId ? findLayer(S.scene, parent.parentId) : null; }
    return { x, y, width: p.width, height: p.height, rotation: p.rotation ?? 0, originX: p.originX ?? 50, originY: p.originY ?? 50, props: p };
  }
  const nodeOf = (id) => S.rendered?.nodes.get(id);
  const topAncestor = (layer) => { let l = layer; while (l.parentId) { const p = findLayer(S.scene, l.parentId); if (!p) break; l = p; } return l; };

  // ───── overlay: selection boxes, handles, guides, motion path editor ─────
  function renderOverlay() {
    if (dragging) return;
    moveDraggable?.kill(); moveDraggable = null;
    for (const d of pointDraggables) d.kill();
    pointDraggables = [];
    overlay.querySelectorAll('.mud-anim-sel, .mud-anim-sel-multi').forEach((n) => n.remove());
    pathSvg.replaceChildren();
    const layers = S.selection.layers.map((id) => findLayer(S.scene, id)).filter(Boolean);
    if (!layers.length || editingText) return;

    if (layers.length === 1) {
      const layer = layers[0];
      const b = absBox(layer);
      const box = h(`div.mud-anim-sel${layer.locked ? '.is-locked' : ''}`, { dataset: { layerId: layer.id } });
      Object.assign(box.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.width}px`, height: `${b.height}px`, transformOrigin: `${b.originX}% ${b.originY}%`, rotate: `${b.rotation}deg` });
      box.append(h('span.mud-anim-sel__label', {}, `${layer.name} · ${Math.round(b.width)}×${Math.round(b.height)}`));
      if (!layer.locked) {
        for (const pos of HANDLES) {
          const handle = h(`span.mud-anim-handle.mud-anim-handle--${pos}`, { dataset: { handle: pos } });
          handle.addEventListener('pointerdown', (e) => startResize(e, layer, pos));
          box.append(handle);
        }
        const rot = h('span.mud-anim-rotate', { title: T('stage.rotate', 'Rotate (Shift: 15° steps)') });
        rot.addEventListener('pointerdown', (e) => startRotate(e, layer, box));
        box.append(rot);
        const origin = h('span.mud-anim-origin', { title: T('stage.origin', 'Transform origin') });
        Object.assign(origin.style, { left: `${b.originX}%`, top: `${b.originY}%` });
        box.append(origin);
      }
      overlay.append(box);
      if (!layer.locked) makeMovable(box, layers);
    } else {
      const boxes = layers.map(absBox);
      const minX = Math.min(...boxes.map((b) => b.x)); const minY = Math.min(...boxes.map((b) => b.y));
      const maxX = Math.max(...boxes.map((b) => b.x + b.width)); const maxY = Math.max(...boxes.map((b) => b.y + b.height));
      const box = h('div.mud-anim-sel-multi');
      Object.assign(box.style, { left: `${minX}px`, top: `${minY}px`, width: `${maxX - minX}px`, height: `${maxY - minY}px` });
      for (const b of boxes) box.append(h('span.mud-anim-sel-multi__item', { style: { left: `${b.x - minX}px`, top: `${b.y - minY}px`, width: `${b.width}px`, height: `${b.height}px` } }));
      overlay.append(box);
      makeMovable(box, layers.filter((l) => !l.locked));
    }
    renderPathEditor();
  }

  // ───── move (Draggable with liveSnap guides) ─────
  function makeMovable(box, layers) {
    if (!plugins?.Draggable || !layers.length) return;
    const starts = new Map();
    let before = null;
    let bounds = null;
    const W = S.view.width; const H = S.view.height;
    const others = () => S.scene.layers.filter((l) => !layers.includes(l) && !l.hidden && !l.parentId).map(absBox);
    let targets = null;
    const snapAxis = (v, axis) => {
      if (!snap || !bounds) { showGuide(axis, null); return v; }
      const size = axis === 'x' ? bounds.width : bounds.height;
      const startPos = axis === 'x' ? bounds.x : bounds.y;
      const full = axis === 'x' ? W : H;
      const lines = [0, full / 2, full];
      for (const o of targets) { const p = axis === 'x' ? o.x : o.y; const s = axis === 'x' ? o.width : o.height; lines.push(p, p + s / 2, p + s); }
      const tol = 6 / zoom;
      let best = null;
      for (const line of lines) {
        for (const edge of [0, size / 2, size]) {
          const d = line - (startPos + v + edge);
          if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line };
        }
      }
      showGuide(axis, best ? best.line : null);
      return best ? v + best.d : v;
    };
    [moveDraggable] = plugins.Draggable.create(box, {
      type: 'x,y',
      cursor: 'move',
      allowContextMenu: true,
      liveSnap: { x: (v) => snapAxis(v, 'x'), y: (v) => snapAxis(v, 'y') },
      onPress() {
        before = S.snapshot();
        targets = others();
        const b = layers.map(absBox);
        bounds = { x: Math.min(...b.map((q) => q.x)), y: Math.min(...b.map((q) => q.y)), width: Math.max(...b.map((q) => q.x + q.width)) - Math.min(...b.map((q) => q.x)), height: Math.max(...b.map((q) => q.y + q.height)) - Math.min(...b.map((q) => q.y)) };
        for (const l of layers) starts.set(l.id, resolveLayerProps(S.scene, l, S.viewId));
      },
      onDragStart() { dragging = true; },
      onDrag() {
        for (const l of layers) {
          const p = starts.get(l.id); const el = nodeOf(l.id)?.el;
          if (el) { el.style.left = `${p.x + this.x}px`; el.style.top = `${p.y + this.y}px`; }
        }
      },
      onRelease() {
        showGuide('x', null); showGuide('y', null);
        if (!dragging) return;
        dragging = false;
        const dx = Math.round(this.x); const dy = Math.round(this.y);
        gsap.set(box, { x: 0, y: 0 });
        if (dx || dy) {
          S.preview(() => { for (const l of layers) { const p = starts.get(l.id); setLayerProps(S.scene, l, S.viewId, { x: p.x + dx, y: p.y + dy }); } });
          S.commitSnapshot(T('history.move', 'Move'), before);
        }
        renderOverlay();
      },
    });
  }

  function showGuide(axis, pos) {
    let g = guides.querySelector(`.mud-anim-guide--${axis}`);
    if (pos === null) { g?.remove(); return; }
    if (!g) { g = h(`div.mud-anim-guide.mud-anim-guide--${axis}`); guides.append(g); }
    if (axis === 'x') g.style.left = `${pos}px`; else g.style.top = `${pos}px`;
  }

  // ───── resize ─────
  function startResize(e, layer, pos) {
    e.preventDefault(); e.stopPropagation();
    const before = S.snapshot();
    const p0 = resolveLayerProps(S.scene, layer, S.viewId);
    const el = nodeOf(layer.id)?.el;
    const box = overlay.querySelector('.mud-anim-sel');
    const rad = ((p0.rotation ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rad); const sin = Math.sin(rad);
    const ratio = p0.width / Math.max(1, p0.height);
    const sx = e.clientX; const sy = e.clientY;
    let next = { x: p0.x, y: p0.y, width: p0.width, height: p0.height };
    dragging = true;
    const move = (ev) => {
      const gx = (ev.clientX - sx) / zoom; const gy = (ev.clientY - sy) / zoom;
      // into the layer's rotated frame
      const lx = gx * cos + gy * sin; const ly = -gx * sin + gy * cos;
      let w = p0.width; let hgt = p0.height; let ox = 0; let oy = 0;
      if (pos.includes('e')) w = p0.width + lx;
      if (pos.includes('w')) { w = p0.width - lx; ox = lx; }
      if (pos.includes('s')) hgt = p0.height + ly;
      if (pos.includes('n')) { hgt = p0.height - ly; oy = ly; }
      if (ev.shiftKey || layer.kind === 'icon') {
        if (pos.length === 2) { if (Math.abs(w - p0.width) > Math.abs(hgt - p0.height) * ratio) { const nh = w / ratio; if (pos.includes('n')) oy += hgt - nh; hgt = nh; } else { const nw = hgt * ratio; if (pos.includes('w')) ox += w - nw; w = nw; } }
      }
      w = Math.max(4, w); hgt = Math.max(4, hgt);
      // back to stage space for the position shift
      const dx = ox * cos - oy * sin; const dy = ox * sin + oy * cos;
      next = { x: Math.round(p0.x + dx), y: Math.round(p0.y + dy), width: Math.round(w), height: Math.round(hgt) };
      if (el) Object.assign(el.style, { left: `${next.x}px`, top: `${next.y}px`, width: `${next.width}px`, height: `${next.height}px` });
      if (box) {
        const b = absBox(layer);
        Object.assign(box.style, { left: `${b.x - p0.x + next.x}px`, top: `${b.y - p0.y + next.y}px`, width: `${next.width}px`, height: `${next.height}px` });
        box.querySelector('.mud-anim-sel__label').textContent = `${layer.name} · ${next.width}×${next.height}`;
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      dragging = false;
      const changes = { ...next };
      if (layer.kind === 'text' && S.deps.scaleTextOnResize) changes.fontSize = Math.round((p0.fontSize ?? 48) * (next.height / p0.height));
      S.preview(() => setLayerProps(S.scene, layer, S.viewId, changes));
      S.commitSnapshot(T('history.resize', 'Resize'), before);
      renderOverlay();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ───── rotate ─────
  function startRotate(e, layer, box) {
    e.preventDefault(); e.stopPropagation();
    const before = S.snapshot();
    const r = box.getBoundingClientRect();
    const p0 = resolveLayerProps(S.scene, layer, S.viewId);
    const cx = r.left + r.width * ((p0.originX ?? 50) / 100); const cy = r.top + r.height * ((p0.originY ?? 50) / 100);
    const el = nodeOf(layer.id)?.el;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    let rot = p0.rotation ?? 0;
    dragging = true;
    const move = (ev) => {
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      rot = (p0.rotation ?? 0) + ((a - a0) * 180) / Math.PI;
      if (ev.shiftKey) rot = Math.round(rot / 15) * 15;
      rot = Math.round(rot * 10) / 10;
      if (el) gsap.set(el, { rotation: rot });
      box.style.rotate = `${rot}deg`;
      box.querySelector('.mud-anim-sel__label').textContent = `${layer.name} · ${Math.round(rot)}°`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      dragging = false;
      S.preview(() => setLayerProps(S.scene, layer, S.viewId, { rotation: rot }));
      S.commitSnapshot(T('history.rotate', 'Rotate'), before);
      renderOverlay();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ───── motion path editor ─────
  function renderPathEditor() {
    const found = S.selectedClip;
    if (!found || found.clip.type !== 'motionPath') return;
    const { layer, clip } = found;
    const p = clip.params ?? {};
    const b = absBox(layer);
    const ox = b.x + b.width / 2; const oy = b.y + b.height / 2;
    const v = S.view;
    pathSvg.setAttribute('viewBox', `0 0 ${v.width} ${v.height}`);
    pathSvg.setAttribute('width', String(v.width));
    pathSvg.setAttribute('height', String(v.height));
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', `translate(${ox} ${oy})`);
    pathSvg.append(g);
    const path = document.createElementNS(SVG_NS, 'path');
    path.classList.add('mud-anim-pathedit__line');
    g.append(path);
    const source = p.source ?? 'preset';
    const sx = S.view.width / S.scene.views[0].width; const sy = S.view.height / S.scene.views[0].height;
    if (source === 'preset') path.setAttribute('d', motionPath(p.preset || 'arc', (p.width ?? 600) * sx, (p.height ?? 200) * sy));
    else if (source === 'path' && p.d) path.setAttribute('d', p.d);
    else if (source === 'points') {
      const pts = (Array.isArray(p.points) && p.points.length > 1 ? p.points : [[0, 0], [200, -150], [400, 0]]).map(([x, y]) => [x * sx, y * sy]);
      const draw = (list) => {
        try {
          const raw = plugins.MotionPathPlugin.arrayToRawPath(list.map(([x, y]) => ({ x, y })), { curviness: p.curviness ?? 1.5 });
          path.setAttribute('d', rawPathToString(raw));
        } catch { path.setAttribute('d', `M${list.map((q) => q.join(',')).join(' L')}`); }
      };
      draw(pts);
      const live = pts.map((q) => [...q]);
      let before = null;
      pts.forEach(([x, y], i) => {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('r', String(7 / zoom));
        dot.setAttribute('cx', '0'); dot.setAttribute('cy', '0');
        dot.classList.add('mud-anim-pathedit__point');
        if (i === 0) dot.classList.add('is-start');
        g.append(dot);
        gsap.set(dot, { x, y });
        const [d] = plugins.Draggable.create(dot, {
          type: 'x,y',
          onPress() { before = S.snapshot(); dragging = true; },
          onDrag() { live[i] = [this.x, this.y]; draw(live); },
          onRelease() {
            dragging = false;
            const next = live.map(([qx, qy]) => [Math.round(qx / sx), Math.round(qy / sy)]);
            S.preview(() => { clip.params.points = next; });
            S.commitSnapshot(T('history.pathPoint', 'Move path point'), before);
          },
        });
        dot.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          if (live.length <= 2) return;
          S.commit(T('history.removePoint', 'Remove path point'), () => { clip.params.points = live.filter((_, j) => j !== i).map(([qx, qy]) => [Math.round(qx / sx), Math.round(qy / sy)]); });
        });
        pointDraggables.push(d);
      });
      // double-click the path to add a point there
      path.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const r = pathSvg.getBoundingClientRect();
        const px = (e.clientX - r.left) / zoom - ox; const py = (e.clientY - r.top) / zoom - oy;
        let bestI = live.length - 1; let bestD = Infinity;
        for (let i = 0; i < live.length - 1; i++) {
          const mx = (live[i][0] + live[i + 1][0]) / 2; const my = (live[i][1] + live[i + 1][1]) / 2;
          const dd = Math.hypot(mx - px, my - py);
          if (dd < bestD) { bestD = dd; bestI = i; }
        }
        const next = [...live]; next.splice(bestI + 1, 0, [px, py]);
        S.commit(T('history.addPoint', 'Add path point'), () => { clip.params.points = next.map(([qx, qy]) => [Math.round(qx / sx), Math.round(qy / sy)]); });
      });
    }
    path.style.pointerEvents = source === 'points' ? 'stroke' : 'none';
  }

  // ───── selecting by clicking the stage ─────
  function hitLayer(e, deep) {
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    for (const el of els) {
      const layerEl = el.closest?.('.mud-anim-layer');
      if (!layerEl || !stage.contains(layerEl)) continue;
      const layer = findLayer(S.scene, layerEl.dataset.layerId);
      if (!layer || layer.hidden) continue;
      if (layer.locked && !deep) continue;
      return deep ? layer : topAncestorUnlessSelected(layer);
    }
    return null;
  }
  // Clicking inside a selected group goes one level deeper (like design tools).
  function topAncestorUnlessSelected(layer) {
    const chain = [];
    let l = layer;
    while (l) { chain.unshift(l); l = l.parentId ? findLayer(S.scene, l.parentId) : null; }
    const selectedIndex = chain.findIndex((c) => S.selection.layers.includes(c.id));
    if (selectedIndex >= 0 && selectedIndex < chain.length - 1 && chain[selectedIndex].kind === 'group') return chain[selectedIndex + 1];
    if (selectedIndex >= 0) return chain[selectedIndex];
    return chain[0];
  }

  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || editingText) return;
    if (e.target.closest('.mud-anim-handle, .mud-anim-rotate, .mud-anim-pathedit__point, .mud-anim-pathedit__line')) return;
    const onSelection = e.target.closest('.mud-anim-sel, .mud-anim-sel-multi');
    if (onSelection && !e.shiftKey) return; // Draggable on the box handles it
    viewport.focus({ preventScroll: true });
    const layer = hitLayer(e, e.altKey);
    if (!layer) { if (!e.shiftKey) S.select([]); return; }
    if (e.shiftKey) {
      const set = new Set(S.selection.layers);
      if (set.has(layer.id)) set.delete(layer.id); else set.add(layer.id);
      S.select([...set]);
      return;
    }
    if (!S.selection.layers.includes(layer.id)) S.select([layer.id]);
    // continue straight into a move drag
    if (moveDraggable && !layer.locked) moveDraggable.startDrag(e);
  });

  viewport.addEventListener('dblclick', (e) => {
    const layer = hitLayer(e, true);
    if (!layer) return;
    if (layer.kind === 'text' && !layer.locked) { editText(layer); return; }
    S.select([layer.id]);
  });

  function editText(layer) {
    const node = nodeOf(layer.id);
    if (!node?.text) return;
    S.pause();
    S.timeline?.seek(S.timeline.duration(), false);
    const props = resolveLayerProps(S.scene, layer, S.viewId);
    node.text.textContent = props.text;
    gsap.set([node.el, node.text], { clearProps: 'opacity,visibility,transform,filter,clipPath' });
    editingText = layer.id;
    renderOverlay();
    node.text.contentEditable = 'true';
    node.text.classList.add('is-editing');
    node.text.focus();
    const range = document.createRange(); range.selectNodeContents(node.text);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const done = () => {
      node.text.removeEventListener('blur', done);
      node.text.contentEditable = 'false';
      editingText = null;
      const text = node.text.innerText.replace(/\n$/, '');
      if (text !== props.text) S.setProps(layer.id, { text }, { label: T('history.text', 'Edit text') });
      else S.rebuild();
    };
    node.text.addEventListener('blur', done);
    node.text.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) { ev.preventDefault(); node.text.blur(); } ev.stopPropagation(); });
  }

  // ───── files dropped on the stage become layers where they land ─────
  viewport.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) { e.preventDefault(); viewport.classList.add('is-drop'); } });
  viewport.addEventListener('dragleave', () => viewport.classList.remove('is-drop'));
  viewport.addEventListener('drop', (e) => {
    viewport.classList.remove('is-drop');
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => !/json$/i.test(f.type) && !/\.json$/i.test(f.name));
    if (!files.length) return;
    e.preventDefault(); e.stopPropagation();
    const r = stage.getBoundingClientRect();
    S.addFiles?.(files, { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom });
  });

  const offs = [
    S.on('build', () => { if (zoomMode === 'fit') fit(); else renderOverlay(); }),
    S.on('select', renderOverlay),
    S.on('view', fit),
    S.on('change', renderToolbar),
  ];

  requestAnimationFrame(fit);

  return {
    stage,
    fit,
    get zoom() { return zoom; },
    dispose() { ro.disconnect(); offs.forEach((o) => o()); moveDraggable?.kill(); pointDraggables.forEach((d) => d.kill()); },
    _childrenOf: childrenOf,
  };
}
