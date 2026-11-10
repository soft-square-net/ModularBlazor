// Loading helpers: spinners, a loading overlay for any container, busy buttons and a page-top loader.
// The look is CSS (src/styles/_loading.scss); these build the markup and keep the accessibility attributes right.

import { t } from '../core/i18n.js';
import { toneColor } from './MudProgress.js';

const SPINNERS = ['ring', 'dots', 'bars', 'pulse'];

/**
 * A spinner element.
 * @param {object} [o]
 * @param {'ring'|'dots'|'bars'|'pulse'} [o.variant='ring']
 * @param {string} [o.color]       palette name ('primary', 'success', …) or any CSS colour
 * @param {string|number} [o.size] CSS length (numbers are px)
 * @param {string|number} [o.thickness] ring line width
 * @param {string} [o.trackColor]  ring track colour
 * @param {string|false} [o.label] text for screen readers (default "Loading…"); false = decorative (aria-hidden)
 */
export function createSpinner({ variant = 'ring', color, size, thickness, trackColor, label } = {}) {
  const kind = SPINNERS.includes(variant) ? variant : 'ring';
  const el = document.createElement('span');
  el.className = kind === 'ring' ? 'mud-spinner' : `mud-spinner-${kind}`;
  if (kind === 'dots') el.appendChild(document.createElement('span'));
  if (kind === 'bars') for (let i = 0; i < 4; i++) el.appendChild(document.createElement('i'));
  if (color) el.style.setProperty('--mud-spinner-color', toneColor(color));
  if (size != null) el.style.setProperty('--mud-spinner-size', px(size));
  if (thickness != null) el.style.setProperty('--mud-spinner-width', px(thickness));
  if (trackColor) el.style.setProperty('--mud-spinner-track', toneColor(trackColor));
  if (label === false) {
    el.setAttribute('aria-hidden', 'true');
  } else {
    el.setAttribute('role', 'status');
    const sr = document.createElement('span');
    sr.className = 'mud-sr-only';
    sr.textContent = label ?? t('common.loading', {}, 'Loading…');
    el.appendChild(sr);
  }
  return el;
}

/**
 * Covers `target` with a loading overlay (spinner + optional text) and marks it aria-busy.
 * Returns { setText, show, hide, dispose }; dispose() removes the overlay. The target's own children are not touched.
 * @param {Element} target
 * @param {object} [o]
 * @param {string} [o.text]        shown under the spinner (default: none; screen readers hear "Loading…")
 * @param {'ring'|'dots'|'bars'|'pulse'} [o.spinner='ring']
 * @param {string} [o.color]
 * @param {boolean} [o.blur=false] blur what is underneath
 * @param {boolean} [o.visible=true]
 */
export function showLoading(target, { text = '', spinner = 'ring', color, blur = false, visible = true } = {}) {
  const hadClass = target.classList.contains('mud-loading');
  target.classList.add('mud-loading');
  const overlay = document.createElement('div');
  overlay.className = `mud-loading__overlay${blur ? ' mud-loading__overlay--blur' : ''}`;
  overlay.append(createSpinner({ variant: spinner, color, size: spinner === 'ring' ? 36 : undefined, label: false }));
  const caption = document.createElement('span');
  caption.setAttribute('role', 'status');
  overlay.append(caption);
  target.appendChild(overlay);

  const setText = (value) => { caption.textContent = value || ''; if (!value) caption.append(srOnly(t('common.loading', {}, 'Loading…'))); };
  const show = () => target.setAttribute('aria-busy', 'true');
  const hide = () => target.removeAttribute('aria-busy');
  setText(text);
  if (visible) show();

  return {
    setText,
    show,
    hide,
    isVisible: () => target.getAttribute('aria-busy') === 'true',
    dispose() {
      hide();
      overlay.remove();
      if (!hadClass) target.classList.remove('mud-loading');
    },
  };
}

/**
 * Puts a button in (or out of) a busy state: a spinner over its hidden content, disabled, aria-busy.
 * Its content is hidden, not removed, so the button keeps its width.
 */
export function setButtonLoading(button, loading = true) {
  if (!button) return;
  const existing = button.querySelector(':scope > .mud-button-spinner');
  if (loading) {
    if (!existing) {
      const spinner = createSpinner({ label: false });
      spinner.classList.add('mud-button-spinner');
      button.appendChild(spinner);
    }
    button.dataset.mudWasDisabled ??= String(button.disabled);
    button.disabled = true;
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
  } else {
    existing?.remove();
    button.classList.remove('is-loading');
    button.removeAttribute('aria-busy');
    if (button.dataset.mudWasDisabled !== undefined) {
      button.disabled = button.dataset.mudWasDisabled === 'true';
      delete button.dataset.mudWasDisabled;
    }
  }
}

/**
 * The page-top loader (one per page): start() trickles towards 90 %, set(0–100) jumps, done() completes and fades.
 * Calls nest: done() only finishes when every start() has a matching done().
 */
export const pageLoader = (() => {
  let el = null;
  let value = 0;
  let timer = null;
  let active = 0;

  const ensure = () => {
    if (el?.isConnected) return el;
    el = document.createElement('div');
    el.className = 'mud-page-loader';
    el.setAttribute('aria-hidden', 'true');
    el.appendChild(document.createElement('span'));
    document.body.appendChild(el);
    return el;
  };
  const paint = () => ensure().style.setProperty('--mud-page-loader-value', String(value / 100));
  const stopTimer = () => { clearInterval(timer); timer = null; };

  return {
    start() {
      active++;
      ensure().classList.add('is-active');
      if (value >= 100 || value === 0) { value = 8; paint(); }
      if (!timer) timer = setInterval(() => { value += (90 - value) * 0.08; paint(); }, 250);
    },
    set(percent) {
      ensure().classList.add('is-active');
      value = Math.max(0, Math.min(100, Number(percent) || 0));
      paint();
    },
    done(force = false) {
      active = force ? 0 : Math.max(0, active - 1);
      if (active > 0) return;
      stopTimer();
      value = 100;
      paint();
      el?.classList.remove('is-active');
      setTimeout(() => { if (active === 0) { value = 0; if (el) el.style.setProperty('--mud-page-loader-value', '0'); } }, 500);
    },
    isActive: () => active > 0,
  };
})();

function srOnly(text) {
  const s = document.createElement('span');
  s.className = 'mud-sr-only';
  s.textContent = text;
  return s;
}

function px(v) {
  return typeof v === 'number' ? `${v}px` : String(v);
}
