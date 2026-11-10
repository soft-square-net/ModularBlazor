// Password reveal: on a .mud-input-wrapper with data-mud="password-toggle", the [data-mud-password-toggle] button
// switches its input between password and text. The script owns aria-pressed and aria-label on the button.
//
// <div class="mud-input-wrapper" data-mud="password-toggle">
//   <input type="password" class="mud-input-slot" autocomplete="current-password">
//   <button type="button" class="mud-input-toggle" data-mud-password-toggle>…eye icon…</button>
// </div>

import { t } from '../core/i18n.js';

export function passwordToggle(wrapper) {
  const input = wrapper.querySelector('input');
  const button = wrapper.querySelector('[data-mud-password-toggle]');
  if (!input || !button) return null;

  const sync = () => {
    const shown = input.type === 'text';
    button.setAttribute('aria-pressed', String(shown));
    button.setAttribute('aria-label', shown ? t('password.hide', {}, 'Hide password') : t('password.show', {}, 'Show password'));
    wrapper.toggleAttribute('data-revealed', shown);
  };
  const onClick = () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    sync();
    input.focus({ preventScroll: true });
  };

  button.addEventListener('click', onClick);
  sync();
  return {
    dispose() {
      button.removeEventListener('click', onClick);
      input.type = 'password'; // never leave a password visible after the behaviour goes away
      wrapper.removeAttribute('data-revealed');
    },
  };
}
