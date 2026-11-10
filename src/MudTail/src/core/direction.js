// Writing direction (LTR / RTL) helpers.
// The page direction is the `dir` attribute on <html>; CSS follows it through logical properties and the
// --mud-dir factor (1 in LTR, -1 in RTL). Direction is set by the app (usually from the UI culture), so it is
// deliberately not part of the persisted theme.

/** 'rtl' or 'ltr' for an element (default: the document), as the browser resolved it. */
export function getDirection(element = document.documentElement) {
  if (!element) return 'ltr';
  return getComputedStyle(element).direction === 'rtl' ? 'rtl' : 'ltr';
}

export function isRtl(element) {
  return getDirection(element) === 'rtl';
}

/** Sets the page direction ('ltr' | 'rtl'), optionally with the page language, and raises `mud-direction-changed`. */
export function setDirection(dir, lang) {
  const root = document.documentElement;
  const value = dir === 'rtl' ? 'rtl' : 'ltr';
  root.setAttribute('dir', value);
  if (lang) root.setAttribute('lang', lang);
  window.dispatchEvent(new CustomEvent('mud-direction-changed', { detail: value }));
  return value;
}

/**
 * Resolves a logical side ('start' | 'end') to the physical one for an element; 'left', 'right', 'top' and
 * 'bottom' pass through unchanged.
 */
export function toPhysicalSide(side, element) {
  if (side !== 'start' && side !== 'end') return side;
  const rtl = isRtl(element);
  if (side === 'start') return rtl ? 'right' : 'left';
  return rtl ? 'left' : 'right';
}
