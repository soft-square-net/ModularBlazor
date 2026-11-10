// Breaking-news ticker: scrolls .mud-ticker__track through .mud-ticker__viewport with GSAP.
// Headlines enter from the inline end and leave at the inline start, so the ticker runs the other way in RTL.
// Pauses on hover and keyboard focus; the optional .mud-ticker__toggle button pauses it for good.
// data-speed: pixels per second (default 70). Reduced motion: no animation, the strip scrolls by hand.

import gsap from 'gsap';
import { prefersReducedMotion, dirFactor } from './motion.js';
import { t } from '../core/i18n.js';

export function ticker(el) {
  const viewport = el.querySelector('.mud-ticker__viewport');
  const track = el.querySelector('.mud-ticker__track');
  if (!viewport || !track) return null;

  if (prefersReducedMotion()) {
    el.setAttribute('data-state', 'static');
    return { dispose: () => el.removeAttribute('data-state') };
  }

  const toggle = el.querySelector('.mud-ticker__toggle');
  const speed = () => Math.max(10, Number(el.dataset.speed) || 70);
  let tween = null;
  let hovered = false;
  let focused = false;
  let userPaused = false;

  const shouldRun = () => !hovered && !focused && !userPaused;
  const sync = () => {
    if (!tween) return;
    shouldRun() ? tween.play() : tween.pause();
    el.setAttribute('data-state', userPaused ? 'paused' : 'running');
  };

  const build = () => {
    const progress = tween ? tween.progress() : 0;
    tween?.kill();
    const d = dirFactor(el);
    const viewportWidth = viewport.clientWidth;
    const trackWidth = track.scrollWidth;
    if (!viewportWidth || !trackWidth) return;
    tween = gsap.fromTo(track,
      { x: d * viewportWidth },
      { x: -d * trackWidth, duration: (viewportWidth + trackWidth) / speed(), ease: 'none', repeat: -1 });
    tween.progress(progress);
    sync();
  };

  const onEnter = () => { hovered = true; sync(); };
  const onLeave = () => { hovered = false; sync(); };
  const onFocusIn = () => { focused = true; sync(); };
  const onFocusOut = (e) => { if (!el.contains(e.relatedTarget)) { focused = false; sync(); } };
  const setToggleLabel = () => {
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(userPaused));
    toggle.setAttribute('aria-label', userPaused ? t('ticker.play', {}, 'Play headlines') : t('ticker.pause', {}, 'Pause headlines'));
  };
  const onToggle = () => { userPaused = !userPaused; setToggleLabel(); sync(); };

  el.addEventListener('mouseenter', onEnter);
  el.addEventListener('mouseleave', onLeave);
  el.addEventListener('focusin', onFocusIn);
  el.addEventListener('focusout', onFocusOut);
  toggle?.addEventListener('click', onToggle);
  setToggleLabel();

  // Rebuild when the size or the headlines change (Blazor re-renders the list), or the direction flips.
  let rebuildQueued = false;
  const queueBuild = () => {
    if (rebuildQueued) return;
    rebuildQueued = true;
    requestAnimationFrame(() => { rebuildQueued = false; build(); });
  };
  const resize = new ResizeObserver(queueBuild);
  resize.observe(viewport);
  resize.observe(track);
  const content = new MutationObserver(queueBuild);
  content.observe(track, { childList: true, subtree: true, characterData: true });
  window.addEventListener('mud-direction-changed', queueBuild);

  build();

  return {
    pause() { userPaused = true; setToggleLabel(); sync(); },
    play() { userPaused = false; setToggleLabel(); sync(); },
    dispose() {
      tween?.kill();
      gsap.set(track, { clearProps: 'transform' });
      resize.disconnect();
      content.disconnect();
      window.removeEventListener('mud-direction-changed', queueBuild);
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
      toggle?.removeEventListener('click', onToggle);
      el.removeAttribute('data-state');
    },
  };
}
