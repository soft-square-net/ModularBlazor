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

// Internationalisation: messages, locale (sets lang + dir), plural forms, formatting, data-i18n markup
export {
  t, addMessages, setLocale, getLocale, preferredLocale, availableLocales, isRtlLocale, hasMessage, onLocaleChange,
  formatNumber, formatDate, formatRelativeTime, translateElement, setNumerals, getNumerals, intlLocale, localizeDigits,
} from './core/i18n.js';
import { addMessages as registerMessages } from './core/i18n.js';
import arabic from './locales/ar.js';
registerMessages('ar', arabic); // MudTail's own UI in Arabic

// Writing direction (LTR / RTL)
export { getDirection, isRtl, setDirection, toPhysicalSide } from './core/direction.js';

// Declarative behaviours for rendered markup (data-mud="…", data-mud-reveal)
export { autoInit, registerBehavior, attachBehavior, behaviorNames } from './behaviors/autoInit.js';
export { openLightbox } from './behaviors/lightbox.js';
export { prefersReducedMotion } from './behaviors/motion.js';

// IDE docking layout (tab groups, splits, drag & drop docking, auto-hide)
export { MudDock } from './dock/MudDock.js';
export { DockModel, DropZone } from './dock/model.js';

// Data table (client-side or server-side; server queries match the .NET PaginationFilter + Ardalis specs)
export { MudDataTable } from './datatable/MudDataTable.js';
export {
  applyQuery, createQuery, toPaginationFilterParams, toPaginationFilter, fromPagedResponse, OPERATORS, OPERATORS_BY_TYPE,
} from './datatable/query.js';

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
