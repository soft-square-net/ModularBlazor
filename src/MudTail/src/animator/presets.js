// MudTail Animator: one-click animation presets. Each makes a clip (type + vars + params + ease) for a layer; the
// Studio drops it at the playhead. Together they cover GSAP's core and every plugin the Animator uses.

import { createClip } from './scene.js';
import { withDefaults } from './effects.js';

const P = (id, label, group, type, fields, kinds = null) => ({ id, label, group, type, kinds, fields });

/** The preset library: { id, label, group, type, kinds?, fields(layer, view) | object }. */
export const PRESETS = Object.freeze([
  // ── entrances ──
  P('fade-in', 'Fade in', 'Enter', 'tween', { from: { opacity: 0 }, duration: 0.8, ease: 'power1.out' }),
  P('fade-up', 'Fade up', 'Enter', 'tween', { from: { opacity: 0, y: 60 }, duration: 0.9, ease: 'power3.out' }),
  P('fade-down', 'Fade down', 'Enter', 'tween', { from: { opacity: 0, y: -60 }, duration: 0.9, ease: 'power3.out' }),
  P('slide-left', 'Slide in from left', 'Enter', 'tween', (l, v) => ({ from: { x: -(l.props.x + l.props.width + 40) }, duration: 1, ease: 'expo.out' })),
  P('slide-right', 'Slide in from right', 'Enter', 'tween', (l, v) => ({ from: { x: v.width - l.props.x + 40 }, duration: 1, ease: 'expo.out' })),
  P('pop', 'Pop in', 'Enter', 'tween', { from: { scale: 0, opacity: 0 }, duration: 0.6, ease: 'back.out(2)' }),
  P('elastic', 'Elastic in', 'Enter', 'tween', { from: { scale: 0 }, duration: 1.4, ease: 'elastic.out(1, 0.35)' }),
  P('zoom-in', 'Zoom in (from big)', 'Enter', 'tween', { from: { scale: 2.2, opacity: 0, blur: 12 }, duration: 1, ease: 'power3.out' }),
  P('blur-in', 'Blur in', 'Enter', 'tween', { from: { opacity: 0, blur: 20, scale: 1.08 }, duration: 1.1, ease: 'power2.out' }),
  P('flip-x', 'Flip in (3D X)', 'Enter', 'tween', { from: { rotationX: -95, opacity: 0, transformPerspective: 800 }, duration: 1, ease: 'back.out(1.4)', params: { transformOrigin: '50% 0%' } }),
  P('flip-y', 'Flip in (3D Y)', 'Enter', 'tween', { from: { rotationY: 120, opacity: 0, transformPerspective: 900 }, duration: 1.1, ease: 'power3.out' }),
  P('rotate-in', 'Rotate in', 'Enter', 'tween', { from: { rotation: -180, scale: 0.2, opacity: 0 }, duration: 1, ease: 'back.out(1.6)' }),
  P('swing-in', 'Swing in', 'Enter', 'tween', { from: { rotation: -70, opacity: 0 }, duration: 1.4, ease: 'elastic.out(1, 0.4)', params: { transformOrigin: '50% 0%' } }),
  P('light-speed', 'Light speed', 'Enter', 'tween', (l, v) => ({ from: { x: v.width - l.props.x, skewX: -40, opacity: 0 }, duration: 0.9, ease: 'power4.out' })),
  P('wipe-right', 'Wipe reveal →', 'Enter', 'tween', { from: { clipPath: 'inset(0% 100% 0% 0%)' }, to: { clipPath: 'inset(0% 0% 0% 0%)' }, duration: 1, ease: 'power3.inOut' }),
  P('wipe-up', 'Wipe reveal ↑', 'Enter', 'tween', { from: { clipPath: 'inset(100% 0% 0% 0%)' }, to: { clipPath: 'inset(0% 0% 0% 0%)' }, duration: 1, ease: 'power3.inOut' }),
  P('iris', 'Circle reveal', 'Enter', 'tween', { from: { clipPath: 'circle(0% at 50% 50%)' }, to: { clipPath: 'circle(75% at 50% 50%)' }, duration: 1.2, ease: 'power2.inOut' }),
  P('diamond', 'Diamond reveal', 'Enter', 'tween', { from: { clipPath: 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)' }, to: { clipPath: 'polygon(50% -50%, 150% 50%, 50% 150%, -50% 50%)' }, duration: 1.1, ease: 'power2.inOut' }),
  P('drop-bounce', 'Drop & bounce', 'Enter', 'bounce', { duration: 1.6, params: { height: 360, strength: 0.65, squash: 2.5 } }),

  // ── exits ──
  P('fade-out', 'Fade out', 'Exit', 'tween', { to: { opacity: 0 }, duration: 0.6, ease: 'power1.in' }),
  P('fly-up', 'Fly up & out', 'Exit', 'tween', { to: { y: -200, opacity: 0 }, duration: 0.8, ease: 'power3.in' }),
  P('zoom-out', 'Zoom out', 'Exit', 'tween', { to: { scale: 0, opacity: 0 }, duration: 0.6, ease: 'back.in(2)' }),
  P('blur-out', 'Blur out', 'Exit', 'tween', { to: { blur: 20, opacity: 0 }, duration: 0.8, ease: 'power2.in' }),
  P('wipe-out', 'Wipe hide →', 'Exit', 'tween', { from: { clipPath: 'inset(0% 0% 0% 0%)' }, to: { clipPath: 'inset(0% 0% 0% 100%)' }, duration: 0.8, ease: 'power3.inOut' }),
  P('fall', 'Fall away (physics)', 'Exit', 'physics2D', { duration: 1.6, params: { velocity: 350, angle: -70, gravity: 1400, spin: 160 } }),
  P('slide-out-right', 'Slide out right', 'Exit', 'tween', (l, v) => ({ to: { x: v.width - l.props.x + 40 }, duration: 0.8, ease: 'power3.in' })),

  // ── emphasis & loops ──
  P('pulse', 'Pulse (loop)', 'Loop', 'tween', { to: { scale: 1.08 }, duration: 0.6, ease: 'sine.inOut', repeat: -1, yoyo: true }),
  P('heartbeat', 'Heartbeat (loop)', 'Loop', 'tween', { to: { scale: 1.18 }, duration: 0.9, repeat: -1, repeatDelay: 0.3, ease: { kind: 'custom', path: 'M0,0 C0.08,0.6 0.12,1 0.2,1 0.3,1 0.32,0.1 0.42,0.1 0.5,0.1 0.52,0.7 0.6,0.7 0.7,0.7 0.8,0 1,0' } }),
  P('float', 'Float (loop)', 'Loop', 'tween', { to: { y: -18 }, duration: 1.8, ease: 'sine.inOut', repeat: -1, yoyo: true }),
  P('spin', 'Spin (loop)', 'Loop', 'tween', { to: { rotation: 360 }, duration: 3, ease: 'none', repeat: -1 }),
  P('sway', 'Sway (loop)', 'Loop', 'tween', { from: { rotation: -6 }, to: { rotation: 6 }, duration: 1.4, ease: 'sine.inOut', repeat: -1, yoyo: true }),
  P('hue-cycle', 'Colour cycle (loop)', 'Loop', 'tween', { from: { hue: 0 }, to: { hue: 360 }, duration: 4, ease: 'none', repeat: -1 }),
  P('glow', 'Glow (loop)', 'Loop', 'tween', { to: { boxShadow: '0 0 40px 12px rgba(99,102,241,.75)' }, duration: 1, ease: 'sine.inOut', repeat: -1, yoyo: true }),
  P('rubber', 'Rubber band', 'Emphasis', 'tween', { to: { keyframes: [{ scaleX: 1.25, scaleY: 0.75 }, { scaleX: 0.75, scaleY: 1.25 }, { scaleX: 1.15, scaleY: 0.85 }, { scaleX: 0.95, scaleY: 1.05 }, { scaleX: 1, scaleY: 1 }] }, duration: 0.9, ease: 'none' }),
  P('tada', 'Tada', 'Emphasis', 'tween', { to: { keyframes: [{ scale: 0.9, rotation: -3 }, { scale: 1.1, rotation: 3 }, { rotation: -3 }, { rotation: 3 }, { scale: 1, rotation: 0 }] }, duration: 1, ease: 'none' }),
  P('wobble', 'Wobble', 'Emphasis', 'wiggle', { duration: 1.2, params: { prop: 'rotation', amount: 14, wiggles: 7, type: 'easeOut' } }),
  P('shake', 'Shake', 'Emphasis', 'wiggle', { duration: 0.8, params: { prop: 'x', amount: 18, wiggles: 9, type: 'easeOut' } }),
  P('jello', 'Jello', 'Emphasis', 'wiggle', { duration: 1.2, params: { prop: 'skewX', amount: 14, wiggles: 6, type: 'easeOut' } }),
  P('nudge', 'Anticipate nudge', 'Emphasis', 'wiggle', { duration: 0.8, params: { prop: 'x', amount: 30, wiggles: 1, type: 'anticipate' } }),
  P('glitch', 'Glitch (rough)', 'Emphasis', 'tween', { from: { x: 0 }, to: { x: 10 }, duration: 0.8, ease: { kind: 'rough', strength: 3, points: 30, taper: 'none', randomize: true, clamp: false, template: 'none' } }),

  // ── text ──
  P('type', 'Typewriter', 'Text', 'typewriter', { duration: 2, ease: 'none', params: { cursor: true, fromEmpty: true } }, ['text']),
  P('scramble', 'Scramble decode', 'Text', 'scramble', { duration: 1.6, params: { chars: 'upperCase', revealDelay: 0.3, speed: 0.4 } }, ['text']),
  P('scramble-bin', 'Binary decode', 'Text', 'scramble', { duration: 1.8, params: { chars: '01', revealDelay: 0.4, speed: 0.6 } }, ['text']),
  P('chars-up', 'Characters rise (masked)', 'Text', 'split', { from: { yPercent: 110 }, duration: 0.8, ease: 'power4.out', stagger: { each: 0.03 }, params: { split: 'chars', mask: true } }, ['text', 'html']),
  P('chars-3d', 'Characters flip 3D', 'Text', 'split', { from: { rotationX: -90, opacity: 0, transformPerspective: 600, yPercent: 50 }, duration: 0.9, ease: 'back.out(1.7)', stagger: { each: 0.04 }, params: { split: 'chars' } }, ['text', 'html']),
  P('chars-random', 'Characters scatter in', 'Text', 'split', { from: { opacity: 0, scale: 3, blur: 8 }, duration: 0.7, ease: 'power3.out', stagger: { each: 0.03, from: 'random' }, params: { split: 'chars' } }, ['text', 'html']),
  P('chars-center', 'Characters from centre', 'Text', 'split', { from: { opacity: 0, y: 40, scale: 0.4 }, duration: 0.7, ease: 'back.out(2)', stagger: { each: 0.04, from: 'center' }, params: { split: 'chars' } }, ['text', 'html']),
  P('chars-wave', 'Characters wave (loop)', 'Text', 'split', { to: { y: -16 }, duration: 0.5, ease: 'sine.inOut', repeat: -1, yoyo: true, stagger: { each: 0.06 }, params: { split: 'chars' } }, ['text', 'html']),
  P('words-in', 'Words fade up', 'Text', 'split', { from: { opacity: 0, y: 30 }, duration: 0.7, ease: 'power3.out', stagger: { each: 0.08 }, params: { split: 'words' } }, ['text', 'html']),
  P('lines-mask', 'Lines reveal (masked)', 'Text', 'split', { from: { yPercent: 105 }, duration: 0.9, ease: 'expo.out', stagger: { each: 0.12 }, params: { split: 'lines', mask: true } }, ['text', 'html']),
  P('count-up', 'Count up', 'Text', 'counter', { duration: 2, ease: 'power2.out', params: { from: 0, to: 2500, decimals: 0, separator: true } }, ['text']),
  P('tracking', 'Tracking expand', 'Text', 'tween', { from: { letterSpacing: -12, opacity: 0 }, duration: 1.2, ease: 'power3.out' }, ['text']),

  // ── svg ──
  P('draw-on', 'Draw on', 'SVG', 'draw', { duration: 1.8, ease: 'power2.inOut', params: { from: '0%', to: '100%', fillAfter: true } }, ['shape', 'svg', 'icon']),
  P('draw-center', 'Draw from centre', 'SVG', 'draw', { duration: 1.4, ease: 'power2.inOut', params: { from: '50% 50%', to: '0% 100%', fillAfter: true } }, ['shape', 'svg', 'icon']),
  P('draw-off', 'Erase stroke', 'SVG', 'draw', { duration: 1.2, ease: 'power2.in', params: { from: '0% 100%', to: '100% 100%', fillAfter: false } }, ['shape', 'svg', 'icon']),
  P('draw-snake', 'Snake (loop)', 'SVG', 'draw', { duration: 2, ease: 'none', repeat: -1, params: { from: '0% 10%', to: '90% 100%', fillAfter: false } }, ['shape', 'svg', 'icon']),
  P('morph-star', 'Morph → star', 'SVG', 'morph', { duration: 1.2, ease: 'elastic.out(1, 0.5)', params: { into: 'shape', shape: 'star', points: 5 } }, ['shape', 'svg', 'icon']),
  P('morph-heart', 'Morph → heart', 'SVG', 'morph', { duration: 1.2, ease: 'back.inOut(1.7)', params: { into: 'shape', shape: 'heart' }, to: { fill: '#f43f5e' } }, ['shape', 'svg', 'icon']),
  P('morph-circle', 'Morph → circle', 'SVG', 'morph', { duration: 1, ease: 'power3.inOut', params: { into: 'shape', shape: 'ellipse' } }, ['shape', 'svg', 'icon']),
  P('morph-blob', 'Morph → blob (loop)', 'SVG', 'morph', { duration: 2.4, ease: 'sine.inOut', repeat: -1, yoyo: true, params: { into: 'shape', shape: 'blob', type: 'rotational' } }, ['shape', 'svg', 'icon']),
  P('parts-in', 'SVG parts stagger in', 'SVG', 'tween', { from: { opacity: 0, scale: 0, transformOrigin: '50% 50%' }, duration: 0.6, ease: 'back.out(2)', stagger: { each: 0.05, from: 'random' }, params: { targets: 'parts' } }, ['svg', 'icon']),

  // ── motion ──
  P('path-arc', 'Arc path', 'Motion', 'motionPath', { duration: 2, ease: 'power1.inOut', params: { source: 'preset', preset: 'arc', width: 600, height: 220, autoRotate: true } }),
  P('path-wave', 'Wave path', 'Motion', 'motionPath', { duration: 3, ease: 'none', params: { source: 'preset', preset: 'wave', width: 800, height: 120, autoRotate: true } }),
  P('path-loop', 'Loop-the-loop', 'Motion', 'motionPath', { duration: 2.5, ease: 'power1.inOut', params: { source: 'preset', preset: 'loop', width: 700, height: 320, autoRotate: true } }),
  P('path-orbit', 'Orbit (loop)', 'Motion', 'motionPath', { duration: 4, ease: 'none', repeat: -1, params: { source: 'preset', preset: 'circle', width: 300, height: 300 } }),
  P('path-figure8', 'Figure eight (loop)', 'Motion', 'motionPath', { duration: 5, ease: 'none', repeat: -1, params: { source: 'preset', preset: 'figure8', width: 500, height: 200, autoRotate: true } }),
  P('path-bounces', 'Bouncing path', 'Motion', 'motionPath', { duration: 2.4, ease: 'none', params: { source: 'preset', preset: 'bounce', width: 800, height: 260 } }),
  P('path-points', 'Custom points path', 'Motion', 'motionPath', { duration: 2.5, ease: 'power1.inOut', params: { source: 'points', points: [[0, 0], [160, -160], [340, -40], [520, -200], [700, 0]], curviness: 1.5, autoRotate: false } }),
  P('fly-across', 'Fly across', 'Motion', 'tween', (l, v) => ({ from: { x: -(l.props.x + l.props.width) }, to: { x: v.width - l.props.x }, duration: 4, ease: 'none' })),

  // ── physics ──
  P('throw', 'Throw (gravity)', 'Physics', 'physics2D', { duration: 2, params: { velocity: 700, angle: -60, gravity: 900, spin: 360 } }),
  P('coast', 'Coast to a stop', 'Physics', 'physicsProps', { duration: 2.5, params: { vx: 500, vy: 0, vr: 180, friction: 0.15 } }),
  P('jump', 'Jump & squash', 'Physics', 'bounce', { duration: 1.2, repeat: -1, params: { height: 180, strength: 0.4, squash: 2, endAtStart: true } }),

  // ── cartoon ──
  P('blink', 'Blink (loop)', 'Cartoon', 'tween', { to: { scaleY: 0.08 }, duration: 0.12, ease: 'power1.in', repeat: -1, yoyo: true, repeatDelay: 2.4, params: { transformOrigin: '50% 50%' } }),
  P('wave-hand', 'Wave (loop)', 'Cartoon', 'tween', { from: { rotation: -20 }, to: { rotation: 25 }, duration: 0.35, ease: 'sine.inOut', repeat: -1, yoyo: true, params: { transformOrigin: '50% 100%' } }),
  P('bob', 'Walk bob (loop)', 'Cartoon', 'tween', { to: { y: -10, rotation: 2 }, duration: 0.3, ease: 'sine.inOut', repeat: -1, yoyo: true }),
  P('stretch', 'Squash & stretch (loop)', 'Cartoon', 'tween', { from: { scaleX: 1.15, scaleY: 0.85 }, to: { scaleX: 0.9, scaleY: 1.12 }, duration: 0.4, ease: 'sine.inOut', repeat: -1, yoyo: true, params: { transformOrigin: '50% 100%' } }),
  P('step-frames', 'Stepped (sprite feel)', 'Cartoon', 'tween', { to: { rotation: 360 }, duration: 2, repeat: -1, ease: { kind: 'steps', steps: 8 } }),
  P('head-turn', 'Head turn 3D', 'Cartoon', 'tween', { to: { rotationY: 35, transformPerspective: 600 }, duration: 0.7, ease: 'power2.inOut', repeat: 1, yoyo: true, repeatDelay: 0.6 }),

  // ── camera & 3D ──
  P('ken-burns', 'Ken Burns', 'Camera', 'tween', { from: { scale: 1 }, to: { scale: 1.22, x: -30, y: -12 }, duration: 6, ease: 'none' }, ['image', 'video', 'group', 'svg']),
  P('dolly', 'Dolly zoom (expo scale)', 'Camera', 'tween', { from: { scale: 1 }, to: { scale: 3 }, duration: 3, ease: { kind: 'expoScale', start: 1, end: 3, ease: 'power1.inOut' } }),
  P('card-flip', 'Card flip 180°', 'Camera', 'tween', { to: { rotationY: 180, transformPerspective: 1000 }, duration: 1.2, ease: 'power3.inOut' }),
  P('tilt-in', 'Tilt in (3D)', 'Camera', 'tween', { from: { rotationX: 45, rotationY: -25, z: -300, opacity: 0, transformPerspective: 1000 }, duration: 1.4, ease: 'power3.out' }),
  P('slow-mo', 'Slow-motion pass', 'Camera', 'tween', (l, v) => ({ from: { x: -(l.props.x + l.props.width) }, to: { x: v.width - l.props.x }, duration: 4, ease: { kind: 'slow', ratio: 0.7, power: 0.7, yoyo: false } })),

  // ── groups (stagger) ──
  P('kids-up', 'Children stagger up', 'Stagger', 'tween', { from: { opacity: 0, y: 50 }, duration: 0.7, ease: 'power3.out', stagger: { each: 0.12 }, params: { targets: 'children' } }, ['group']),
  P('kids-pop', 'Children pop from centre', 'Stagger', 'tween', { from: { opacity: 0, scale: 0 }, duration: 0.6, ease: 'back.out(2)', stagger: { each: 0.08, from: 'center' }, params: { targets: 'children' } }, ['group']),
  P('kids-random', 'Children random spin in', 'Stagger', 'tween', { from: { opacity: 0, rotation: 'random(-180, 180)', scale: 0.3 }, duration: 0.8, ease: 'power3.out', stagger: { each: 0.06, from: 'random' }, params: { targets: 'children' } }, ['group']),
  P('kids-grid', 'Children grid ripple', 'Stagger', 'tween', { from: { opacity: 0, scale: 0.2 }, duration: 0.6, ease: 'power2.out', stagger: { amount: 0.8, from: 'center', grid: 'auto' }, params: { targets: 'children' } }, ['group']),

  // ── canvas & media ──
  P('canvas-ramp', 'Ramp up particles', 'Canvas', 'canvas', { from: { count: 0, speed: 0.1 }, to: { count: 120, speed: 1.4 }, duration: 3, ease: 'power2.out' }, ['canvas']),
  P('canvas-colour', 'Shift colours', 'Canvas', 'canvas', { to: { color: '#f43f5e', color2: '#facc15' }, duration: 3, ease: 'sine.inOut', repeat: -1, yoyo: true }, ['canvas']),
  P('media-play', 'Play media here', 'Media', 'media', { duration: 0.1, params: { action: 'play' } }, ['video', 'audio']),
  P('media-fade', 'Fade audio in', 'Media', 'tween', { from: { volume: 0 }, to: { volume: 1 }, duration: 2, ease: 'none' }, ['video', 'audio']),
]);

/** Presets grouped for the library panel, filtered to a layer kind: [[group, presets], …]. */
export function presetGroups(kind = null) {
  const groups = new Map();
  for (const p of PRESETS) {
    if (kind && p.kinds && !p.kinds.includes(kind)) continue;
    if (kind === 'group' && p.type !== 'tween' && p.type !== 'motionPath' && p.type !== 'physics2D' && p.type !== 'bounce' && p.type !== 'wiggle') continue;
    if (!groups.has(p.group)) groups.set(p.group, []);
    groups.get(p.group).push(p);
  }
  return [...groups];
}

/** A clip from a preset for a layer in a view, starting at `start` seconds. */
export function clipFromPreset(id, layer, view, start = 0) {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return null;
  const fields = typeof preset.fields === 'function' ? preset.fields(layer, view) : preset.fields;
  const clip = createClip(preset.type, { ...JSON.parse(JSON.stringify(fields)), start, name: preset.label });
  clip.params = withDefaults(preset.type, clip.params);
  return clip;
}
