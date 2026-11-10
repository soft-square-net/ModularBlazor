// Scroll reveal: elements with data-mud-reveal animate in (GSAP) the first time they scroll into view.
//
//   data-mud-reveal="fade-up | fade | zoom | slide-start | slide-end"   (default fade-up)
//   data-mud-reveal-stagger="0.08"   animate the element's children one after another instead
//   data-mud-reveal-delay="0.2"
//
// With reduced motion nothing is hidden or animated.

import gsap from 'gsap';
import { prefersReducedMotion, dirFactor } from './motion.js';

const READY_CLASS = 'mud-reveal-ready';

function fromVars(type, el) {
  const d = dirFactor(el);
  switch (type) {
    case 'fade': return { opacity: 0 };
    case 'zoom': return { opacity: 0, scale: 0.94 };
    case 'slide-start': return { opacity: 0, x: -48 * d };
    case 'slide-end': return { opacity: 0, x: 48 * d };
    default: return { opacity: 0, y: 28 };
  }
}

export function createReveal() {
  if (prefersReducedMotion() || typeof IntersectionObserver !== 'function') {
    return { scan() {}, dispose() {} };
  }

  document.documentElement.classList.add(READY_CLASS);
  const watched = new WeakSet();

  const play = (el) => {
    const type = el.getAttribute('data-mud-reveal') || 'fade-up';
    const delay = Number(el.getAttribute('data-mud-reveal-delay')) || 0;
    const staggerAttr = el.getAttribute('data-mud-reveal-stagger');
    const targets = staggerAttr !== null ? [...el.children] : [el];
    const vars = {
      ...fromVars(type, el),
      duration: 0.7,
      delay,
      ease: 'power3.out',
      stagger: staggerAttr !== null ? Number(staggerAttr) || 0.08 : 0,
      clearProps: 'opacity,transform', // leave Blazor-rendered elements without inline styles
    };
    if (targets.length) gsap.from(targets, vars); // renders the hidden start state immediately…
    el.setAttribute('data-mud-revealed', ''); // …so lifting the CSS hide causes no flash
  };

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.unobserve(entry.target);
      play(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

  const observe = (el) => {
    if (watched.has(el) || el.hasAttribute('data-mud-revealed')) return;
    watched.add(el);
    io.observe(el);
  };

  return {
    scan(node) {
      if (node.hasAttribute?.('data-mud-reveal')) observe(node);
      node.querySelectorAll?.('[data-mud-reveal]').forEach(observe);
    },
    dispose() {
      io.disconnect();
      document.documentElement.classList.remove(READY_CLASS);
    },
  };
}
