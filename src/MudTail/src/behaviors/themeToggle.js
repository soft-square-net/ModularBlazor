// Dark-mode toggle button: <button class="mud-icon-btn mud-theme-toggle" data-mud="theme-toggle">…</button>

import { getTheme, updateTheme } from '../core/theme.js';
import { t } from '../core/i18n.js';

export function themeToggle(button) {
  const sync = () => {
    const dark = !!getTheme().isDark;
    button.setAttribute('aria-pressed', String(dark));
    if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', t('theme.dark', {}, 'Dark mode'));
  };
  const onClick = () => updateTheme({ isDark: !getTheme().isDark });

  button.addEventListener('click', onClick);
  window.addEventListener('mud-theme-changed', sync);
  sync();

  return {
    dispose() {
      button.removeEventListener('click', onClick);
      window.removeEventListener('mud-theme-changed', sync);
    },
  };
}
