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

// Loading and progress: spinners, overlay, busy buttons, page loader; linear and circular progress
export { createSpinner, showLoading, setButtonLoading, pageLoader } from './components/MudLoading.js';
export { MudProgressLinear, MudProgressCircular, toneColor, colorForValue } from './components/MudProgress.js';

// Forms: EditForm (fields, model, validation, async submit with server errors), in a dialog, and confirmations
export { MudEditForm, validateField, openEditDialog, confirmDialog } from './components/MudEditForm.js';

// Tree view: levels, drag & drop reordering, move up / down buttons, keyboard (WAI-ARIA tree)
export { MudTreeView } from './components/MudTreeView.js';

// Stat hero card: a "how we compare" block of horizontal bars, one highlighted (markup + data-mud="stat-bars")
export { createStatCard } from './components/MudStatCard.js';

// Image editor: crop, rotate, adjust, draw, resize, output sizes, download and upload (+ the pure pipeline)
export { MudImageEditor } from './image-editor/MudImageEditor.js';
export {
  applyAdjustments, histogram, fitSize, centeredCrop, rotatedBounds, presetAdjustments,
  DEFAULT_ADJUSTMENTS, FILTER_PRESETS, ASPECT_RATIOS, SIZE_PRESETS,
} from './image-editor/pipeline.js';
export { loadSource as loadImage, renderSize, toBlob as canvasToBlob } from './image-editor/render.js';
// Image recipes: store them with the original, regenerate the same files with renderRecipe(original, recipe)
export {
  createRecipe, normalizeRecipe, scaleEdit, matchSource, fingerprint, RecipeError, RECIPE_TYPE, RECIPE_VERSION,
} from './image-editor/recipe.js';
export { renderRecipe, renderOutputs } from './image-editor/outputs.js';
