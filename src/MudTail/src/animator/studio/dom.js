// MudTail Animator Studio: small DOM helpers and form fields shared by the panels.

/** Creates an element: h('button.mud-anim-btn', { onclick, title }, 'Text' | Node | [children]). */
export function h(spec, attrs = {}, children = []) {
  const [tag, ...classes] = spec.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** An icon button. */
export function iconButton(icon, label, onclick, { active = false, disabled = false, cls = '' } = {}) {
  return h(`button.mud-anim-ibtn${cls ? `.${cls}` : ''}`, { type: 'button', title: label, 'aria-label': label, 'aria-pressed': active ? 'true' : null, disabled, onclick, html: icon });
}

/** A text button. */
export function button(text, onclick, { icon = '', variant = '', title = null, disabled = false } = {}) {
  return h(`button.mud-anim-btn${variant ? `.mud-anim-btn--${variant}` : ''}`, { type: 'button', onclick, title, disabled, html: `${icon}<span>${esc(text)}</span>` });
}

/** A labelled row: label + control (+ optional trailing node). */
export function row(label, control, { hint = '', trailing = null, override = false, wide = false } = {}) {
  return h(`label.mud-anim-field${wide ? '.mud-anim-field--wide' : ''}${override ? '.is-override' : ''}`, { title: hint || null }, [
    h('span.mud-anim-field__label', {}, label), control, trailing,
  ]);
}

/**
 * A form control for a field descriptor { type, options, min, max, step }. onChange(value, { final }) fires on input
 * (final=false, for live preview) and on change (final=true, for history).
 */
export function control(field, value, onChange, ctx = {}) {
  const fire = (v, final) => onChange(v, { final });
  switch (field.type) {
    case 'number': {
      const input = h('input.mud-anim-input', { type: 'number', step: field.step ?? 'any', min: field.min ?? null, max: field.max ?? null, value: value ?? field.default ?? '' });
      input.addEventListener('input', () => { if (input.value !== '' && Number.isFinite(+input.value)) fire(+input.value, false); });
      input.addEventListener('change', () => fire(input.value === '' ? field.default ?? 0 : +input.value, true));
      scrubbable(input, field);
      return input;
    }
    case 'range': {
      const input = h('input.mud-anim-range', { type: 'range', min: field.min ?? 0, max: field.max ?? 1, step: field.step ?? 0.01, value: value ?? field.default ?? 0 });
      input.addEventListener('input', () => fire(+input.value, false));
      input.addEventListener('change', () => fire(+input.value, true));
      return input;
    }
    case 'textarea': {
      const input = h('textarea.mud-anim-input.mud-anim-textarea', { rows: field.rows ?? 3, spellcheck: false });
      input.value = value ?? field.default ?? '';
      input.addEventListener('input', () => fire(input.value, false));
      input.addEventListener('change', () => fire(input.value, true));
      return input;
    }
    case 'select':
    case 'layer': {
      const options = field.type === 'layer' ? [['', '—'], ...(ctx.layers ?? [])] : field.options;
      const select = h('select.mud-anim-input', {}, options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return h('option', { value: v }, l);
      }));
      select.value = value ?? field.default ?? '';
      select.addEventListener('change', () => fire(select.value, true));
      return select;
    }
    case 'checkbox': {
      const input = h('input.mud-anim-check', { type: 'checkbox' });
      input.checked = !!(value ?? field.default);
      input.addEventListener('change', () => fire(input.checked, true));
      return input;
    }
    case 'color': {
      const wrap = h('span.mud-anim-color');
      const text = h('input.mud-anim-input', { type: 'text', value: value ?? '', placeholder: field.placeholder ?? 'none' });
      const picker = h('input', { type: 'color', value: toHex(value) ?? '#000000', 'aria-label': field.label });
      picker.addEventListener('input', () => { text.value = picker.value; fire(picker.value, false); });
      picker.addEventListener('change', () => fire(picker.value, true));
      text.addEventListener('change', () => { const hx = toHex(text.value); if (hx) picker.value = hx; fire(text.value, true); });
      wrap.append(picker, text);
      return wrap;
    }
    default: {
      const input = h('input.mud-anim-input', { type: 'text', value: value ?? field.default ?? '', placeholder: field.placeholder ?? '' });
      input.addEventListener('input', () => fire(input.value, false));
      input.addEventListener('change', () => fire(input.value, true));
      return input;
    }
  }
}

/** Drag a number input's label sideways to scrub its value (Alt for fine steps). */
function scrubbable(input, field) {
  input.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || document.activeElement === input || !e.altKey) return;
    e.preventDefault();
    const start = e.clientX;
    const base = +input.value || 0;
    const step = +(field.step ?? 1) || 1;
    const move = (ev) => { input.value = String(Math.round((base + ((ev.clientX - start) / 2) * step) * 1000) / 1000); input.dispatchEvent(new Event('input')); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); input.dispatchEvent(new Event('change')); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

/** #rrggbb for a CSS colour value (hex or rgb), or null. */
export function toHex(value) {
  const v = String(value ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v.slice(1).split('').map((c) => c + c).join('')}`.toLowerCase();
  const m = /^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(v);
  if (m) return `#${[m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('')}`;
  return null;
}

/** A collapsible section. */
export function section(title, body, { open = true, actions = null } = {}) {
  const det = h('details.mud-anim-section', { open });
  det.append(h('summary.mud-anim-section__title', {}, [h('span', {}, title), actions]), body);
  return det;
}

/** A simple modal dialog. Returns { el, close }. */
export function modal(title, body, { wide = false, onClose = null, actions = [] } = {}) {
  const backdrop = h('div.mud-anim-modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const panel = h(`div.mud-anim-modal__panel${wide ? '.is-wide' : ''}`);
  const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey, true); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  panel.append(
    h('header.mud-anim-modal__head', {}, [h('h2', {}, title), h('button.mud-anim-ibtn', { type: 'button', 'aria-label': 'Close', onclick: close, html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' })]),
    h('div.mud-anim-modal__body', {}, body),
  );
  if (actions.length) panel.append(h('footer.mud-anim-modal__foot', {}, actions));
  backdrop.append(panel);
  backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey, true);
  (document.querySelector('.mud-anim-studio') ?? document.body).appendChild(backdrop);
  panel.querySelector('input,select,textarea,button:not(.mud-anim-ibtn)')?.focus();
  return { el: backdrop, panel, close };
}

/** Reads a File as a data: URL. */
export function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

/** Downloads text or a Blob as a file. */
export function download(name, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Formats seconds as 0:00.00. */
export function formatTime(t) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
}
