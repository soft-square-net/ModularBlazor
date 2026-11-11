// MudTail Animator: starter scenes. Each is a function returning a fresh scene, so they double as examples of the
// scene format and show what the plugins do: a slideshow, a cartoon, a logo reveal, a stats board, an interactive card.

import { createScene, createLayer, createClip, addLayer } from './scene.js';
import { clipFromPreset } from './presets.js';

const D = { width: 1280, height: 720 };

function L(scene, kind, props, { name, parent = null, clips = [], views = {}, interactions = [], draggable = null } = {}) {
  const layer = createLayer(kind, props, { name });
  layer.views = views;
  layer.interactions = interactions;
  layer.draggable = draggable;
  addLayer(scene, layer, { parentId: parent });
  for (const c of clips) layer.clips.push(typeof c === 'function' ? c(layer) : c);
  return layer;
}


// ───────────── slideshow ─────────────

function heroSlideshow() {
  const s = createScene({ name: 'Hero slideshow', settings: { duration: 15, background: '#0b1020', mode: 'slides', controls: true, slideHold: 3 } });
  s.labels = [{ id: 'l1', name: 'Breaking', time: 0 }, { id: 'l2', name: 'Sport', time: 5 }, { id: 'l3', name: 'Culture', time: 10 }];
  L(s, 'canvas', { x: 0, y: 0, width: 1280, height: 720, effect: 'particles', count: 70, color: '#93c5fd', color2: '#6366f1', size: 2, speed: 0.6 }, { name: 'Particles' });

  const slides = [
    { t: 0, kicker: 'BREAKING NEWS', title: 'City council approves the new waterfront park', a: '#1d4ed8', b: '#7c3aed', shape: 'blob' },
    { t: 5, kicker: 'SPORT', title: 'Northbridge seal the title in a late thriller', a: '#059669', b: '#0ea5e9', shape: 'burst' },
    { t: 10, kicker: 'CULTURE', title: 'The festival returns with forty new exhibitions', a: '#db2777', b: '#f59e0b', shape: 'star' },
  ];
  for (const sl of slides) {
    const end = sl.t + 5; // exits play when the next slide starts, so a slide stays up while it holds
    const bg = L(s, 'shape', { x: 0, y: 0, width: 1280, height: 720, shape: 'rect', fill: sl.a, fill2: sl.b, gradientAngle: 135, opacity: 0.85 }, { name: `${sl.kicker} background` });
    bg.clips.push(createClip('tween', { start: sl.t ? sl.t + 0.2 : 0, duration: 0.9, from: { clipPath: 'circle(0% at 85% 50%)' }, to: { clipPath: 'circle(150% at 85% 50%)' }, ease: 'power3.inOut', name: 'Iris in' }));
    bg.clips.push(createClip('tween', { start: end, duration: 0.6, to: { opacity: 0 }, ease: 'power1.in', name: 'Out' }));
    const deco = L(s, 'shape', { x: 820, y: 160, width: 380, height: 380, shape: sl.shape, fill: '#ffffff', opacity: 0.18, points: 12 }, { name: `${sl.kicker} shape` });
    deco.clips.push(createClip('tween', { start: sl.t + 0.3, duration: 1.2, from: { scale: 0, rotation: -120 }, ease: 'back.out(1.6)', name: 'Pop' }));
    deco.clips.push(createClip('morph', { start: sl.t + 1.6, duration: 2.2, ease: 'sine.inOut', params: { into: 'shape', shape: 'blob', type: 'rotational' }, name: 'Morph' }));
    deco.clips.push(createClip('tween', { start: end, duration: 0.6, to: { opacity: 0, scale: 0.6 }, ease: 'power2.in', name: 'Out' }));
    const kicker = L(s, 'text', { x: 96, y: 200, width: 700, height: 40, text: sl.kicker, fontSize: 22, fontWeight: 700, letterSpacing: 6, color: '#e0e7ff' }, { name: 'Kicker' });
    kicker.clips.push(createClip('tween', { start: sl.t + 0.3, duration: 0.3, from: { opacity: 0 }, name: 'Show' }));
    kicker.clips.push(Object.assign(clipFromPreset('scramble', kicker, D, sl.t + 0.4), { duration: 1.2 }));
    kicker.clips.push(createClip('tween', { start: end, duration: 0.4, to: { opacity: 0 }, name: 'Out' }));
    const title = L(s, 'text', { x: 96, y: 250, width: 700, height: 200, text: sl.title, fontSize: 60, fontWeight: 800, lineHeight: 1.05, color: '#ffffff' }, { name: 'Headline', views: { mobile: { x: 24, y: 180, width: 342, height: 240, fontSize: 38 } } });
    title.clips.push(Object.assign(clipFromPreset('lines-mask', title, D, sl.t + 0.7)));
    title.clips.push(createClip('tween', { start: end, duration: 0.5, to: { y: -30, opacity: 0 }, ease: 'power2.in', name: 'Out' }));
    const cta = L(s, 'html', { x: 96, y: 480, width: 220, height: 56, html: '<a href="#" style="display:flex;align-items:center;justify-content:center;height:100%;border-radius:999px;background:#fff;color:#111827;font:600 18px/1 Inter,system-ui,sans-serif;text-decoration:none">Read the story →</a>' }, {
      name: 'Button', views: { mobile: { x: 24, y: 470, width: 220, height: 52 } },
      interactions: [{ on: 'hover', action: 'animate', to: { scale: 1.06 } }, { on: 'leave', action: 'animate', to: { scale: 1 } }],
    });
    cta.clips.push(createClip('tween', { start: sl.t + 1.4, duration: 0.6, from: { opacity: 0, y: 24 }, ease: 'power3.out', name: 'In' }));
    cta.clips.push(createClip('tween', { start: end, duration: 0.4, to: { opacity: 0 }, name: 'Out' }));
    if (sl === slides[slides.length - 1]) for (const l of [bg, deco, kicker, title, cta]) l.clips = l.clips.filter((c) => c.name !== 'Out');
  }
  return s;
}

