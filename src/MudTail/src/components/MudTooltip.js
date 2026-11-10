// Vanilla JS MudTooltip Helper with GSAP
import gsap from 'gsap';
import { toPhysicalSide } from '../core/direction.js';

/**
 * Shows a tooltip while the pointer is over `element`.
 * Returns a detach function that removes the listeners and any visible tooltip.
 */
export function attachTooltip(element, text, position = 'top') {
  if (!element || !text) return () => {};
  const requested = position; // 'start' / 'end' are resolved against the direction each time it shows

  let tooltipEl = null;

  const removeTip = () => {
    if (!tooltipEl) return;
    gsap.killTweensOf(tooltipEl);
    tooltipEl.remove();
    tooltipEl = null;
  };

  const onEnter = () => {
    removeTip();
    const position = toPhysicalSide(requested, element);
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'mud-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.innerText = text;
    document.body.appendChild(tooltipEl);

    const rect = element.getBoundingClientRect();
    const tipRect = tooltipEl.getBoundingClientRect();

    let top = 0;
    let left = 0;

    if (position === 'top') {
      top = rect.top - tipRect.height - 8;
      left = rect.left + rect.width / 2 - tipRect.width / 2;
    } else if (position === 'bottom') {
      top = rect.bottom + 8;
      left = rect.left + rect.width / 2 - tipRect.width / 2;
    } else if (position === 'left') {
      top = rect.top + rect.height / 2 - tipRect.height / 2;
      left = rect.left - tipRect.width - 8;
    } else if (position === 'right') {
      top = rect.top + rect.height / 2 - tipRect.height / 2;
      left = rect.right + 8;
    }

    tooltipEl.style.top = `${Math.max(4, top)}px`;
    tooltipEl.style.left = `${Math.max(4, left)}px`;

    const tip = tooltipEl;
    gsap.fromTo(
      tip,
      { opacity: 0, y: position === 'top' ? 4 : position === 'bottom' ? -4 : 0 },
      { opacity: 1, y: 0, duration: 0.18, ease: 'power2.out', onStart: () => tip.classList.add('visible') }
    );
  };

  const onLeave = () => {
    const tip = tooltipEl;
    if (!tip) return;
    gsap.to(tip, {
      opacity: 0,
      duration: 0.15,
      onComplete: () => {
        tip.remove();
        if (tooltipEl === tip) tooltipEl = null;
      },
    });
  };

  element.addEventListener('mouseenter', onEnter);
  element.addEventListener('mouseleave', onLeave);

  return function detach() {
    element.removeEventListener('mouseenter', onEnter);
    element.removeEventListener('mouseleave', onLeave);
    removeTip();
  };
}
