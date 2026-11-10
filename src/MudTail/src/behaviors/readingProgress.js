// Reading progress bar: scales the element horizontally with how far the reader is through the target
// (data-target="#article", re-queried each time so it follows Blazor route changes) or the whole page.

import { rafThrottle } from './motion.js';

export function readingProgress(bar) {
  const measure = () => {
    const selector = bar.getAttribute('data-target');
    const target = selector ? document.querySelector(selector) : null;
    let progress;
    if (target) {
      const rect = target.getBoundingClientRect();
      const distance = rect.height - window.innerHeight;
      progress = distance > 0 ? -rect.top / distance : (rect.top < 0 ? 1 : 0);
    } else {
      const doc = document.documentElement;
      const distance = doc.scrollHeight - window.innerHeight;
      progress = distance > 0 ? window.scrollY / distance : 0;
    }
    progress = Math.min(1, Math.max(0, progress));
    bar.style.transform = `scaleX(${progress})`;
    bar.setAttribute('data-progress', String(Math.round(progress * 100)));
  };

  const update = rafThrottle(measure);
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  const resize = new ResizeObserver(update); // content grows as Blazor renders
  resize.observe(document.body);
  measure();

  return {
    update: measure,
    dispose() {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      resize.disconnect();
      bar.style.removeProperty('transform');
      bar.removeAttribute('data-progress');
    },
  };
}
