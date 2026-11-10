// MudTail i18n: messages per locale, t() with interpolation and plural forms, the active locale (which also sets
// <html lang> and, for right-to-left languages, dir="rtl"), locale-aware number / date formatting, and a translator
// for markup marked with data-i18n attributes (works for Blazor-rendered HTML too).
//
//   addMessages('ar', { 'cart.items': { zero: 'لا عناصر', one: 'عنصر واحد', two: 'عنصران', few: '{count} عناصر', many: '{count} عنصرًا', other: '{count} عنصر' } });
//   setLocale('ar');                        // <html lang="ar" dir="rtl">, raises mud-locale-changed
//   t('cart.items', { count: 3 }, '{count} items');   // → "3 عناصر"; the last argument is the English default
//
// Lookup order: the exact locale (ar-EG), its language (ar), then the fallback locale (en), then the default text,
// then the key. A message is a string with {placeholders}, an object of plural forms (zero, one, two, few, many,
// other, chosen with Intl.PluralRules), or a function (params) => string.

import { setDirection } from './direction.js';

const catalogs = new Map(); // locale -> { key: message }
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ku', 'ckb', 'syr']);
const STORAGE_KEY = 'mud_locale';
let current = 'en';
let fallbackLocale = 'en';

/** Merges messages into a locale's catalog. */
export function addMessages(locale, messages) {
  const key = normalize(locale);
  catalogs.set(key, { ...(catalogs.get(key) ?? {}), ...messages });
}

/** Locales that have messages (plus the fallback). */
export function availableLocales() {
  return [...new Set([fallbackLocale, ...catalogs.keys()])];
}

export function getLocale() {
  return current;
}

/** True for right-to-left languages (Arabic, Hebrew, Persian, Urdu, …). */
export function isRtlLocale(locale = current) {
  return RTL_LANGUAGES.has(normalize(locale).split('-')[0]);
}

/**
 * Switches the active locale. Sets <html lang>, the direction (unless options.dir says otherwise),
 * optionally the digits (options.numerals, see setNumerals), optionally remembers the locale (options.persist),
 * and raises "mud-locale-changed" with { locale, dir, numerals }.
 */
export function setLocale(locale, { dir = null, persist = false, fallback = null, numerals = null } = {}) {
  current = normalize(locale) || 'en';
  if (fallback) fallbackLocale = normalize(fallback);
  if (numerals) numberingSystem = normalizeNumerals(numerals);
  const direction = dir ?? (isRtlLocale(current) ? 'rtl' : 'ltr');
  if (typeof document !== 'undefined') setDirection(direction, current);
  if (persist) { try { localStorage.setItem(STORAGE_KEY, current); } catch { /* storage blocked */ } }
  announce(direction);
  return current;
}

// ───────── digits ─────────

const NUMERALS = new Set(['auto', 'latn', 'arab', 'arabext']);
let numberingSystem = 'auto';

function normalizeNumerals(value) {
  const v = String(value ?? 'auto').toLowerCase();
  return NUMERALS.has(v) ? v : 'auto';
}

function announce(direction = typeof document !== 'undefined' ? document.documentElement.dir || 'ltr' : 'ltr') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('mud-locale-changed', { detail: { locale: current, dir: direction, numerals: numberingSystem } }));
}

/**
 * Which digits numbers are written with:
 *   'auto'    the browser's default for the language (Western 1 2 3 for Arabic in most browsers)
 *   'latn'    Western digits 1 2 3, always
 *   'arab'    Arabic-Indic digits ١ ٢ ٣ (with Arabic separators ٬ and ٫)
 *   'arabext' Extended Arabic-Indic digits ۱ ۲ ۳ (Persian, Urdu)
 * Applies to formatNumber / formatDate / formatRelativeTime, numbers passed to t(), and MudTail's components.
 * Raises "mud-locale-changed". Also settable with setLocale(…, { numerals }) and the theme (updateTheme({ numerals })).
 */
export function setNumerals(value, { silent = false } = {}) {
  const next = normalizeNumerals(value);
  if (next === numberingSystem) return numberingSystem;
  numberingSystem = next;
  if (!silent) announce();
  return numberingSystem;
}

export function getNumerals() {
  return numberingSystem;
}

/** The locale tag to give Intl: the active locale, plus "-u-nu-…" when the digits are not the default. */
export function intlLocale(locale = current) {
  return numberingSystem === 'auto' ? locale : `${locale}-u-nu-${numberingSystem}`;
}

/** The locale saved by setLocale(…, { persist: true }), else the browser's language if it has messages, else `fallback`. */
export function preferredLocale(fallback = 'en') {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
  } catch { /* storage blocked */ }
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  const lang = normalize(nav).split('-')[0];
  return catalogs.has(normalize(nav)) ? normalize(nav) : catalogs.has(lang) ? lang : fallback;
}

