// Stat bars: on a .mud-stat-card (or any element) with data-mud="stat-bars", the .mud-stat-bar rows grow in, one after
// another, the first time the card scrolls into view. It only animates the --mud-stat-progress custom property, so
// Blazor keeps owning the markup (values, labels, order); without the behaviour, or with reduced motion, bars are full.
//
//   data-delay="0.1"   seconds between bars (default 0.09)
//   data-duration="1"  seconds per bar (default 0.9)

import gsap from 'gsap';
import { prefersReducedMotion } from './motion.js';

export function statBars(card) {
  const bars = () => [...card.querySelectorAll('.mud-stat-bar')];
  if (!bars().length || prefersReducedMotion() || typeof IntersectionObserver !== 'function') return { dispose() {} };

  const stagger = Number(card.dataset.delay ?? 0.09);
  const duration = Number(card.dataset.duration ?? 0.9);
  let tween = null;
  bars().forEach((bar) => bar.style.setProperty('--mud-stat-progress', '0'));

  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    const state = bars().map(() => ({ p: 0 }));
    tween = gsap.to(state, {
      p: 1,
      duration,
      ease: 'power3.out',
      stagger,
      onUpdate: () => bars().forEach((bar, i) => bar.style.setProperty('--mud-stat-progress', String(state[i]?.p ?? 1))),
      onComplete: () => bars().forEach((bar) => bar.style.removeProperty('--mud-stat-progress')),
    });
  }, { threshold: 0.35 });
  io.observe(card);

  return {
    dispose() {
      io.disconnect();
      tween?.kill();
      bars().forEach((bar) => bar.style.removeProperty('--mud-stat-progress')); // never leave bars empty
    },
  };
}
