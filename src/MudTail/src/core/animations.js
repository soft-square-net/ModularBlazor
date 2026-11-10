// GSAP Animation Utilities for MudBlazor Material Framework
import gsap from 'gsap';
import { toPhysicalSide } from './direction.js';

/**
 * Material Ripple effect powered by GSAP
 */
export function createRipple(event, targetElement) {
  const el = targetElement || event.currentTarget;
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const diameter = Math.max(rect.width, rect.height);
  const radius = diameter / 2;

  const circle = document.createElement('span');
  circle.classList.add('mud-ripple-span');
  circle.style.width = circle.style.height = `${diameter}px`;
  circle.style.left = `${event.clientX - rect.left - radius}px`;
  circle.style.top = `${event.clientY - rect.top - radius}px`;

  el.appendChild(circle);

  gsap.fromTo(
    circle,
    { scale: 0, opacity: 0.6 },
    {
      scale: 2.4,
      opacity: 0,
      duration: 0.55,
      ease: 'power2.out',
      onComplete: () => {
        circle.remove();
      },
    }
  );
}

/**
 * Animate Drawer opening and closing with GSAP
 */
export function animateDrawer(drawerEl, overlayEl, anchor = 'left', open = true, onComplete) {
  if (!drawerEl) return;

  // start / end are logical: in RTL a start drawer sits on the right and slides in from there.
  const side = toPhysicalSide(anchor, drawerEl);
  const isHorizontal = side === 'left' || side === 'right';
  const isNegative = side === 'left' || side === 'top';

  if (open) {
    drawerEl.style.display = 'flex';
    if (overlayEl) {
      overlayEl.style.display = 'block';
      gsap.to(overlayEl, { opacity: 1, duration: 0.25, ease: 'power1.out' });
    }

    const fromProps = isHorizontal
      ? { x: isNegative ? '-100%' : '100%' }
      : { y: isNegative ? '-100%' : '100%' };

    gsap.fromTo(
      drawerEl,
      fromProps,
      {
        x: 0,
        y: 0,
        duration: 0.32,
        ease: 'power3.out',
        onComplete: () => {
          drawerEl.classList.add('open');
          if (onComplete) onComplete();
        },
      }
    );
  } else {
    if (overlayEl) {
      gsap.to(overlayEl, {
        opacity: 0,
        duration: 0.2,
        ease: 'power1.in',
        onComplete: () => {
          overlayEl.style.display = 'none';
        },
      });
    }

    const toProps = isHorizontal
      ? { x: isNegative ? '-100%' : '100%' }
      : { y: isNegative ? '-100%' : '100%' };

    gsap.to(drawerEl, {
      ...toProps,
      duration: 0.25,
      ease: 'power3.in',
      onComplete: () => {
        drawerEl.classList.remove('open');
        drawerEl.style.display = 'none';
        if (onComplete) onComplete();
      },
    });
  }
}

/**
 * Animate Dialog Modal with GSAP
 */
export function animateDialog(containerEl, open = true, onComplete) {
  if (!containerEl) return;
  const dialogEl = containerEl.querySelector('.mud-dialog');
  const overlayEl = containerEl.querySelector('.mud-dialog-overlay');

  if (open) {
    containerEl.classList.add('open');
    if (overlayEl) {
      gsap.fromTo(overlayEl, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    }
    if (dialogEl) {
      gsap.fromTo(
        dialogEl,
        { scale: 0.9, opacity: 0, y: 15 },
        { scale: 1, opacity: 1, y: 0, duration: 0.3, ease: 'back.out(1.5)', onComplete }
      );
    }
  } else {
    if (overlayEl) {
      gsap.to(overlayEl, { opacity: 0, duration: 0.2 });
    }
    if (dialogEl) {
      gsap.to(dialogEl, {
        scale: 0.92,
        opacity: 0,
        y: 10,
        duration: 0.2,
        ease: 'power2.in',
        onComplete: () => {
          containerEl.classList.remove('open');
          if (onComplete) onComplete();
        },
      });
    } else {
      containerEl.classList.remove('open');
      if (onComplete) onComplete();
    }
  }
}

/**
 * Animate Active Tab Slider Indicator with GSAP
 */
export function animateTabSlider(sliderEl, tabEl, position = 'top') {
  if (!sliderEl || !tabEl) return;

  const isVertical = position === 'left' || position === 'right' || position === 'start' || position === 'end';

  if (isVertical) {
    gsap.to(sliderEl, {
      top: tabEl.offsetTop,
      height: tabEl.offsetHeight,
      duration: 0.25,
      ease: 'power2.out',
    });
  } else {
    gsap.to(sliderEl, {
      left: tabEl.offsetLeft,
      width: tabEl.offsetWidth,
      duration: 0.25,
      ease: 'power2.out',
    });
  }
}

/**
 * Animate Accordion Expansion with GSAP
 */
export function animateAccordion(contentEl, expand = true, onComplete) {
  if (!contentEl) return;

  if (expand) {
    contentEl.style.height = 'auto';
    const targetHeight = contentEl.scrollHeight;
    contentEl.style.height = '0px';

    gsap.to(contentEl, {
      height: targetHeight,
      opacity: 1,
      duration: 0.28,
      ease: 'power2.out',
      onComplete: () => {
        contentEl.style.height = 'auto';
        contentEl.classList.add('expanded');
        if (onComplete) onComplete();
      },
    });
  } else {
    gsap.to(contentEl, {
      height: 0,
      opacity: 0,
      duration: 0.22,
      ease: 'power2.in',
      onComplete: () => {
        contentEl.classList.remove('expanded');
        if (onComplete) onComplete();
      },
    });
  }
}

/**
 * Floating Toast Notification with GSAP
 */
export function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('mud-toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'mud-toast-container';
    toastContainer.style.position = 'fixed';
    toastContainer.style.bottom = '24px';
    toastContainer.style.insetInlineEnd = '24px'; // bottom-right in LTR, bottom-left in RTL
    toastContainer.style.zIndex = '9999';
    toastContainer.style.display = 'flex';
    toastContainer.style.flexDirection = 'column';
    toastContainer.style.gap = '8px';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const palette = { success: 'success', error: 'error', warning: 'warning', info: 'primary' };
  const bg = `var(--mud-palette-${palette[type] || 'primary'})`;
  toast.style.backgroundColor = bg;
  toast.style.color = '#ffffff';
  toast.style.padding = '10px 18px';
  toast.style.borderRadius = 'var(--mud-default-borderradius, 4px)';
  toast.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.2)';
  toast.style.fontSize = '0.875rem';
  toast.style.fontWeight = '500';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '8px';
  toast.innerText = message;

  toastContainer.appendChild(toast);

  gsap.fromTo(
    toast,
    { y: 20, opacity: 0, scale: 0.9 },
    { y: 0, opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(1.7)' }
  );

  setTimeout(() => {
    gsap.to(toast, {
      y: -10,
      opacity: 0,
      duration: 0.25,
      onComplete: () => toast.remove(),
    });
  }, 3200);
}