// ───────────── cartoon ─────────────

function cartoon() {
  const s = createScene({ name: 'Cartoon: sunny day', settings: { duration: 8, background: '#7dd3fc', repeat: -1 } });
  L(s, 'shape', { x: 0, y: 0, width: 1280, height: 720, shape: 'rect', fill: '#38bdf8', fill2: '#e0f2fe', gradientAngle: 90 }, { name: 'Sky' });
  const rays = L(s, 'shape', { x: 990, y: 30, width: 240, height: 240, shape: 'burst', points: 18, innerRadius: 0.7, fill: '#fde68a' }, { name: 'Sun rays' });
  rays.clips.push(clipFromPreset('spin', rays, D, 0));
  rays.clips[0].duration = 8;
  const sun = L(s, 'shape', { x: 1040, y: 80, width: 140, height: 140, shape: 'ellipse', fill: '#facc15', fill2: '#f97316', gradientAngle: 120 }, { name: 'Sun' });
  sun.clips.push(clipFromPreset('pulse', sun, D, 0));
  for (const [i, [x, y, w]] of [[80, 90, 220], [460, 50, 180], [760, 150, 150]].entries()) {
    const cloud = L(s, 'shape', { x, y, width: w, height: w * 0.55, shape: 'cloud', fill: '#ffffff', opacity: 0.95 }, { name: `Cloud ${i + 1}` });
    cloud.clips.push(createClip('tween', { start: 0, duration: 8, to: { x: 120 + i * 30 }, ease: 'sine.inOut', repeat: -1, yoyo: true, name: 'Drift' }));
  }
  L(s, 'shape', { x: -100, y: 520, width: 1480, height: 320, shape: 'ellipse', fill: '#4ade80', fill2: '#16a34a', gradientAngle: 90 }, { name: 'Hill' });
  L(s, 'shape', { x: -50, y: 600, width: 1380, height: 160, shape: 'rect', fill: '#22c55e' }, { name: 'Ground' });

  // the character: a group, so it moves as one while its parts animate inside
  const hero = L(s, 'group', { x: 300, y: 380, width: 200, height: 230 }, { name: 'Blob character' });
  hero.clips.push(createClip('bounce', { start: 0.2, duration: 1.4, params: { height: 360, strength: 0.6, squash: 2.5 }, name: 'Drop in' }));
  hero.clips.push(createClip('motionPath', { start: 2, duration: 3, ease: 'power1.inOut', params: { source: 'preset', preset: 'bounce', width: 520, height: 160 }, name: 'Hop across' }));
  hero.clips.push(createClip('wiggle', { start: 5.3, duration: 1, params: { prop: 'rotation', amount: 10, wiggles: 6, type: 'easeOut' }, name: 'Happy wobble' }));
  L(s, 'shape', { x: 0, y: 20, width: 200, height: 210, shape: 'drop', fill: '#a78bfa', fill2: '#7c3aed', gradientAngle: 120 }, { name: 'Body', parent: hero.id });
  for (const [x, nm] of [[52, 'Left eye'], [112, 'Right eye']]) {
    const eye = L(s, 'shape', { x, y: 105, width: 36, height: 44, shape: 'ellipse', fill: '#ffffff' }, { name: nm, parent: hero.id });
    const pupil = L(s, 'shape', { x: x + 11, y: 120, width: 16, height: 18, shape: 'ellipse', fill: '#1e1b4b' }, { name: `${nm} pupil`, parent: hero.id });
    eye.clips.push(clipFromPreset('blink', eye, D, 1.5));
    pupil.clips.push(clipFromPreset('blink', pupil, D, 1.5));
    pupil.clips.push(createClip('tween', { start: 2, duration: 0.5, to: { x: 6 }, repeat: 3, yoyo: true, ease: 'power2.inOut', name: 'Look' }));
  }
  const mouth = L(s, 'shape', { x: 70, y: 165, width: 60, height: 22, shape: 'custom', d: 'M0,0 C25,100 75,100 100,0', fill: '', stroke: '#1e1b4b', strokeWidth: 5 }, { name: 'Smile', parent: hero.id });
  mouth.clips.push(createClip('draw', { start: 1.4, duration: 0.6, ease: 'power2.out', params: { from: '0%', to: '100%', fillAfter: false, targets: 'self' }, name: 'Smile' }));

  const bird = L(s, 'shape', { x: -80, y: 260, width: 70, height: 30, shape: 'custom', d: 'M0,40 C20,0 40,0 50,40 C60,0 80,0 100,40', fill: '', stroke: '#1f2937', strokeWidth: 4 }, { name: 'Bird' });
  bird.clips.push(createClip('motionPath', { start: 0.5, duration: 6, ease: 'none', params: { source: 'preset', preset: 'wave', width: 1450, height: 70 }, name: 'Fly' }));
  bird.clips.push(createClip('tween', { start: 0.5, duration: 0.25, to: { scaleY: 0.4 }, repeat: 23, yoyo: true, ease: 'sine.inOut', name: 'Flap' }));

  const title = L(s, 'text', { x: 320, y: 40, width: 640, height: 80, text: 'Have a sunny day!', fontSize: 64, fontWeight: 900, align: 'center', color: '#1e3a8a', fontFamily: '"Comic Sans MS", "Chalkboard SE", system-ui, sans-serif' }, { name: 'Title', views: { mobile: { fontSize: 34, x: 15, width: 360 } } });
  title.clips.push(createClip('split', { start: 5.5, duration: 0.8, ease: 'back.out(3)', from: { y: -80, opacity: 0, rotation: 'random(-40, 40)' }, stagger: { each: 0.05 }, params: { split: 'chars' }, name: 'Letters drop' }));
  return s;
}

