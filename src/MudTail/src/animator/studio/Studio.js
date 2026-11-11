// MudTail Animator Studio: the editor. Compose a scene from layers (shapes, text, images, SVG, icons, video, audio,
// HTML, canvas effects), lay it out per view (Desktop / Tablet / Mobile …), animate it on a timeline with every GSAP
// plugin, preview it in the real player, and save / export / import it for MudTail sites and Blazor.
//
//   const studio = createStudio(host, { scene, storage: 'local' }, emit, deps)
//   events: change (scene), save (scene JSON), select ({ layers, clip }), time, view, ready
//   handle: getScene(), setScene(scene), save(), exportJson(), play(), pause(), seek(t), setView(id), undo(), redo(), dispose()

import {
  normalizeScene, cloneScene, getView, findLayer, findClip, sceneDuration, serializeScene, removeLayer, duplicateLayer,
  baseView, sceneFileName, setLayerProps, resolveLayerProps,
} from '../scene.js';
import { renderScene } from '../render.js';
import { buildTimeline } from '../timeline.js';
import { sceneFromTemplate } from '../templates.js';
import { h, iconButton, button, esc, formatTime, download } from './dom.js';
import { createStagePanel } from './stage.js';
import { createTimelinePanel } from './timeline-panel.js';
import { createInspector } from './inspector.js';
import { createLibrary } from './library.js';
import { openSceneDialog, openExportDialog, importSceneFile, openPreview, openPluginsDialog, saveToLibrary } from './io.js';

const HISTORY_LIMIT = 120;
const DRAFT_KEY = 'mudtail.animator.draft';

