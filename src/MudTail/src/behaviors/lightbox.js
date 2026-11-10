// Lightbox for galleries. On an element with data-mud="lightbox", clicking any [data-mud-lightbox-item] link
// opens its href full-screen instead of navigating. Caption: data-caption, else the figure's <figcaption>.
// Keyboard: Esc closes, arrow keys browse (mirrored in RTL), Tab stays inside. Swipe on touch screens.
// openLightbox(items, index) can also be called directly with [{ src, caption, alt }].

import gsap from 'gsap';
import { prefersReducedMotion, dirFactor } from './motion.js';
import { t, formatNumber } from '../core/i18n.js';

const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const ICON_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
const ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

const ITEM_SELECTOR = '[data-mud-lightbox-item]';

function toItem(link) {
  const img = link.querySelector('img');
  const caption = link.getAttribute('data-caption')
    ?? link.closest('figure')?.querySelector('figcaption')?.textContent?.replace(/\s+/g, ' ').trim()
    ?? '';
  return { src: link.getAttribute('href'), caption, alt: img?.getAttribute('alt') || caption };
}

export function lightbox(container) {
  let current = null;

  const onClick = (e) => {
    const link = e.target.closest(ITEM_SELECTOR);
    if (!link || !container.contains(link)) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // let "open in new tab" work
    e.preventDefault();
    const links = [...container.querySelectorAll(ITEM_SELECTOR)];
    current = openLightbox(links.map(toItem), links.indexOf(link), link);
  };

  container.addEventListener('click', onClick);
  return {
    dispose() {
      container.removeEventListener('click', onClick);
      current?.close({ immediate: true });
    },
  };
}

function button(className, label, icon) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `mud-lightbox__btn ${className}`;
  b.setAttribute('aria-label', label);
  b.innerHTML = icon; // static SVG only
  return b;
}

export function openLightbox(items, index = 0, returnFocusTo = document.activeElement) {
  if (!items?.length) return null;
  const reduced = prefersReducedMotion();

  const root = document.createElement('div');
  root.className = 'mud-lightbox';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', t('lightbox.label', {}, 'Image viewer'));

  const bar = document.createElement('div');
  bar.className = 'mud-lightbox__bar';
  const counter = document.createElement('span');
  counter.setAttribute('aria-live', 'polite');
  const closeBtn = button('mud-lightbox__close', t('common.close', {}, 'Close'), ICON_CLOSE);
  bar.append(counter, closeBtn);

  const stage = document.createElement('div');
  stage.className = 'mud-lightbox__stage';
  const prevBtn = button('mud-lightbox__prev', t('lightbox.previous', {}, 'Previous image'), ICON_PREV);
  const nextBtn = button('mud-lightbox__next', t('lightbox.next', {}, 'Next image'), ICON_NEXT);
  const img = document.createElement('img');
  img.decoding = 'async';
  stage.append(prevBtn, img, nextBtn);

  const caption = document.createElement('p');
  caption.className = 'mud-lightbox__caption';

  root.append(bar, stage, caption);
  document.body.appendChild(root);
  document.body.classList.add('mud-scroll-locked');

  let i = Math.min(Math.max(0, index), items.length - 1);
  let closed = false;

  const show = (next, step = 0) => {
    i = Math.min(Math.max(0, next), items.length - 1);
    const item = items[i];
    img.src = item.src;
    img.alt = item.alt || '';
    caption.textContent = item.caption || ''; // text only: captions may come from user content
    counter.textContent = t('lightbox.counter', { index: formatNumber(i + 1), total: formatNumber(items.length) }, '{index} / {total}');
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === items.length - 1;
    [items[i - 1], items[i + 1]].forEach((n) => { if (n) new Image().src = n.src; }); // preload neighbours
    if (!reduced) {
      gsap.fromTo(img, { opacity: 0, x: 40 * step * dirFactor(root) }, { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out' });
    }
  };

  const go = (step) => {
    const next = i + step;
    if (next < 0 || next >= items.length) return;
    show(next, step);
  };

  const close = ({ immediate = false } = {}) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    const finish = () => {
      root.remove();
      document.body.classList.remove('mud-scroll-locked');
      if (returnFocusTo?.isConnected) returnFocusTo.focus({ preventScroll: true });
    };
    if (immediate || reduced) finish();
    else gsap.to(root, { opacity: 0, duration: 0.2, onComplete: finish });
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      // The arrow keys follow the screen: in RTL "next" is to the left.
      const towardsEnd = (e.key === 'ArrowRight') === (dirFactor(root) === 1);
      go(towardsEnd ? 1 : -1);
      return;
    }
    if (e.key === 'Tab') { // keep focus inside the dialog
      const focusables = [closeBtn, prevBtn, nextBtn].filter((b) => !b.disabled && b.offsetParent !== null);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  };

  // Swipe: a horizontal drag of 50px moves one image (mirrored in RTL).
  let startX = null;
  stage.addEventListener('pointerdown', (e) => { startX = e.clientX; });
  stage.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = (e.clientX - startX) * dirFactor(root);
    startX = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  });
  stage.addEventListener('click', (e) => { if (e.target === stage) close(); }); // click beside the image

  closeBtn.addEventListener('click', () => close());
  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));
  document.addEventListener('keydown', onKey, true);

  show(i);
  if (!reduced) gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.2 });
  closeBtn.focus({ preventScroll: true });

  return {
    close,
    dispose: () => close({ immediate: true }), // the same lifecycle as every other handle
    next: () => go(1),
    prev: () => go(-1),
    show: (n) => show(n),
    get index() { return i; },
  };
}