// ───────────── logo reveal ─────────────

function logoReveal() {
  const s = createScene({ name: 'Logo reveal', settings: { duration: 7, background: '#020617' } });
  L(s, 'canvas', { x: 0, y: 0, width: 1280, height: 720, effect: 'stars', count: 160, color: '#e2e8f0', color2: '#a5b4fc', size: 1.6, speed: 0.6 }, { name: 'Starfield' });
  const ring = L(s, 'shape', { x: 520, y: 140, width: 240, height: 240, shape: 'ellipse', fill: '', stroke: '#818cf8', strokeWidth: 6 }, { name: 'Ring' });
  ring.clips.push(createClip('draw', { start: 0.2, duration: 1.4, ease: 'power2.inOut', params: { from: '0%', to: '100%', fillAfter: false, targets: 'self' }, name: 'Draw ring' }));
  ring.clips.push(createClip('tween', { start: 1.6, duration: 0.8, to: { scale: 1.15, opacity: 0.4 }, ease: 'power2.out', name: 'Breathe' }));
  const mark = L(s, 'shape', { x: 560, y: 180, width: 160, height: 160, shape: 'star', points: 5, fill: '#facc15', stroke: '#fde68a', strokeWidth: 3 }, { name: 'Mark' });
  mark.clips.push(createClip('draw', { start: 0.6, duration: 1.4, ease: 'power2.inOut', params: { from: '0%', to: '100%', fillAfter: true, targets: 'self' }, name: 'Draw star' }));
  mark.clips.push(createClip('morph', { start: 2.2, duration: 1, ease: 'back.inOut(1.6)', params: { into: 'shape', shape: 'heart' }, to: { fill: '#f43f5e' }, name: 'Morph to heart' }));
  mark.clips.push(createClip('wiggle', { start: 3.3, duration: 0.8, params: { prop: 'scale', amount: 18, wiggles: 4, type: 'easeOut' }, name: 'Beat' }));
  const name = L(s, 'text', { x: 290, y: 410, width: 700, height: 90, text: 'MUDTAIL', align: 'center', fontSize: 84, fontWeight: 900, letterSpacing: 18, gradient: 'linear-gradient(90deg,#a5b4fc,#f0abfc,#fde68a)' }, { name: 'Wordmark', views: { mobile: { fontSize: 44, letterSpacing: 8 } } });
  name.clips.push(clipFromPreset('chars-3d', name, D, 2.4));
  const tag = L(s, 'text', { x: 290, y: 520, width: 700, height: 40, text: 'ANIMATOR STUDIO', align: 'center', fontSize: 24, fontWeight: 600, letterSpacing: 8, color: '#94a3b8' }, { name: 'Tagline', views: { mobile: { fontSize: 16, letterSpacing: 4 } } });
  tag.clips.push(createClip('tween', { start: 3.5, duration: 0.3, from: { opacity: 0 }, name: 'Show' }));
  tag.clips.push(Object.assign(clipFromPreset('scramble', tag, D, 3.6), { duration: 1.6 }));
  const confetti = L(s, 'canvas', { x: 0, y: 0, width: 1280, height: 720, effect: 'confetti', count: 0, size: 5, speed: 1 }, { name: 'Confetti' });
  confetti.clips.push(createClip('canvas', { start: 4.4, duration: 0.6, to: { count: 140 }, ease: 'power2.out', name: 'Burst' }));
  s.labels = [{ id: 'l1', name: 'reveal', time: 2.2 }];
  return s;
}

