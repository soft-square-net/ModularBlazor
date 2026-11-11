// MudTail Animator: the GSAP plugins it uses, registered on the GSAP instance MudTail hands over (ctx.gsap).
// GSAP's plugin files do not import GSAP's core, so this module bundles the plugins without a second copy of GSAP:
// they attach to whichever gsap registers them.
//
// Not included: PixiPlugin and EaselPlugin (they drive PixiJS / EaselJS objects, which a scene does not use),
// ScrollSmoother (it takes over the page's scrolling, which is the site's call, not a scene's) and CSSRulePlugin
// (deprecated by GSAP in favour of CSS variables, which plain tweens animate). GSDevTools is registered by the full
// plugin only (the Studio's preview), so the player-only bundle stays lean.

import { CustomEase } from 'gsap/CustomEase';
import { CustomBounce } from 'gsap/CustomBounce';
import { CustomWiggle } from 'gsap/CustomWiggle';
import { RoughEase, SlowMo, ExpoScaleEase } from 'gsap/EasePack';
import { Draggable } from 'gsap/Draggable';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { Flip } from 'gsap/Flip';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { Observer } from 'gsap/Observer';
import { Physics2DPlugin } from 'gsap/Physics2DPlugin';
import { PhysicsPropsPlugin } from 'gsap/PhysicsPropsPlugin';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { SplitText } from 'gsap/SplitText';
import { TextPlugin } from 'gsap/TextPlugin';

/** Every plugin by name (what toEase() and the effects receive). */
export const PLUGINS = Object.freeze({
  CustomEase, CustomBounce, CustomWiggle, RoughEase, SlowMo, ExpoScaleEase, Draggable, DrawSVGPlugin, Flip, InertiaPlugin,
  MorphSVGPlugin, MotionPathPlugin, Observer, Physics2DPlugin, PhysicsPropsPlugin, ScrambleTextPlugin,
  ScrollTrigger, ScrollToPlugin, SplitText, TextPlugin,
});

const done = new WeakSet();

/** Registers the plugins on `gsap` once (plus any `extra` ones, e.g. GSDevTools). Returns PLUGINS with the extras. */
export function registerAnimatorPlugins(gsap, extra = {}) {
  const all = { ...PLUGINS, ...extra };
  if (!gsap) return all;
  if (Object.keys(extra).length) gsap.registerPlugin(...Object.values(extra));
  if (done.has(gsap)) return all;
  gsap.registerPlugin(
    CustomEase, CustomBounce, CustomWiggle, Draggable, DrawSVGPlugin, Flip, InertiaPlugin, MorphSVGPlugin, MotionPathPlugin,
    Observer, Physics2DPlugin, PhysicsPropsPlugin, ScrambleTextPlugin, ScrollTrigger, ScrollToPlugin,
    SplitText, TextPlugin, RoughEase, SlowMo, ExpoScaleEase,
  );
  done.add(gsap);
  return all;
}

/** The plugins a scene's features use, with what they do: shown in the Studio's "GSAP inside" panel. */
export const PLUGIN_FEATURES = Object.freeze([
  ['Core tweens & timelines', 'Transforms, 3D, colours, filters, clip-path, CSS variables, stagger, repeat / yoyo, labels'],
  ['MorphSVGPlugin', 'Morph any shape into any other shape, a layer or path data'],
  ['DrawSVGPlugin', 'Draw strokes on and off (line art, signatures, outlines)'],
  ['MotionPathPlugin', 'Move along built-in paths, points you drag on the Stage (curviness), any shape layer or path data, with auto-rotate'],
  ['SplitText', 'Animate characters, words or lines, masked reveals'],
  ['TextPlugin', 'Typewriter text replacement'],
  ['ScrambleTextPlugin', 'Decoding / scrambling text'],
  ['Physics2DPlugin', 'Throw with velocity, angle, gravity and friction'],
  ['PhysicsPropsPlugin', 'Velocity, acceleration and friction on any property'],
  ['CustomEase', 'Your own ease curves: a bézier editor or any SVG path'],
  ['CustomBounce', 'Bounces with squash-and-stretch'],
  ['CustomWiggle', 'Wiggles, shakes and jello'],
  ['EasePack', 'RoughEase, SlowMo, ExpoScaleEase'],
  ['Draggable + InertiaPlugin', 'Drag on the Stage and timeline; draggable, flickable layers in scenes'],
  ['Flip', 'Smooth layout changes between Desktop, Tablet and Mobile'],
  ['ScrollTrigger', 'Play, scrub or pin a scene with the page scroll'],
  ['Observer', 'Swipe, wheel and keyboard navigation of slideshows'],
  ['ScrollToPlugin', 'Scroll the page from a scene interaction'],
  ['GSDevTools', 'Inspect a scene\'s timeline in the preview'],
]);
