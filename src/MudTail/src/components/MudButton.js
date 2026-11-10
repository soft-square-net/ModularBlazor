// Vanilla JS MudButton Component with GSAP Ripple
import { createRipple } from '../core/animations.js';

export function createMudButton(options = {}) {
  const {
    text = '',
    variant = 'filled', // filled | outlined | text | icon
    color = 'primary', // primary | secondary | surface | error
    size = 'medium', // small | medium | large
    icon = null,
    iconPosition = 'start', // start | end
    disabled = false,
    className = '',
    onClick = null,
    type = 'button',
    ariaLabel = '',
  } = options;

  const btn = document.createElement('button');
  btn.type = type;
  if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
  btn.className = `mud-button-root mud-button-${variant} mud-button-${color} mud-button-${size} ${className}`;

  if (disabled) btn.disabled = true;

  if (variant === 'icon' && icon) {
    btn.classList.add('mud-button-icon');
    btn.innerHTML = icon;
  } else {
    let contentHtml = '';
    if (icon && iconPosition === 'start') {
      contentHtml += `<span class="btn-icon">${icon}</span>`;
    }
    if (text) {
      contentHtml += `<span>${text}</span>`;
    }
    if (icon && iconPosition === 'end') {
      contentHtml += `<span class="btn-icon">${icon}</span>`;
    }
    btn.innerHTML = contentHtml;
  }

  btn.addEventListener('click', (e) => {
    createRipple(e, btn);
    if (onClick && !btn.disabled) {
      onClick(e, btn);
    }
  });

  return btn;
}