// ───────────── stats board ─────────────

function statsBoard() {
  const s = createScene({ name: 'Stats board', settings: { duration: 5, background: '#ffffff', trigger: 'visible' } });
  const title = L(s, 'text', { x: 80, y: 60, width: 1120, height: 70, text: 'Season in numbers', fontSize: 52, fontWeight: 800, color: '#0f172a' }, { name: 'Title', views: { mobile: { fontSize: 32, x: 20, width: 350 } } });
  title.clips.push(clipFromPreset('words-in', title, D, 0));
  const stats = [['Goals', 87, '#6366f1', 'trophy'], ['Wins', 29, '#10b981', 'star'], ['Fans (k)', 412, '#f59e0b', 'user'], ['Clean sheets', 18, '#ef4444', 'shield']];
  const board = L(s, 'group', { x: 80, y: 170, width: 1120, height: 480 }, { name: 'Cards' });
  board.clips.push(createClip('tween', { start: 0.4, duration: 0.7, from: { opacity: 0, y: 60 }, ease: 'power3.out', stagger: { each: 0.12 }, params: { targets: 'children' }, name: 'Cards in' }));
  stats.forEach(([label, value, color, icon], i) => {
    const card = L(s, 'group', { x: i * 285, y: 0, width: 260, height: 460 }, { name: `${label} card`, parent: board.id });
    L(s, 'shape', { x: 0, y: 0, width: 260, height: 460, shape: 'rect', corner: 24, fill: '#f8fafc', stroke: '#e2e8f0', strokeWidth: 2 }, { name: 'Card', parent: card.id });
    const ic = L(s, 'icon', { x: 24, y: 24, width: 56, height: 56, icon, color, strokeWidth: 2 }, { name: 'Icon', parent: card.id });
    ic.clips.push(createClip('draw', { start: 0.8 + i * 0.12, duration: 1, ease: 'power2.inOut', params: { from: '0%', to: '100%', fillAfter: false, targets: 'parts' }, name: 'Draw icon' }));
    const num = L(s, 'text', { x: 24, y: 110, width: 220, height: 80, text: '0', fontSize: 64, fontWeight: 800, color: '#0f172a' }, { name: 'Number', parent: card.id });
    num.clips.push(createClip('counter', { start: 0.9 + i * 0.12, duration: 2, ease: 'power3.out', params: { from: 0, to: value, decimals: 0, separator: true }, name: 'Count' }));
    L(s, 'text', { x: 24, y: 196, width: 220, height: 30, text: label, fontSize: 20, fontWeight: 600, color: '#64748b' }, { name: 'Label', parent: card.id });
    const track = L(s, 'shape', { x: 24, y: 400, width: 212, height: 14, shape: 'rect', corner: 7, fill: '#e2e8f0' }, { name: 'Track', parent: card.id });
    const bar = L(s, 'shape', { x: 24, y: 400, width: 212, height: 14, shape: 'rect', corner: 7, fill: color }, { name: 'Bar', parent: card.id });
    bar.clips.push(createClip('tween', { start: 1 + i * 0.12, duration: 1.6, from: { scaleX: 0 }, to: { scaleX: 0.35 + (value % 60) / 100 }, ease: 'expo.out', params: { transformOrigin: '0% 50%' }, name: 'Grow' }));
    void track;
  });
  return s;
}

