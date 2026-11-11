// MudTail Animator: turns a rendered scene into one paused GSAP timeline. Every clip is placed at its start time;
// labels become timeline labels; the whole build runs inside a gsap.context so revert() undoes it (SplitText too).

import { resolveClip, sceneDuration, sortedLabels, viewScale, getView } from './scene.js';
import { EFFECTS } from './effects.js';
import { toEase } from './eases.js';

/**
 * Builds the scene's timeline for the rendered nodes (renderScene's result).
 * opts: { plugins, studio, scope (the stage element), isPlaying() }
 * Returns { tl, context, warnings, duration, revert() }.
 */
export function buildTimeline(gsap, scene, rendered, opts = {}) {
  const { plugins = {}, studio = false, scope = null } = opts;
  const warnings = [];
  const view = getView(scene, rendered.view.id);
  const scale = viewScale(scene, view);
  const duration = sceneDuration(scene);
  let tl;

  const context = gsap.context(() => {
    tl = gsap.timeline({ paused: true, defaults: { overwrite: false } });
    for (const label of sortedLabels(scene)) tl.addLabel(label.name, label.time);

    for (const node of rendered.nodes.values()) {
      const { layer } = node;
      if (layer.hidden) continue;
      const baseFilter = { blur: node.props.blur || 0 };
      for (const raw of layer.clips) {
        if (raw.disabled) continue;
        const clip = resolveClip(scene, raw, view.id);
        const effect = clip && EFFECTS[clip.type];
        if (!effect) { if (clip) warnings.push(`${layer.name}: unknown clip type "${clip.type}"`); continue; }
        const common = {
          duration: clip.duration,
          ease: effect.noEase ? 'none' : toEase(clip.ease, gsap, plugins),
          // "forever" means until the scene ends (and again each time the scene loops): an infinite child would make
          // the scene's timeline endless, which breaks scrubbing, progress and slides.
          repeat: clip.repeat < 0
            ? Math.max(0, Math.floor((duration - clip.start + (clip.repeatDelay || 0)) / Math.max(0.01, clip.duration + (clip.repeatDelay || 0))) - 1)
            : Math.round(clip.repeat || 0),
          yoyo: !!clip.yoyo,
          repeatDelay: clip.repeatDelay || 0,
        };
        try {
          effect.build({
            gsap, tl, node, layer, clip, nodes: rendered.nodes, at: clip.start, common, scale, view, scene, plugins, baseFilter, studio,
            isPlaying: opts.isPlaying ?? (() => true),
            warn: (m) => warnings.push(m),
          });
        } catch (e) {
          warnings.push(`${layer.name}: ${effect.label} failed (${e.message})`);
          if (typeof console !== 'undefined') console.warn('[MudTail Animator]', e);
        }
      }
    }

    // Canvas layers in the Studio follow the timeline's time so they scrub; the player runs them live.
    if (studio) {
      for (const node of rendered.nodes.values()) {
        if (!node.canvas) continue;
        const proxy = { t: 0 };
        tl.to(proxy, { t: Math.max(duration, 0.01), duration: Math.max(duration, 0.01), ease: 'none', onUpdate: () => node.canvas.render(proxy.t) }, 0);
      }
    }

    // pad to the scene's length so empty time at the end still plays
    if (tl.duration() < duration) tl.set({}, {}, duration);
  }, scope ?? undefined);

  return {
    tl,
    context,
    warnings,
    duration: tl.duration(),
    revert() { context.revert(); },
  };
}