/** Calls fn({ locale, dir }) after every setLocale(). Returns a function that stops listening. */
export function onLocaleChange(fn) {
  const handler = (e) => fn(e.detail);
  window.addEventListener('mud-locale-changed', handler);
  return () => window.removeEventListener('mud-locale-changed', handler);
}

/** Does a key have a message in the active locale (or its language)? */
export function hasMessage(key, locale = current) {
  return lookup(key, [normalize(locale), normalize(locale).split('-')[0]]) !== undefined;
}

/**
 * Translates a key. params fill {placeholders}; params.count also picks the plural form.
 * `defaultText` (usually the English text) is used when no catalog has the key.
 */
export function t(key, params = {}, defaultText = undefined) {
  const chain = [current, current.split('-')[0], fallbackLocale];
  // Plural forms follow the language the message is written in; digits follow the page (see render).
  let source = chain.find((loc) => catalogs.get(loc)?.[key] !== undefined);
  let message = source ? catalogs.get(source)[key] : undefined;
  if (message === undefined) { message = defaultText ?? key; source = fallbackLocale; }
  return render(message, params, source);
}

// ───────── formatting in the active locale ─────────

export function formatNumber(value, options = {}) {
  return new Intl.NumberFormat(intlLocale(), options).format(value);
}

export function formatDate(value, options = { dateStyle: 'medium' }) {
  return new Intl.DateTimeFormat(intlLocale(), options).format(value instanceof Date ? value : new Date(value));
}

/** "3 days ago" / "in 2 hours" in the active locale. */
export function formatRelativeTime(value, unit, options = { numeric: 'auto' }) {
  return new Intl.RelativeTimeFormat(intlLocale(), options).format(value, unit);
}

/**
 * Rewrites the plain digits in a ready-made string with the chosen digits ("Page 3" → "Page ٣").
 * For text you did not format with formatNumber, e.g. numbers already inside a message.
 */
export function localizeDigits(text) {
  if (numberingSystem === 'auto' || numberingSystem === 'latn') return String(text);
  const zero = numberingSystem === 'arab' ? 0x0660 : 0x06f0;
  return String(text).replace(/[0-9]/g, (d) => String.fromCharCode(zero + Number(d)));
}

// ───────── markup ─────────

/**
 * Translates elements under `root` marked with:
 *   data-i18n="key"                         → text content
 *   data-i18n-html="key"                    → inner HTML (for messages that contain markup you trust)
 *   data-i18n-attr="placeholder:key;aria-label:key2"
 *   data-i18n-params='{"count":3}'          → parameters (JSON)
 * The element's current text / attribute is the default, so English markup keeps working without a catalog.
 */
export function translateElement(root = document.body) {
  const elements = root.matches?.('[data-i18n],[data-i18n-html],[data-i18n-attr]') ? [root] : [];
  elements.push(...root.querySelectorAll('[data-i18n],[data-i18n-html],[data-i18n-attr]'));
  for (const el of elements) {
    let params = {};
    try { params = el.dataset.i18nParams ? JSON.parse(el.dataset.i18nParams) : {}; } catch { /* bad JSON: no params */ }
    // Remember the original (default) text the first time, so switching back and forth works.
    if (el.dataset.i18n) {
      el.dataset.i18nDefault ??= el.textContent;
      el.textContent = t(el.dataset.i18n, params, el.dataset.i18nDefault);
    }
    if (el.dataset.i18nHtml) {
      el.dataset.i18nDefaultHtml ??= el.innerHTML;
      el.innerHTML = t(el.dataset.i18nHtml, params, el.dataset.i18nDefaultHtml);
    }
    for (const pair of (el.dataset.i18nAttr ?? '').split(';')) {
      const [attr, key] = pair.split(':').map((s) => s?.trim());
      if (!attr || !key) continue;
      const store = `i18nDefault${attr.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())}`;
      el.dataset[store] ??= el.getAttribute(attr) ?? '';
      el.setAttribute(attr, t(key, params, el.dataset[store]));
    }
  }
}

// ───────── internals ─────────

function normalize(locale) {
  return String(locale ?? '').trim().replace('_', '-').toLowerCase();
}

function lookup(key, chain) {
  for (const loc of chain) {
    const message = catalogs.get(loc)?.[key];
    if (message !== undefined) return message;
  }
  return undefined;
}

function render(message, params, locale) {
  let text = message;
  if (typeof message === 'function') text = message(params);
  else if (message && typeof message === 'object') {
    const count = Number(params.count ?? 0);
    const form = count === 0 && message.zero !== undefined ? 'zero' : new Intl.PluralRules(locale).select(count);
    text = message[form] ?? message.other ?? '';
  }
  // Numbers are written in the active locale and digits ({count} → "٣" with Arabic-Indic digits).
  const show = (v) => (typeof v === 'number' && Number.isFinite(v) ? new Intl.NumberFormat(intlLocale()).format(v) : String(v));
  return String(text).replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : show(params[name])));
}
