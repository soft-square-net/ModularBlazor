// Live scores: when the text of a .mud-score inside the element changes (Blazor re-rendered a new score),
// it is highlighted for a moment and given a short GSAP pop. Works on score strips and match cards alike.

import gsap from 'gsap';
import { prefersReducedMotion } from './motion.js';

const FLASH_MS = 1600;

export function scoreStrip(el) {
  const last = new WeakMap();
  const timers = new Set();
  const remember = (s) => last.set(s, s.textContent.trim());
  el.querySelectorAll('.mud-score').forEach(remember);

  const flash = (s) => {
    s.classList.add('is-updated');
    if (!prefersReducedMotion()) {
      gsap.fromTo(s, { scale: 1.45 }, { scale: 1, duration: 0.6, ease: 'back.out(3)', clearProps: 'transform' });
    }
    const t = setTimeout(() => { s.classList.remove('is-updated'); timers.delete(t); }, FLASH_MS);
    timers.add(t);
  };

  const check = (s) => {
    const now = s.textContent.trim();
    const before = last.get(s);
    last.set(s, now);
    if (before !== undefined && before !== now) flash(s);
  };

  const observer = new MutationObserver((mutations) => {
    const touched = new Set();
    for (const m of mutations) {
      const node = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
      const score = node?.closest('.mud-score');
      if (score) touched.add(score);
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== Node.ELEMENT_NODE) return;
        if (n.matches('.mud-score')) remember(n);
        n.querySelectorAll('.mud-score').forEach(remember);
      });
    }
    touched.forEach(check);
  });
  observer.observe(el, { subtree: true, childList: true, characterData: true });

  return {
    dispose() {
      observer.disconnect();
      timers.forEach(clearTimeout);
      el.querySelectorAll('.mud-score.is-updated').forEach((s) => s.classList.remove('is-updated'));
    },
  };
}
