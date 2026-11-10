// Shared motion helpers for the behaviours.
import { isRtl } from '../core/direction.js';

/** True when the user asked the OS for less motion. */
export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 1 in LTR, -1 in RTL: multiply horizontal distances by it. */
export function dirFactor(element) {
  return isRtl(element) ? -1 : 1;
}

/** Calls fn at most once per animation frame. */
export function rafThrottle(fn) {
  let queued = false;
  const run = () => { queued = false; fn(); };
  const throttled = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  };
  return throttled;
}