// ───────────── interactive ─────────────

function interactive() {
  const s = createScene({ name: 'Interactive playground', settings: { duration: 3, background: '#111827', trigger: 'load' } });
  const hint = L(s, 'text', { x: 80, y: 60, width: 1120, height: 60, text: 'Drag the shapes. Click the star. Hover the button.', fontSize: 34, fontWeight: 700, color: '#f9fafb', align: 'center' }, { name: 'Hint', views: { mobile: { fontSize: 22, x: 15, width: 360, height: 90 } } });
  hint.clips.push(clipFromPreset('type', hint, D, 0));
  const colors = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
  const shapes = ['ellipse', 'triangle', 'rect', 'diamond', 'blob'];
  shapes.forEach((shape, i) => {
    const l = L(s, 'shape', { x: 140 + i * 210, y: 260, width: 130, height: 130, shape, fill: colors[i], corner: 24 }, { name: `Draggable ${shape}`, draggable: { type: 'x,y', inertia: true, bounds: true } });
    l.clips.push(createClip('tween', { start: 0.3 + i * 0.1, duration: 0.8, from: { scale: 0, rotation: -90 }, ease: 'back.out(2)', name: 'In' }));
  });
  const star = L(s, 'shape', { x: 570, y: 470, width: 140, height: 140, shape: 'star', fill: '#facc15', cursor: 'pointer' }, {
    name: 'Click star', interactions: [{ on: 'click', action: 'restart' }],
  });
  star.clips.push(createClip('tween', { start: 1, duration: 2, to: { rotation: 360 }, ease: 'elastic.out(1, 0.4)', name: 'Spin' }));
  L(s, 'html', { x: 1000, y: 520, width: 200, height: 60, html: '<button style="width:100%;height:100%;border:0;border-radius:14px;background:#6366f1;color:#fff;font:600 18px Inter,system-ui,sans-serif;cursor:pointer">Hover me</button>' }, {
    name: 'Hover button', interactions: [{ on: 'hover', action: 'animate', to: { scale: 1.12, rotation: -3 } }, { on: 'leave', action: 'animate', to: { scale: 1, rotation: 0 } }],
  });
  return s;
}

/** The starter scenes: [{ id, name, description, create() }]. */
export const TEMPLATES = Object.freeze([
  { id: 'blank', name: 'Blank scene', description: 'An empty stage with Desktop, Tablet and Mobile views.', create: () => createScene({ name: 'Untitled scene' }) },
  { id: 'slideshow', name: 'Hero slideshow', description: 'Slides with labels, iris reveals, masked lines, scramble text, morphing shapes, particles.', create: heroSlideshow },
  { id: 'cartoon', name: 'Cartoon: sunny day', description: 'A character built from shapes: squash & bounce, blink, motion paths, wiggles, drawn smile.', create: cartoon },
  { id: 'logo', name: 'Logo reveal', description: 'Draw-on strokes, morph star → heart, 3D characters, scramble, starfield and confetti.', create: logoReveal },
  { id: 'stats', name: 'Stats board', description: 'Counters, staggered cards, drawn icons and growing bars; plays when scrolled into view.', create: statsBoard },
  { id: 'interactive', name: 'Interactive playground', description: 'Draggable shapes with inertia, a click-to-replay star and hover effects.', create: interactive },
]);

/** A new scene from a template id (blank when unknown). */
export function sceneFromTemplate(id) {
  return (TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]).create();
}

