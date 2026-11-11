// MudTail Animator Studio: the ease editor. Pick any GSAP ease or a plugin ease (CustomEase bézier or path,
// CustomWiggle, CustomBounce, RoughEase, SlowMo, ExpoScaleEase, steps); its curve is drawn live, and a bézier's two
// handles are dragged on the curve (GSAP Draggable).

import { EASE_NAMES, EASE_FAMILIES, EASE_KINDS, WIGGLE_TYPES, toEase, sampleEase, easeKey } from '../eases.js';
import { h, control, row } from './dom.js';

const SIZE = 180;
const PAD = 26;

/** Builds the editor. value: an ease spec; onChange(spec, { final }). */
export function easeEditor(S, value, onChange) {
  const { gsap, plugins, T } = S;
  const wrap = h('div.mud-anim-ease');
  let spec = value ?? 'power2.out';
  let handles = [];

  const kindOf = (s) => (typeof s === 'string' ? 'named' : s?.kind ?? 'named');

  function draw(canvas) {
    const g = canvas.getContext('2d');
    if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = SIZE * dpr; canvas.height = SIZE * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    const inner = SIZE - PAD * 2;
    const css = getComputedStyle(wrap);
    g.strokeStyle = css.getPropertyValue('--mud-palette-lines-default') || '#ccc';
    g.lineWidth = 1;
    g.strokeRect(PAD, PAD, inner, inner);
    g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(PAD, PAD + inner); g.lineTo(PAD + inner, PAD); g.stroke();
    g.setLineDash([]);
    let ease;
    try { ease = toEase(spec, gsap, plugins); } catch { ease = 'none'; }
    const pts = sampleEase(ease, gsap, 120);
    g.strokeStyle = css.getPropertyValue('--mud-palette-primary') || '#6366f1';
    g.lineWidth = 2.5;
    g.beginPath();
    pts.forEach(([t, v], i) => { const x = PAD + t * inner; const y = PAD + (1 - v) * inner; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
  }

  function render() {
    for (const d of handles) d.kill();
    handles = [];
    const kind = kindOf(spec);
    const kindSelect = h('select.mud-anim-input', {}, [
      h('option', { value: 'named' }, T('ease.named', 'Standard GSAP ease')),
      ...Object.entries(EASE_KINDS).map(([k, v]) => h('option', { value: k }, v.label)),
    ]);
    kindSelect.value = kind;
    kindSelect.addEventListener('change', () => {
      spec = kindSelect.value === 'named' ? 'power2.out' : { kind: kindSelect.value, ...EASE_KINDS[kindSelect.value].defaults };
      onChange(spec, { final: true });
      render();
    });

    const canvas = h('canvas.mud-anim-ease__curve', { width: SIZE, height: SIZE, style: { width: `${SIZE}px`, height: `${SIZE}px` } });
    const curveBox = h('div.mud-anim-ease__box', { style: { width: `${SIZE}px`, height: `${SIZE}px` } }, canvas);
    const fields = h('div.mud-anim-ease__fields');

    if (kind === 'named') {
      const name = typeof spec === 'string' ? spec : 'power2.out';
      const [fam, dir] = name.includes('.') ? name.split('.') : [name, ''];
      const base = (dir ?? '').replace(/\(.*\)$/, '');
      const params = /\((.*)\)/.exec(name)?.[1] ?? '';
      const famSel = control({ type: 'select', options: [['none', 'none (linear)'], ...EASE_FAMILIES.map((f) => [f, f])] }, EASE_FAMILIES.includes(fam) ? fam : 'none', (v) => set(v === 'none' ? 'none' : `${v}.${base || 'out'}`));
      const dirSel = control({ type: 'select', options: [['in', 'in'], ['out', 'out'], ['inOut', 'inOut']] }, base || 'out', (v) => set(fam === 'none' ? 'none' : `${fam}.${v}${params ? `(${params})` : ''}`));
      const raw = control({ type: 'text', placeholder: 'elastic.out(1, 0.3)' }, name, (v, { final }) => { if (final) set(v || 'none'); });
      const quick = h('div.mud-anim-ease__quick', {}, ['power2.out', 'power4.inOut', 'expo.out', 'back.out(1.7)', 'elastic.out(1, 0.3)', 'bounce.out', 'sine.inOut', 'circ.inOut', 'none'].map((e) =>
        h('button.mud-anim-chipbtn', { type: 'button', onclick: () => set(e), 'aria-pressed': String(e === name) }, e)));
      fields.append(row(T('ease.family', 'Family'), famSel), row(T('ease.direction', 'Direction'), dirSel), row(T('ease.text', 'Ease'), raw, { hint: T('ease.textHint', 'Any GSAP ease string, e.g. back.out(3), elastic.inOut(1.2, 0.4), steps(6)') }), quick);
      void EASE_NAMES;
    } else if (kind === 'bezier') {
      for (const key of ['x1', 'y1', 'x2', 'y2']) fields.append(row(key, control({ type: 'number', step: 0.01 }, spec[key], (v, o) => { spec = { ...spec, [key]: v }; onChange(spec, o); draw(canvas); placeHandles(); })));
      fields.append(h('p.mud-anim-note', {}, T('ease.bezierHint', 'Drag the two handles on the curve. Values outside 0–1 on Y overshoot.')));
      const hs = ['1', '2'].map((n) => {
        const knob = h(`span.mud-anim-ease__handle.is-${n}`);
        curveBox.append(knob);
        return knob;
      });
      const line1 = h('span.mud-anim-ease__arm.is-1'); const line2 = h('span.mud-anim-ease__arm.is-2');
      curveBox.prepend(line1, line2);
      const inner = SIZE - PAD * 2;
      const toPx = (x, y) => [PAD + x * inner, PAD + (1 - y) * inner];
      const arm = (el, ax, ay, bx, by) => { const len = Math.hypot(bx - ax, by - ay); Object.assign(el.style, { left: `${ax}px`, top: `${ay}px`, width: `${len}px`, rotate: `${Math.atan2(by - ay, bx - ax)}rad` }); };
      function placeHandles() {
        const [ax, ay] = toPx(spec.x1, spec.y1); const [bx, by] = toPx(spec.x2, spec.y2);
        gsap.set(hs[0], { x: ax, y: ay }); gsap.set(hs[1], { x: bx, y: by });
        arm(line1, PAD, PAD + inner, ax, ay); arm(line2, PAD + inner, PAD, bx, by);
      }
      placeHandles();
      if (plugins?.Draggable) {
        hs.forEach((knob, i) => {
          const [d] = plugins.Draggable.create(knob, {
            type: 'x,y', bounds: { minX: PAD, maxX: PAD + inner, minY: 0, maxY: SIZE },
            onDrag() {
              const x = Math.round(((this.x - PAD) / inner) * 100) / 100; const y = Math.round((1 - (this.y - PAD) / inner) * 100) / 100;
              spec = { ...spec, [`x${i + 1}`]: x, [`y${i + 1}`]: y };
              onChange(spec, { final: false });
              draw(canvas); placeHandles();
            },
            onRelease() { onChange(spec, { final: true }); render(); },
          });
          handles.push(d);
        });
      }
    } else if (kind === 'custom') {
      fields.append(row(T('ease.path', 'SVG path (0,0 → 1,1)'), control({ type: 'textarea' }, spec.path, (v, o) => { if (o.final) { spec = { ...spec, path: v }; onChange(spec, o); render(); } }), { wide: true }));
    } else if (kind === 'wiggle') {
      fields.append(
        row(T('ease.wiggles', 'Wiggles'), control({ type: 'number', min: 1, max: 50, step: 1 }, spec.wiggles, (v, o) => upd({ wiggles: v }, o))),
        row(T('ease.type', 'Type'), control({ type: 'select', options: WIGGLE_TYPES.map((w) => [w, w]) }, spec.type, (v, o) => upd({ type: v }, o))),
      );
    } else if (kind === 'bounce') {
      fields.append(
        row(T('ease.strength', 'Strength'), control({ type: 'number', min: 0.05, max: 0.99, step: 0.05 }, spec.strength, (v, o) => upd({ strength: v }, o))),
        row(T('ease.endAtStart', 'End at start'), control({ type: 'checkbox' }, spec.endAtStart, (v, o) => upd({ endAtStart: v }, o))),
      );
    } else if (kind === 'rough') {
      fields.append(
        row(T('ease.strength', 'Strength'), control({ type: 'number', min: 0, max: 5, step: 0.1 }, spec.strength, (v, o) => upd({ strength: v }, o))),
        row(T('ease.points', 'Points'), control({ type: 'number', min: 2, max: 100, step: 1 }, spec.points, (v, o) => upd({ points: v }, o))),
        row(T('ease.taper', 'Taper'), control({ type: 'select', options: ['none', 'in', 'out', 'both'] }, spec.taper, (v, o) => upd({ taper: v }, o))),
        row(T('ease.template', 'Template'), control({ type: 'text' }, spec.template, (v, o) => upd({ template: v }, o))),
        row(T('ease.randomize', 'Randomize'), control({ type: 'checkbox' }, spec.randomize, (v, o) => upd({ randomize: v }, o))),
        row(T('ease.clamp', 'Clamp'), control({ type: 'checkbox' }, spec.clamp, (v, o) => upd({ clamp: v }, o))),
      );
    } else if (kind === 'slow') {
      fields.append(
        row(T('ease.ratio', 'Linear ratio'), control({ type: 'number', min: 0, max: 1, step: 0.05 }, spec.ratio, (v, o) => upd({ ratio: v }, o))),
        row(T('ease.power', 'Power'), control({ type: 'number', min: 0, max: 1, step: 0.05 }, spec.power, (v, o) => upd({ power: v }, o))),
        row(T('ease.yoyo', 'Yoyo mode'), control({ type: 'checkbox' }, spec.yoyo, (v, o) => upd({ yoyo: v }, o))),
      );
    } else if (kind === 'expoScale') {
      fields.append(
        row(T('ease.start', 'Start value'), control({ type: 'number', step: 0.1 }, spec.start, (v, o) => upd({ start: v }, o))),
        row(T('ease.end', 'End value'), control({ type: 'number', step: 0.1 }, spec.end, (v, o) => upd({ end: v }, o))),
        row(T('ease.base', 'Base ease'), control({ type: 'text' }, spec.ease, (v, o) => upd({ ease: v }, o))),
      );
    } else if (kind === 'steps') {
      fields.append(row(T('ease.steps', 'Steps'), control({ type: 'number', min: 1, max: 60, step: 1 }, spec.steps, (v, o) => upd({ steps: v }, o))));
    }

    wrap.replaceChildren(row(T('ease.kind', 'Ease'), kindSelect), h('div.mud-anim-ease__body', {}, [curveBox, fields]), h('span.mud-anim-ease__key', {}, typeof spec === 'string' ? spec : easeKey(spec)));
    requestAnimationFrame(() => draw(canvas));

    function set(next) { spec = next; onChange(spec, { final: true }); render(); }
    function upd(changes, o) { spec = { ...spec, ...changes }; onChange(spec, o); draw(canvas); }
  }

  render();
  return { el: wrap, dispose() { for (const d of handles) d.kill(); } };
}
