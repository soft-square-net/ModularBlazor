// MudTail Animator: the player. Plays a scene in any page (MudTail site, Blazor component, plain HTML): picks the
// view that fits the container (Desktop / Tablet / Mobile), scales the stage, builds the timeline, and wires the
// scene's trigger (load, visible, scroll scrub / pin, click, hover), slideshow navigation (buttons, dots, swipe,
// wheel, keys), layer interactions and draggable layers.

import { normalizeScene, pickView, getView, sortedLabels, findLayer } from './scene.js';
import { renderScene, fitStage } from './render.js';
import { buildTimeline } from './timeline.js';
import { isSafeUrl } from './sanitize.js';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Creates a player in `host`.
 * options: { view: 'auto' | viewId, fit, trigger, autoplay, controls, loop, speed, devtools, reducedMotion: 'respect' | 'ignore',
 *            height: 'auto' | css length, label: accessible name }
 * deps: { gsap, plugins, getIconSvg, t } (the plugin passes them).
 * emit(name, payload): ready, play, pause, complete, view, slide, interaction, error.
 */
export function createPlayer(host, sceneInput, options = {}, emit = () => {}, deps = {}) {
  const { gsap, plugins } = deps;
  const t = deps.t ?? ((k, p, d) => d ?? k);
  let scene = normalizeScene(sceneInput);
  const opts = { view: 'auto', fit: null, trigger: null, autoplay: null, controls: null, loop: null, speed: null, devtools: false, reducedMotion: 'respect', height: 'auto', ...options };

  host.classList.add('mud-anim-player');
  const frame = document.createElement('div');
  frame.className = 'mud-anim-frame';
  frame.tabIndex = 0;
  frame.setAttribute('role', 'region');
  frame.setAttribute('aria-roledescription', t('animator.player.role', {}, 'animation'));
  const stage = document.createElement('div');
  frame.appendChild(stage);
  host.replaceChildren(frame);

  let view = null;
  let rendered = null;
  let built = null;
  let disposed = false;
  let slide = 0;
  let navTween = null;
  const cleanups = []; // per build
  const lifetime = []; // per player

  const settings = () => scene.settings;
  const fit = () => opts.fit ?? settings().fit ?? 'contain';
  const mode = () => settings().mode === 'slides' && sortedLabels(scene).length ? 'slides' : 'timeline';
  const trigger = () => opts.trigger ?? settings().trigger ?? 'load';
  const showControls = () => opts.controls ?? settings().controls ?? false;
  const reduce = () => opts.reducedMotion !== 'ignore' && reducedMotion();

  // ───── layout ─────
  const chooseView = () => {
    if (opts.view && opts.view !== 'auto') return getView(scene, opts.view);
    if (settings().autoView === false) return scene.views[0];
    return pickView(scene, host.clientWidth || frame.clientWidth || scene.views[0].width);
  };
  const sizeFrame = () => {
    if (!view) return;
    if (opts.height === 'auto') frame.style.aspectRatio = fit() === 'width' ? `${view.width} / ${view.height}` : `${view.width} / ${view.height}`;
    else { frame.style.aspectRatio = ''; frame.style.height = opts.height; }
    fitStage(stage, frame, view, fit());
  };

  // ───── build ─────
  function build({ keepProgress = null, flip = false } = {}) {
    const state = flip && rendered && plugins?.Flip ? plugins.Flip.getState(stage.querySelectorAll('[data-flip-id]')) : null;
    teardown();
    rendered = renderScene(stage, scene, view.id, { gsap, getIconSvg: deps.getIconSvg, studio: false });
    for (const n of rendered.nodes.values()) n.el.dataset.flipId = n.layer.id;
    sizeFrame();
    built = buildTimeline(gsap, scene, rendered, { plugins, studio: false, scope: stage });
    for (const w of built.warnings) console.warn('[MudTail Animator]', w);
    const tl = built.tl;
    const loop = opts.loop ?? null;
    tl.repeat(loop === true ? -1 : loop === false ? 0 : Math.round(settings().repeat || 0));
    tl.yoyo(!!settings().yoyo);
    tl.repeatDelay(settings().repeatDelay || 0);
    tl.timeScale(opts.speed ?? settings().speed ?? 1);
    tl.eventCallback('onComplete', () => emit('complete', { time: tl.time() }));
    for (const n of rendered.nodes.values()) if (n.canvas) n.canvas.live();
    wireInteractions();
    if (keepProgress !== null) tl.progress(keepProgress);
    if (state) plugins.Flip.from(state, { duration: 0.6, ease: 'power2.inOut', absolute: false, scale: true, simple: true, nested: true });
    return tl;
  }

  function teardown() {
    while (cleanups.length) { try { cleanups.pop()(); } catch (e) { console.warn(e); } }
    navTween?.kill(); navTween = null;
    built?.tl.kill();
    built?.revert();
    rendered?.dispose();
    built = null; rendered = null;
  }

  // ───── interactions and draggable layers ─────
  function wireInteractions() {
    for (const node of rendered.nodes.values()) {
      const { layer, el } = node;
      for (const it of layer.interactions ?? []) {
        const event = { click: 'click', hover: 'mouseenter', leave: 'mouseleave', dblclick: 'dblclick' }[it.on] ?? it.on;
        if (!event) continue;
        if (it.on === 'click') { el.style.cursor = el.style.cursor || 'pointer'; el.tabIndex = 0; el.setAttribute('role', 'button'); }
        const handler = (e) => { if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return; runAction(it, node); };
        el.addEventListener(event, handler);
        cleanups.push(() => el.removeEventListener(event, handler));
        if (it.on === 'click') { el.addEventListener('keydown', handler); cleanups.push(() => el.removeEventListener('keydown', handler)); }
      }
      if (layer.draggable && plugins?.Draggable) {
        const d = layer.draggable;
        const [instance] = plugins.Draggable.create(el, {
          type: d.type || 'x,y',
          inertia: d.inertia !== false && !!plugins.InertiaPlugin,
          bounds: d.bounds === false ? undefined : stage,
          edgeResistance: d.edgeResistance ?? 0.65,
          onDragStart: () => emit('interaction', { layerId: layer.id, action: 'drag' }),
        });
        cleanups.push(() => instance.kill());
      }
    }
  }

  function runAction(it, node) {
    const tl = built?.tl;
    if (!tl) return;
    emit('interaction', { layerId: node.layer.id, action: it.action, label: it.label ?? null });
    switch (it.action) {
      case 'play': api.play(); break;
      case 'pause': api.pause(); break;
      case 'toggle': api.toggle(); break;
      case 'restart': api.restart(); break;
      case 'reverse': tl.reverse(); break;
      case 'seek': api.seek(it.label ?? 0); break;
      case 'playFrom': tl.play(it.label ?? 0); break;
      case 'next': api.next(); break;
      case 'prev': api.prev(); break;
      case 'animate': gsap.to(node.el, { ...(it.to ?? { scale: 1.08 }), duration: it.duration ?? 0.35, ease: it.ease ?? 'power2.out', overwrite: 'auto' }); break;
      case 'url': if (it.url && isSafeUrl(it.url) && !/^data:/i.test(it.url)) window.open(it.url, it.target || '_self', 'noopener'); break;
      case 'scrollTo': if (plugins?.ScrollToPlugin) gsap.to(window, { scrollTo: it.selector || it.y || 0, duration: 1, ease: 'power2.inOut' }); break;
      case 'emit': emit(it.event || 'custom', { layerId: node.layer.id, data: it.data ?? null }); break;
      default: break;
    }
  }

  // ───── trigger ─────
  function wireTrigger() {
    const tl = built.tl;
    if (reduce()) { tl.progress(mode() === 'slides' ? 0 : 1).pause(); if (mode() === 'slides') goTo(0, true); return; }
    const kind = trigger();
    const ST = plugins?.ScrollTrigger;
    if (mode() === 'slides') { if (opts.autoplay ?? (kind === 'load')) startAutoAdvance(); goTo(0, true); return; }
    if (kind === 'scroll' && ST) {
      const s = settings().scroll ?? {};
      const st = ST.create({ trigger: host, start: s.start || 'top 80%', end: s.end || 'bottom 20%', scrub: s.scrub === false ? false : s.scrub === true ? true : (+s.scrub || 1), pin: !!s.pin, animation: tl, anticipatePin: 1 });
      lifetime.push(() => st.kill());
      return;
    }
    if (kind === 'visible' && ST) {
      const st = ST.create({ trigger: host, start: 'top 85%', onEnter: () => tl.play(), onEnterBack: () => tl.play(), onLeave: () => tl.pause(), onLeaveBack: () => tl.pause() });
      lifetime.push(() => st.kill());
      return;
    }
    if (kind === 'click') {
      const on = () => api.toggle();
      frame.addEventListener('click', on);
      lifetime.push(() => frame.removeEventListener('click', on));
      frame.style.cursor = 'pointer';
      return;
    }
    if (kind === 'hover') {
      const enter = () => built.tl.play();
      const leave = () => built.tl.reverse();
      host.addEventListener('mouseenter', enter); host.addEventListener('mouseleave', leave);
      host.addEventListener('focusin', enter); host.addEventListener('focusout', leave);
      lifetime.push(() => { host.removeEventListener('mouseenter', enter); host.removeEventListener('mouseleave', leave); host.removeEventListener('focusin', enter); host.removeEventListener('focusout', leave); });
      return;
    }
    if (kind === 'load' && opts.autoplay !== false) tl.play();
  }

  // ───── slides ─────
  // A slide plays from its label to the next label (or the end). Going back rewinds quickly, then plays the slide.
  let autoAdvance = false;
  let autoCall = null;
  function startAutoAdvance() {
    autoAdvance = (settings().slideHold ?? 0) > 0;
    lifetime.push(() => { autoAdvance = false; autoCall?.kill(); });
  }

  function playSlide(tl, from, to) {
    navTween = tl.tweenFromTo(from, to, {
      onComplete: () => {
        if (!autoAdvance || disposed) return;
        autoCall?.kill();
        autoCall = gsap.delayedCall(settings().slideHold, () => api.next());
      },
    });
  }

  function goTo(index, instant = false) {
    const labels = sortedLabels(scene);
    if (!labels.length || !built) return;
    const count = labels.length;
    const i = ((index % count) + count) % count;
    const tl = built.tl;
    const target = labels[i];
    const end = labels[i + 1]?.time ?? tl.duration();
    navTween?.kill();
    autoCall?.kill();
    tl.pause();
    if (reduce()) tl.seek(Math.max(target.time, end - 0.001), false);
    else if (instant || i > slide || (i === 0 && slide === count - 1) || i === slide) { tl.seek(target.time, false); playSlide(tl, target.time, end); }
    else {
      navTween = tl.tweenFromTo(tl.time(), target.time, { duration: 0.6, ease: 'power2.inOut', onComplete: () => playSlide(tl, target.time, end) });
    }
    slide = i;
    updateDots();
    emit('slide', { index: i, label: target.name, count });
  }

  // ───── controls ─────
  let controls = null;
  function buildControls() {
    controls?.remove();
    controls = null;
    if (!showControls()) return;
    const icon = (name, fallback) => deps.getIconSvg?.(name, 18) ?? fallback;
    controls = document.createElement('div');
    controls.className = 'mud-anim-controls';
    if (mode() === 'slides') {
      const labels = sortedLabels(scene);
      controls.innerHTML = `
        <button type="button" class="mud-anim-ctl" data-act="prev" aria-label="${esc(t('animator.player.prev', {}, 'Previous slide'))}">${icon('anim-prev', '‹')}</button>
        <div class="mud-anim-dots" role="tablist">${labels.map((l, i) => `<button type="button" class="mud-anim-dot" role="tab" data-slide="${i}" aria-label="${esc(l.name)}"></button>`).join('')}</div>
        <button type="button" class="mud-anim-ctl" data-act="next" aria-label="${esc(t('animator.player.next', {}, 'Next slide'))}">${icon('anim-next', '›')}</button>`;
    } else {
      controls.innerHTML = `
        <button type="button" class="mud-anim-ctl" data-act="toggle" aria-label="${esc(t('animator.player.playPause', {}, 'Play or pause'))}">${icon('anim-play', '▶')}</button>
        <input type="range" class="mud-anim-scrub" min="0" max="1000" value="0" aria-label="${esc(t('animator.player.position', {}, 'Position'))}">
        <button type="button" class="mud-anim-ctl" data-act="restart" aria-label="${esc(t('animator.player.restart', {}, 'Restart'))}">${icon('anim-restart', '↺')}</button>`;
      const range = controls.querySelector('input');
      range.addEventListener('input', () => { built.tl.pause(); built.tl.progress(range.value / 1000); });
      const sync = () => {
        if (!built || !controls) return;
        if (document.activeElement !== range) range.value = String(Math.round(built.tl.progress() * 1000));
        const btn = controls.querySelector('[data-act="toggle"]');
        const playing = built.tl.isActive();
        if (btn && btn.dataset.state !== String(playing)) { btn.dataset.state = String(playing); btn.innerHTML = playing ? icon('anim-pause', '❚❚') : icon('anim-play', '▶'); }
      };
      gsap.ticker.add(sync);
      lifetime.push(() => gsap.ticker.remove(sync));
    }
    controls.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      e.stopPropagation();
      if (b.dataset.slide) goTo(+b.dataset.slide);
      else if (b.dataset.act === 'prev') api.prev();
      else if (b.dataset.act === 'next') api.next();
      else if (b.dataset.act === 'toggle') api.toggle();
      else if (b.dataset.act === 'restart') api.restart();
    });
    host.appendChild(controls);
    updateDots();
  }

  function updateDots() {
    controls?.querySelectorAll('.mud-anim-dot').forEach((d, i) => d.setAttribute('aria-selected', String(i === slide)));
  }

  function wireSlideNavigation() {
    if (mode() !== 'slides') return;
    if (plugins?.Observer) {
      let lock = false;
      const go = (dir) => { if (lock) return; lock = true; dir > 0 ? api.next() : api.prev(); gsap.delayedCall(0.7, () => { lock = false; }); };
      const obs = plugins.Observer.create({
        target: frame, type: 'wheel,touch,pointer', tolerance: 40, preventDefault: false, wheelSpeed: -1, dragMinimum: 6,
        onLeft: () => go(1), onRight: () => go(-1),
        onUp: (self) => { if (self.event?.type === 'wheel') go(1); }, onDown: (self) => { if (self.event?.type === 'wheel') go(-1); },
      });
      lifetime.push(() => obs.kill());
    }
    const keys = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); api.next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); api.prev(); }
      else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
      else if (e.key === 'End') { e.preventDefault(); goTo(sortedLabels(scene).length - 1); }
    };
    frame.addEventListener('keydown', keys);
    lifetime.push(() => frame.removeEventListener('keydown', keys));
  }

  // ───── start / resize ─────
  function start() {
    while (lifetime.length) { try { lifetime.pop()(); } catch (e) { console.warn(e); } }
    view = chooseView();
    frame.setAttribute('aria-label', opts.label || scene.name);
    build();
    buildControls();
    wireSlideNavigation();
    wireTrigger();
    if (opts.devtools && !plugins?.GSDevTools) console.warn('[MudTail Animator] devtools needs the full animator plugin (GSDevTools is not in the player-only bundle)');
    if (opts.devtools && plugins?.GSDevTools) {
      const dt = plugins.GSDevTools.create({ animation: built.tl, id: `mud-anim-${scene.id}`, globalSync: false, persist: false });
      lifetime.push(() => dt.kill());
    }
    emit('ready', { duration: built.tl.duration(), view: view.id, mode: mode(), labels: sortedLabels(scene).map((l) => l.name) });
  }

  let resizeFrame = 0;
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (disposed || !built) return;
      const next = chooseView();
      if (next.id !== view.id) {
        const playing = built.tl.isActive() || navTween?.isActive?.();
        const progress = built.tl.progress();
        view = next;
        const slideshow = mode() === 'slides';
        const tl = build({ keepProgress: progress, flip: settings().flipOnViewChange !== false });
        if (slideshow) goTo(slide, true); // the old playhead tween died with the old timeline: replay this slide
        else if (playing) tl.resume();
        plugins?.ScrollTrigger?.refresh?.();
        emit('view', { view: view.id });
        if (!slideshow && (trigger() === 'scroll' || trigger() === 'visible')) start();
      } else sizeFrame();
    });
  }) : null;
  ro?.observe(host);

  const api = {
    get scene() { return scene; },
    get timeline() { return built?.tl ?? null; },
    get duration() { return built?.tl.duration() ?? 0; },
    get time() { return built?.tl.time() ?? 0; },
    get view() { return view?.id ?? null; },
    get slide() { return slide; },
    play() { if (mode() === 'slides') { navTween?.play?.(); return; } built?.tl.play(); emit('play', {}); },
    pause() { built?.tl.pause(); navTween?.pause?.(); emit('pause', {}); },
    toggle() { if (built?.tl.isActive() || navTween?.isActive?.()) api.pause(); else { if (built?.tl.progress() === 1) built.tl.restart(); else api.play(); } },
    restart() { if (mode() === 'slides') goTo(0, true); else { built?.tl.restart(); emit('play', {}); } },
    reverse() { built?.tl.reverse(); },
    /** Seeks to seconds or a label name (paused). */
    seek(position) { built?.tl.pause(); built?.tl.seek(position, false); },
    progress(value) { if (value === undefined) return built?.tl.progress() ?? 0; built?.tl.pause().progress(value); return value; },
    timeScale(value) { if (value === undefined) return built?.tl.timeScale() ?? 1; built?.tl.timeScale(value); return value; },
    next() { goTo(slide + 1); },
    prev() { goTo(slide - 1); },
    goTo(index) { goTo(index); },
    /** Forces a view ('desktop', 'tablet', 'mobile', …) or returns to automatic with 'auto'. */
    setView(id) { opts.view = id || 'auto'; const next = chooseView(); if (next.id !== view?.id) { const wasPlaying = !!(built?.tl.isActive() || navTween); view = next; const tl = build({ keepProgress: built?.tl.progress() ?? 0, flip: true }); if (mode() === 'slides') goTo(slide, true); else if (wasPlaying) tl.resume(); emit('view', { view: view.id }); } },
    /** Replaces the scene (a scene object or JSON text) and starts again. */
    load(next) { scene = normalizeScene(next); slide = 0; start(); },
    layer(id) { const n = rendered?.nodes.get(id); return n ? { element: n.el, layer: findLayer(scene, id) } : null; },
    dispose() {
      if (disposed) return;
      disposed = true;
      ro?.disconnect();
      cancelAnimationFrame(resizeFrame);
      while (lifetime.length) { try { lifetime.pop()(); } catch { /* ignore */ } }
      teardown();
      controls?.remove();
      host.classList.remove('mud-anim-player');
      host.replaceChildren();
    },
  };

  try { start(); } catch (e) { emit('error', { message: e.message }); throw e; }
  return api;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
