// MudTail Material UI Framework: public JavaScript API.
// Everything a consumer may use is exported from here; anything else in src/ is internal.

// Theme: runtime palette, dark mode, and export of the current tokens
export {
  DEFAULT_THEME,
  initTheme,
  getTheme,
  updateTheme,
  applyTheme,
  generateScssExport,
  generateCssExport,
} from './core/theme.js';

// Design tokens: palette presets, elevation shadows, contrast and colour helpers
export {
  PALETTE_PRESETS,
  getElevationShadow,
  generateExportableCss,
  generateTailwindConfigSnippet,
  hexToRgb,
  isValidHex,
  normalizeHex,
  getContrastRatio,
  createCustomPalette,
} from './core/theme-tokens.ts';

// Form validation rules
export * from './core/form-validators.ts';

// GSAP animation helpers
export {
  createRipple,
  animateDrawer,
  animateDialog,
  animateTabSlider,
  animateAccordion,
  showToast,
} from './core/animations.js';

// Icons
export { getIconSvg } from './core/icons.js';

// Components
export { createMudButton } from './components/MudButton.js';
export { MudDialog } from './components/MudDialog.js';
export { MudDrawer } from './components/MudDrawer.js';
export { MudTabs } from './components/MudTabs.js';
export { MudAccordion } from './components/MudAccordion.js';
export { attachTooltip } from './components/MudTooltip.js';
export { createAutocomplete } from './components/MudAutocomplete.js';