export function createStudio(host, options = {}, emit = () => {}, deps = {}) {
  const { gsap, plugins } = deps;
  const T = (key, fallback, params = {}) => (deps.t ? deps.t(`animator.${key}`, params, fallback) : fallback.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? ''));
  const icon = (name, size = 18) => (deps.getIconSvg ? deps.getIconSvg(name, size) : '');
  const toast = (msg, type = 'info') => (deps.toast ? deps.toast(msg, type) : console.info(msg));
  const opts = { storage: 'local', autosave: true, title: 'MudTail Animator', height: null, ...options };

  let scene = initialScene();
  let viewId = scene.views[0].id;
  let time = 0;
  let playing = false;
  let loop = false;
  let rendered = null;
  let built = null;
  let rebuildQueued = false;
  let disposed = false;
  let dirty = false;
  const selection = { layers: [], clip: null };
  const undoStack = [];
  const redoStack = [];
  let mergeKey = null;
  let mergeTimer = null;
  const listeners = new Map();

  function initialScene() {
    if (opts.scene) return normalizeScene(opts.scene);
    if (opts.template) return sceneFromTemplate(opts.template);
    if (opts.autosave && opts.storage === 'local') {
      try { const draft = localStorage.getItem(DRAFT_KEY); if (draft) return normalizeScene(draft); } catch { /* none */ }
    }
    return sceneFromTemplate('logo');
  }

  // ───── events between panels ─────
  const on = (evt, fn) => { if (!listeners.has(evt)) listeners.set(evt, new Set()); listeners.get(evt).add(fn); return () => listeners.get(evt)?.delete(fn); };
  const fire = (evt, payload) => { for (const fn of listeners.get(evt) ?? []) { try { fn(payload); } catch (e) { console.error('[MudTail Animator Studio]', e); } } };

  // ───── layout ─────
  host.classList.add('mud-anim-studio');
  host.setAttribute('dir', host.getAttribute('dir') ?? '');
  if (opts.height) host.style.height = opts.height;
  const topbar = h('header.mud-anim-topbar');
  const left = h('aside.mud-anim-left');
  const center = h('section.mud-anim-center');
  const right = h('aside.mud-anim-right');
  const bottom = h('section.mud-anim-bottom');
  const status = h('footer.mud-anim-status', { role: 'status' });
  host.replaceChildren(topbar, h('div.mud-anim-main', {}, [left, center, right]), bottom, status);

  // ───── the shared studio API panels use ─────
  const S = {
    deps, gsap, plugins, T, icon, toast, on, fire, host, opts,
    get scene() { return scene; },
    get view() { return getView(scene, viewId); },
    get viewId() { return viewId; },
    get isBaseView() { return viewId === baseView(scene).id; },
    get time() { return time; },
    get playing() { return playing; },
    get loop() { return loop; },
    get duration() { return Math.max(sceneDuration(scene), built?.duration ?? 0, 1); },
    get timeline() { return built?.tl ?? null; },
    get rendered() { return rendered; },
    get selection() { return selection; },
    get selectedLayer() { return selection.layers.length === 1 ? findLayer(scene, selection.layers[0]) : null; },
    get selectedClip() { return selection.clip ? findClip(scene, selection.clip) : null; },

    /** Changes the scene with an undo step. merge: a key; edits with the same key within 600 ms share one step. */
    commit(label, mutate, { merge = null, source = null } = {}) {
      if (!(merge && merge === mergeKey)) {
        undoStack.push({ label, json: JSON.stringify(scene) });
        if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
        redoStack.length = 0;
      }
      clearTimeout(mergeTimer);
      mergeKey = merge;
      if (merge) mergeTimer = setTimeout(() => { mergeKey = null; }, 600);
      mutate(scene);
      changed(source);
      return scene;
    },
    /** Changes the scene without history (live drags); commit() afterwards records the step. */
    preview(mutate) { mutate(scene); scheduleRebuild(); },
    /** Takes an undo snapshot now (before a drag), for commitSnapshot(). */
    snapshot() { return JSON.stringify(scene); },
    commitSnapshot(label, before, source = null) {
      if (before === JSON.stringify(scene)) return;
      undoStack.push({ label, json: before });
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      redoStack.length = 0;
      changed(source);
    },
    undo, redo,
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },

    select(layerIds = [], clipId = null) {
      selection.layers = [...new Set(layerIds)].filter((id) => findLayer(scene, id));
      selection.clip = clipId && findClip(scene, clipId) ? clipId : null;
      if (selection.clip && !selection.layers.length) selection.layers = [findClip(scene, selection.clip).layer.id];
      fire('select', selection);
      emit('select', { layers: [...selection.layers], clip: selection.clip });
    },
    seek(t, { keepPlaying = false } = {}) {
      time = Math.max(0, Math.min(t, S.duration));
      if (built) { if (!keepPlaying) pause(); built.tl.seek(time, false); }
      fire('time', time);
    },
    play, pause, toggle,
    setLoop(v) { loop = !!v; fire('playback'); },
    setView(id) {
      if (!scene.views.some((v) => v.id === id) || id === viewId) return;
      const state = plugins?.Flip && rendered ? plugins.Flip.getState(center.querySelectorAll('.mud-anim-stage [data-flip-id]')) : null;
      viewId = id;
      rebuild();
      if (state) plugins.Flip.from(state, { duration: 0.5, ease: 'power2.inOut', scale: true, simple: true, nested: true });
      fire('view', viewId);
      emit('view', { view: viewId });
    },
    rebuild: scheduleRebuild,
    /** [[id, name]] for layer pickers, indented by depth. */
    layerOptions(exceptId = null) {
      const depth = (l) => { let d = 0; let p = l.parentId; while (p) { d++; p = findLayer(scene, p)?.parentId; } return d; };
      return [...scene.layers].reverse().filter((l) => l.id !== exceptId).map((l) => [l.id, `${'  '.repeat(depth(l))}${l.name}`]);
    },
    /** Sets layer props in the current view (base props, or this view's overrides). */
    setProps(layerId, changes, opts2 = {}) {
      const layer = findLayer(scene, layerId);
      if (!layer) return;
      S.commit(opts2.label ?? T('history.edit', 'Edit {name}', { name: layer.name }), () => setLayerProps(scene, layer, viewId, changes), { merge: opts2.merge ?? null, source: opts2.source ?? null });
    },
    propsOf(layer) { return resolveLayerProps(scene, layer, viewId); },
    deleteSelection() {
      if (selection.clip) {
        const found = findClip(scene, selection.clip);
        if (!found) return;
        S.commit(T('history.deleteClip', 'Delete animation'), () => { found.layer.clips = found.layer.clips.filter((c) => c.id !== selection.clip); });
        S.select(selection.layers);
        return;
      }
      if (!selection.layers.length) return;
      S.commit(T('history.deleteLayers', 'Delete layer'), () => { for (const id of selection.layers) removeLayer(scene, id); });
      S.select([]);
    },
    duplicateSelection() {
      if (!selection.layers.length) return;
      const copies = [];
      S.commit(T('history.duplicate', 'Duplicate'), () => { for (const id of selection.layers) { const c = duplicateLayer(scene, id); if (c) copies.push(c.id); } });
      S.select(copies);
    },
    setScene(next, { history = true } = {}) {
      const normalized = normalizeScene(next);
      if (history) S.commit(T('history.open', 'Open scene'), () => { Object.keys(scene).forEach((k) => delete scene[k]); Object.assign(scene, normalized); });
      else { scene = normalized; undoStack.length = 0; redoStack.length = 0; changed(); }
      if (!scene.views.some((v) => v.id === viewId)) viewId = scene.views[0].id;
      time = 0;
      S.select([]);
      fire('scene');
    },
    save, exportJson: () => serializeScene(scene),
    markClean() { dirty = false; renderTopbar(); },
    setStatus,
  };

  // ───── rebuild: scene → DOM → timeline ─────
  const stagePanel = createStagePanel(S, center);
  function scheduleRebuild() {
    if (rebuildQueued || disposed) return;
    rebuildQueued = true;
    requestAnimationFrame(() => { rebuildQueued = false; if (!disposed) rebuild(); });
  }

  function rebuild() {
    const wasPlaying = playing;
    built?.tl.kill();
    built?.revert();
    rendered?.dispose();
    const stage = stagePanel.stage;
    rendered = renderScene(stage, scene, viewId, { gsap, getIconSvg: deps.getIconSvg, studio: true });
    for (const n of rendered.nodes.values()) n.el.dataset.flipId = n.layer.id;
    built = buildTimeline(gsap, scene, rendered, { plugins, studio: true, scope: stage, isPlaying: () => playing });
    built.tl.eventCallback('onUpdate', onTick);
    built.tl.eventCallback('onComplete', onComplete);
    time = Math.min(time, built.tl.duration());
    built.tl.seek(time, false);
    if (wasPlaying) built.tl.play();
    setStatus(built.warnings.length ? `⚠ ${built.warnings[0]}${built.warnings.length > 1 ? ` (+${built.warnings.length - 1})` : ''}` : '');
    fire('build', rendered);
  }

  // ───── playback ─────
  function onTick() { time = built.tl.time(); fire('time', time); }
  function onComplete() {
    if (loop) { built.tl.restart(); return; }
    playing = false;
    fire('playback');
  }
  function play() {
    if (!built) return;
    if (built.tl.time() >= built.tl.duration() - 0.001) built.tl.seek(0);
    playing = true;
    built.tl.play();
    fire('playback');
  }
  function pause() {
    if (!playing) return;
    playing = false;
    built?.tl.pause();
    for (const n of rendered?.nodes.values() ?? []) if (n.media) { try { n.media.pause(); } catch { /* ignore */ } }
    fire('playback');
  }
  function toggle() { if (playing) pause(); else play(); }

  // ───── history ─────
  function undo() {
    const step = undoStack.pop();
    if (!step) return;
    redoStack.push({ label: step.label, json: JSON.stringify(scene) });
    restore(step.json);
    setStatus(T('status.undo', 'Undid: {label}', { label: step.label }));
  }
  function redo() {
    const step = redoStack.pop();
    if (!step) return;
    undoStack.push({ label: step.label, json: JSON.stringify(scene) });
    restore(step.json);
    setStatus(T('status.redo', 'Redid: {label}', { label: step.label }));
  }
  function restore(json) {
    scene = JSON.parse(json);
    mergeKey = null;
    if (!scene.views.some((v) => v.id === viewId)) viewId = scene.views[0].id;
    S.select(selection.layers.filter((id) => findLayer(scene, id)), selection.clip && findClip(scene, selection.clip) ? selection.clip : null);
    changed();
  }

  let draftTimer = null;
  function changed(source = null) {
    dirty = true;
    scheduleRebuild();
    fire('change', { source });
    renderTopbar();
    emit('change', { name: scene.name, layers: scene.layers.length, duration: sceneDuration(scene) });
    if (opts.autosave && opts.storage === 'local') {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(scene)); } catch { /* quota: assets too big for a draft */ } }, 800);
    }
  }

  function save() {
    scene.updated = new Date().toISOString();
    const json = serializeScene(scene);
    if (opts.storage === 'local') {
      const ok = saveToLibrary(scene);
      if (!ok) toast(T('toast.quota', 'Saved scenes are full: export the file instead (large images or videos take room).'), 'warning');
    }
    dirty = false;
    renderTopbar();
    emit('save', { id: scene.id, name: scene.name, json });
    toast(T('toast.saved', 'Saved "{name}"', { name: scene.name }), 'success');
    return json;
  }

  function setStatus(text) { status.textContent = text || T('status.ready', 'Ready · Space plays · Ctrl+Z undoes · Del deletes · arrows nudge'); }

  // ───── top bar ─────
  const timeEl = h('output.mud-anim-time', { 'aria-label': T('time', 'Time') });
  function renderTopbar() {
    const views = scene.views.map((v, i) => iconButton(icon(['anim-desktop', 'anim-tablet', 'anim-mobile'][i] ?? 'anim-views', 18) + `<span class="mud-anim-ibtn__text">${esc(v.label)}</span>`, `${v.label} · ${v.width}×${v.height}`, () => S.setView(v.id), { active: v.id === viewId, cls: 'mud-anim-view-btn' }));
    const name = h('input.mud-anim-scene-name', { value: scene.name, 'aria-label': T('sceneName', 'Scene name'), spellcheck: false });
    name.addEventListener('change', () => S.commit(T('history.rename', 'Rename scene'), (s) => { s.name = name.value.trim() || s.name; }));
    topbar.replaceChildren(
      h('div.mud-anim-brand', { html: `${icon('anim-wand', 20)}<strong>${esc(opts.title)}</strong>` }),
      name,
      h('span.mud-anim-dirty', { title: T('unsaved', 'Unsaved changes'), hidden: !dirty }, '●'),
      h('div.mud-anim-group', {}, [
        iconButton(icon('anim-new'), T('open', 'New or open scene…'), () => openSceneDialog(S)),
        iconButton(icon('upload'), T('import', 'Import a scene file…'), () => importSceneFile(S)),
        iconButton(icon('anim-save'), T('save', 'Save (Ctrl+S)'), () => save()),
        iconButton(icon('download'), T('export', 'Export & embed…'), () => openExportDialog(S)),
      ]),
      h('div.mud-anim-group', {}, [
        iconButton(icon('undo'), T('undo', 'Undo (Ctrl+Z)'), undo, { disabled: !undoStack.length }),
        iconButton(icon('redo'), T('redo', 'Redo (Ctrl+Y)'), redo, { disabled: !redoStack.length }),
      ]),
      h('div.mud-anim-group.mud-anim-views', { role: 'group', 'aria-label': T('views', 'Views') }, views),
      h('div.mud-anim-spacer'),
      h('div.mud-anim-group', {}, [
        iconButton(icon('anim-first'), T('toStart', 'To start (Home)'), () => S.seek(0)),
        iconButton(icon(playing ? 'anim-pause' : 'anim-play'), playing ? T('pause', 'Pause (Space)') : T('play', 'Play (Space)'), toggle, { cls: 'mud-anim-play' }),
        iconButton(icon('anim-last'), T('toEnd', 'To end (End)'), () => S.seek(S.duration)),
        iconButton(icon('anim-loop'), T('loop', 'Loop playback'), () => S.setLoop(!loop), { active: loop }),
        timeEl,
      ]),
      h('div.mud-anim-group', {}, [
        button(T('preview', 'Preview'), () => openPreview(S), { icon: icon('anim-preview', 16), variant: 'primary', title: T('previewHint', 'Play the scene in the real player, with its trigger, slides and interactions') }),
        iconButton(icon('anim-info'), T('gsap', 'GSAP plugins in this Studio'), () => openPluginsDialog(S)),
      ]),
    );
    updateTime();
  }
  const updateTime = () => { timeEl.textContent = `${formatTime(time)} / ${formatTime(S.duration)}`; };
  on('time', updateTime);
  on('playback', renderTopbar);
  on('view', renderTopbar);
  on('scene', renderTopbar);

  // ───── panels ─────
  const library = createLibrary(S, left);
  const inspector = createInspector(S, right);
  const timelinePanel = createTimelinePanel(S, bottom);

  // ───── keyboard ─────
  const typing = (e) => e.target.closest?.('input, textarea, select, [contenteditable="true"]');
  function onKey(e) {
    if (!host.isConnected || host.querySelector('.mud-anim-modal')) return;
    if (!host.contains(document.activeElement) && document.activeElement !== document.body) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { if (typing(e)) return; e.preventDefault(); undo(); return; }
    if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { if (typing(e)) return; e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if (typing(e)) return;
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); S.duplicateSelection(); return; }
    if (mod && e.key.toLowerCase() === 'c' && selection.layers.length) { clipboard = selection.layers.map((id) => cloneScene(findLayer(scene, id))); return; }
    if (mod && e.key.toLowerCase() === 'v' && clipboard) { e.preventDefault(); paste(); return; }
    switch (e.key) {
      case ' ': e.preventDefault(); toggle(); break;
      case 'Home': e.preventDefault(); S.seek(0); break;
      case 'End': e.preventDefault(); S.seek(S.duration); break;
      case 'Delete': case 'Backspace': e.preventDefault(); S.deleteSelection(); break;
      case 'Escape': S.select([]); break;
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
        if (!selection.layers.length) {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); S.seek(time + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1)); }
          return;
        }
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        S.commit(T('history.nudge', 'Nudge'), () => {
          for (const id of selection.layers) { const l = findLayer(scene, id); if (!l || l.locked) continue; const p = resolveLayerProps(scene, l, viewId); setLayerProps(scene, l, viewId, { x: p.x + dx, y: p.y + dy }); }
        }, { merge: 'nudge' });
        break;
      }
      default: break;
    }
  }
  let clipboard = null;
  function paste() {
    const ids = [];
    S.commit(T('history.paste', 'Paste'), () => {
      for (const src of clipboard) {
        const copy = cloneScene(src);
        const map = new Map();
        copy.id = `${src.kind}_${Math.random().toString(36).slice(2, 9)}`;
        map.set(src.id, copy.id);
        copy.parentId = null;
        copy.props.x += 24; copy.props.y += 24;
        copy.clips = copy.clips.map((c) => ({ ...c, id: `clip_${Math.random().toString(36).slice(2, 9)}` }));
        scene.layers.push(copy);
        ids.push(copy.id);
      }
    });
    S.select(ids);
  }
  document.addEventListener('keydown', onKey);

  // ───── drop a scene file anywhere on the studio ─────
  const onDrop = async (e) => {
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => /json$/i.test(f.type) || /\.json$/i.test(f.name));
    if (!file) return;
    e.preventDefault();
    await importSceneFile(S, file);
  };
  host.addEventListener('drop', onDrop);
  const onDragOver = (e) => { if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) e.preventDefault(); };
  host.addEventListener('dragover', onDragOver);

  // warn before leaving with unsaved work (only when the studio owns the page)
  const beforeUnload = (e) => { if (dirty && opts.warnOnLeave) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);

  renderTopbar();
  setStatus('');
  rebuild();
  S.select([]);
  emit('ready', { id: scene.id, name: scene.name });

  return {
    getScene: () => cloneScene(scene),
    getSceneJson: () => serializeScene(scene),
    setScene: (next) => S.setScene(next, { history: true }),
    loadTemplate: (id) => S.setScene(sceneFromTemplate(id), { history: true }),
    save,
    exportJson: () => serializeScene(scene),
    download: () => download(sceneFileName(scene), serializeScene(scene)),
    play, pause, toggle,
    seek: (t) => S.seek(t),
    setView: (id) => S.setView(id),
    select: (ids, clipId) => S.select(ids, clipId),
    undo, redo,
    get dirty() { return dirty; },
    refit() { stagePanel.fit(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', beforeUnload);
      host.removeEventListener('drop', onDrop);
      host.removeEventListener('dragover', onDragOver);
      clearTimeout(draftTimer);
      built?.tl.kill();
      built?.revert();
      rendered?.dispose();
      stagePanel.dispose(); timelinePanel.dispose(); inspector.dispose(); library.dispose();
      host.querySelectorAll('.mud-anim-modal').forEach((m) => m.remove());
      host.replaceChildren();
      host.classList.remove('mud-anim-studio');
      listeners.clear();
    },
  };
}
