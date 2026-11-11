// MudTail Animator: eases. A clip's ease is a GSAP ease string ('power3.out', 'elastic.out(1, 0.3)', 'steps(6)') or
// an object for the ease plugins:
//   { kind: 'bezier', x1, y1, x2, y2 }                    CustomEase from a cubic-bezier (the Studio's curve editor)
//   { kind: 'custom', path: 'M0,0 C…' }                    CustomEase from SVG path data (any shape, overshoots too)
//   { kind: 'wiggle', wiggles: 6, type: 'easeOut' }        CustomWiggle (types: easeOut, easeInOut, anticipate, uniform, random)
//   { kind: 'bounce', strength: 0.6, squash: 2 }           CustomBounce
//   { kind: 'rough', strength: 1, points: 20, taper: 'none', randomize: true, clamp: false, template: 'none' }  EasePack RoughEase
//   { kind: 'slow', ratio: 0.7, power: 0.7, yoyo: false }   EasePack SlowMo
//   { kind: 'expoScale', start: 1, end: 3, ease: 'none' }  EasePack ExpoScaleEase (for zooms that feel linear)
//   { kind: 'steps', steps: 8 }

export const EASE_FAMILIES = Object.freeze(['power1', 'power2', 'power3', 'power4', 'sine', 'expo', 'circ', 'back', 'elastic', 'bounce']);
export const EASE_DIRECTIONS = Object.freeze(['in', 'out', 'inOut']);

/** The ease names for a picker: none, then family.direction for every family. */
export const EASE_NAMES = Object.freeze(['none', ...EASE_FAMILIES.flatMap((fam) => EASE_DIRECTIONS.map((d) => `${fam}.${d}`))]);

/** Plugin ease kinds, with labels and default parameters (the Studio builds their editors from this). */
export const EASE_KINDS = Object.freeze({
  bezier: { label: 'Cubic bézier (CustomEase)', defaults: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 } },
  custom: { label: 'Custom path (CustomEase)', defaults: { path: 'M0,0 C0.14,0 0.24,1.18 0.5,1.1 0.7,1.03 0.8,1 1,1' } },
  wiggle: { label: 'Wiggle (CustomWiggle)', defaults: { wiggles: 6, type: 'easeOut' } },
  bounce: { label: 'Bounce (CustomBounce)', defaults: { strength: 0.6, squash: 2, endAtStart: false } },
  rough: { label: 'Rough (EasePack)', defaults: { strength: 1, points: 20, taper: 'none', randomize: true, clamp: false, template: 'none' } },
  slow: { label: 'Slow motion (EasePack)', defaults: { ratio: 0.7, power: 0.7, yoyo: false } },
  expoScale: { label: 'Exponential scale (EasePack)', defaults: { start: 1, end: 3, ease: 'none' } },
  steps: { label: 'Steps', defaults: { steps: 8 } },
});

export const WIGGLE_TYPES = Object.freeze(['easeOut', 'easeInOut', 'anticipate', 'uniform', 'random']);

/** A stable key for an ease spec (used to name and cache the plugin eases). */
export function easeKey(spec) {
  if (spec == null || spec === '') return 'none';
  if (typeof spec === 'string') return spec;
  const kind = spec.kind ?? 'custom';
  const params = { ...(EASE_KINDS[kind]?.defaults ?? {}), ...spec };
  delete params.kind;
  const body = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join(';');
  let h = 2166136261;
  for (let i = 0; i < body.length; i++) { h ^= body.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `mud-${kind}-${(h >>> 0).toString(36)}`;
}

/** The SVG path of a cubic-bezier ease, for CustomEase. */
export function bezierPath({ x1 = 0.25, y1 = 0.1, x2 = 0.25, y2 = 1 } = {}) {
  return `M0,0 C${x1},${y1} ${x2},${y2} 1,1`;
}

/** A CSS-like cubic-bezier as text, or null when the spec is not a bezier. */
export function bezierText(spec) {
  return spec?.kind === 'bezier' ? `cubic-bezier(${spec.x1}, ${spec.y1}, ${spec.x2}, ${spec.y2})` : null;
}

/** A readable label for an ease spec. */
export function easeLabel(spec) {
  if (!spec || typeof spec === 'string') return spec || 'none';
  return EASE_KINDS[spec.kind]?.label ?? 'Custom';
}

const cache = new Map();

/**
 * The GSAP ease for a spec: a string GSAP parses itself, or an ease function made with the ease plugins (which must be
 * registered on `gsap`: registerAnimatorPlugins does that). Unknown or broken specs fall back to 'none' with a warning.
 */
export function toEase(spec, gsap, plugins = {}) {
  if (spec == null || spec === '') return 'none';
  if (typeof spec === 'string') return spec;
  const key = easeKey(spec);
  if (cache.has(key)) return cache.get(key);
  const p = { ...(EASE_KINDS[spec.kind]?.defaults ?? {}), ...spec };
  let ease = 'none';
  try {
    const { CustomEase, CustomWiggle, CustomBounce, RoughEase, SlowMo, ExpoScaleEase } = plugins;
    switch (spec.kind) {
      case 'bezier': ease = CustomEase.create(key, bezierPath(p)); break;
      case 'custom': ease = CustomEase.create(key, p.path); break;
      case 'wiggle': ease = CustomWiggle.create(key, { wiggles: Math.max(1, Math.round(p.wiggles)), type: p.type }); break;
      case 'bounce': ease = CustomBounce.create(key, { strength: p.strength, squash: p.squash, endAtStart: !!p.endAtStart, squashID: `${key}-squash` }); break;
      case 'rough': ease = RoughEase.config({ strength: p.strength, points: Math.round(p.points), taper: p.taper, randomize: !!p.randomize, clamp: !!p.clamp, template: gsap.parseEase(p.template) }); break;
      case 'slow': ease = SlowMo.config(p.ratio, p.power, !!p.yoyo); break;
      case 'expoScale': ease = ExpoScaleEase.config(p.start, p.end, gsap.parseEase(p.ease)); break;
      case 'steps': ease = `steps(${Math.max(1, Math.round(p.steps))})`; break;
      default: console.warn(`[MudTail Animator] unknown ease kind "${spec.kind}"`);
    }
  } catch (e) {
    console.warn('[MudTail Animator] ease failed, using none', spec, e);
    ease = 'none';
  }
  cache.set(key, ease);
  return ease;
}

/**
 * The squash ease CustomBounce makes alongside a bounce (for scaleY squash-and-stretch on landing), or null.
 * Call after toEase() made the bounce.
 */
export function squashEase(spec, gsap) {
  if (spec?.kind !== 'bounce') return null;
  return gsap.parseEase(`${easeKey(spec)}-squash`) ?? null;
}

/** Samples an ease (function or string) into n+1 [t, value] points, for drawing its curve. */
export function sampleEase(ease, gsap, n = 64) {
  const fn = typeof ease === 'function' ? ease : gsap.parseEase(ease) ?? ((t) => t);
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push([t, fn(t)]); }
  return out;
}
