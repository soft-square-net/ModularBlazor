// MudTail Animator: what both editions of the plugin share. The full plugin (plugin.js: Studio + player) and the
// player-only plugin (player-plugin.js, for sites that only play scenes) are built from these pieces, so a scene
// behaves the same in both.

import { registerAnimatorPlugins } from './gsap-plugins.js';
import { createPlayer } from './player.js';
import { ANIMATOR_ICONS } from './studio/icons.js';
import { normalizeScene, validateScene, serializeScene, createScene, SCENE_TYPE, SCENE_VERSION } from './scene.js';

export const ANIMATOR_VERSION = '1.0.0';

/** The icons the player's controls use (the player-only plugin registers just these). */
export const PLAYER_ICONS = Object.fromEntries(['anim-play', 'anim-pause', 'anim-prev', 'anim-next', 'anim-restart'].map((k) => [k, ANIMATOR_ICONS[k]]));

/** GSAP, the registered plugins (plus `extra`) and MudTail helpers, from the plugin context. */
export function depsFor(ctx, extra = {}) {
  const m = ctx.mudtail ?? {};
  return {
    gsap: ctx.gsap,
    plugins: registerAnimatorPlugins(ctx.gsap, extra),
    getIconSvg: m.getIconSvg,
    hasIcon: m.hasIcon,
    t: ctx.t,
    toast: m.showToast,
  };
}

/** Fetches a scene from a URL (JSON). */
async function fetchScene(src) {
  const res = await fetch(src, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`[MudTail Animator] could not load ${src} (${res.status})`);
  return res.text();
}

/**
 * The animator-player component factory. Its handle also works while the scene is still loading (options.src):
 * calls made before it is ready are replayed once it is.
 */
export function playerComponentFactory(extra = {}) {
  return (host, options, emit, ctx) => {
    const deps = depsFor(ctx, extra);
    const { scene, src, ...rest } = options ?? {};
    let player = null;
    let disposed = false;
    const queue = [];
    const call = (name, args) => { if (player) return player[name](...args); queue.push([name, args]); return undefined; };
    const start = (input) => {
      if (disposed) return;
      player = createPlayer(host, input, rest, emit, deps);
      for (const [name, args] of queue.splice(0)) player[name](...args);
    };
    if (scene) start(scene);
    else if (src) fetchScene(src).then(start, (e) => { emit('error', { message: e.message }); console.error(e); });
    else throw new Error('[MudTail Animator] animator-player needs options.scene or options.src');
    const handle = {};
    for (const name of ['play', 'pause', 'toggle', 'restart', 'reverse', 'seek', 'progress', 'timeScale', 'next', 'prev', 'goTo', 'setView', 'load']) handle[name] = (...args) => call(name, args);
    Object.defineProperties(handle, {
      duration: { get: () => player?.duration ?? 0 },
      time: { get: () => player?.time ?? 0 },
      view: { get: () => player?.view ?? null },
      slide: { get: () => player?.slide ?? 0 },
      timeline: { get: () => player?.timeline ?? null },
    });
    handle.getState = () => ({ duration: player?.duration ?? 0, time: player?.time ?? 0, view: player?.view ?? null, slide: player?.slide ?? 0, ready: !!player });
    handle.dispose = () => { disposed = true; player?.dispose(); };
    return handle;
  };
}

/**
 * The data-mud="animator-scene" behaviour: data-src="/scenes/x.json" or an inline <script type="application/json">;
 * data-view, data-fit, data-trigger, data-controls, data-loop. The element gets the handle as el.mudAnimator.
 */
export function sceneBehaviorFactory(playerComponent) {
  return (el, ctx) => {
    const d = el.dataset;
    const inline = el.querySelector('script[type="application/json"]')?.textContent;
    const bool = (v) => (v === undefined ? null : v !== 'false');
    const options = {
      view: d.view || 'auto', fit: d.fit || null, trigger: d.trigger || null, controls: bool(d.controls), loop: bool(d.loop), label: d.label || el.getAttribute('aria-label') || undefined,
      ...(inline ? { scene: inline } : { src: d.src }),
    };
    if (!options.scene && !options.src) { console.warn('[MudTail Animator] data-mud="animator-scene" needs data-src or an inline JSON script', el); return null; }
    const emit = (name, payload) => el.dispatchEvent(new CustomEvent(`animator:${name}`, { detail: payload, bubbles: true }));
    const handle = playerComponent(el, options, emit, ctx);
    el.mudAnimator = handle; // page scripts can drive it: document.querySelector('[data-mud=animator-scene]').mudAnimator.next()
    const dispose = handle.dispose;
    handle.dispose = () => { delete el.mudAnimator; dispose(); };
    return handle;
  };
}

/** The plugin API both editions offer: getPlugin('animator'). */
export function playerApi(ctx, deps, edition) {
  return {
    version: ANIMATOR_VERSION,
    edition, // 'full' (Studio + player) or 'player'
    sceneType: SCENE_TYPE,
    sceneVersion: SCENE_VERSION,
    gsapVersion: ctx.gsap?.version ?? null,
    /** createPlayer(host, scene, options, onEvent) → player handle. */
    createPlayer: (host, scene, options = {}, onEvent = null) => ctx.handle(createPlayer(host, scene, options, ctx.emitter(onEvent), deps)),
    parseScene: (input) => normalizeScene(input),
    validateScene: (input) => validateScene(input),
    serializeScene: (scene, pretty = true) => serializeScene(normalizeScene(scene), { pretty }),
    newScene: (name = 'Untitled scene') => createScene({ name }),
  };
}
