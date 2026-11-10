// Demo localisation. The demo's pages are HTML templates written in English, so instead of a key per string the
// Arabic catalog is keyed by the English source text (gettext style) and rendered views are translated as they
// appear. Library components translate themselves with t(); this covers the demo's own content.
//
// Units: an element whose content is text plus inline markup (<code>, <strong>, <a>…) is translated as one
// sentence (so word order can change), otherwise each text node on its own; plus a few attributes. Code samples,
// editors and anything marked data-no-i18n are left alone.

import { addMessages, getLocale, hasMessage, t, setLocale, preferredLocale, getNumerals, localizeDigits } from 'mudtail';

export const DEMO_LOCALES = [
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'ar', name: 'العربية', short: 'ع' },
];

const SKIP = 'pre, code, kbd, script, style, svg, textarea, [data-no-i18n], .ide-editor, .ide-log, .mud-ticker__track time';
const INLINE = new Set(['CODE', 'STRONG', 'EM', 'B', 'I', 'A', 'KBD', 'BR', 'ABBR', 'SMALL', 'BDI']);
const ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'alt', 'data-caption', 'label'];
const HAS_LETTERS = /[A-Za-z]/;

let patterns = [];

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** Registers a catalog keyed by English text, plus [RegExp, replacement] patterns for text with variable parts. */
export function addDemoMessages(locale, { messages = {}, patterns: list = [] } = {}) {
  addMessages(locale, messages);
  if (locale === 'ar') patterns = patterns.concat(list);
}

function fromPatterns(key) {
  for (const [re, replacement] of patterns) {
    if (re.test(key)) return key.replace(re, replacement);
  }
  return null;
}

function translateText(text) {
  const key = norm(text);
  if (!key || !HAS_LETTERS.test(key)) return null;
  if (hasMessage(key)) return t(key);
  for (const [re, replacement] of patterns) {
    if (re.test(key)) return key.replace(re, replacement);
  }
  return null;
}

const ARABIC_LETTERS = /[؀-ۿ]/;

/**
 * The demo's static numbers ("1,428,900") are plain text, not formatNumber(): with Arabic-Indic digits chosen,
 * rewrite them in Arabic text and in number-only text (not in English text, e.g. product names like "VS 2026").
 */
function withDigits(text) {
  const numerals = getNumerals();
  if (numerals !== 'arab' && numerals !== 'arabext') return text;
  if (!/[0-9]/.test(text) || (HAS_LETTERS.test(text) && !ARABIC_LETTERS.test(text))) return text;
  // Number runs only, not codes glued to Latin letters ("P99", "v22.14", "H2").
  return text.replace(/(?<![A-Za-z0-9.,])\d+(?:[.,]\d+)*(?![A-Za-z0-9])/g, (run) =>
    localizeDigits(run.replace(/,(?=\d{3})/g, '٬').replace(/\.(?=\d)/g, '٫')));
}

/** Translates one text node (and its digits), keeping its surrounding whitespace. */
function translateTextNode(node) {
  const translated = translateText(node.data);
  const out = withDigits(translated ?? norm(node.data));
  if (translated === null && out === norm(node.data)) return;
  const lead = node.data.match(/^\s*/)[0];
  const tail = node.data.match(/\s*$/)[0];
  const next = lead + out + tail;
  // Only write real changes: writing the same text would wake the observer again, forever.
  if (next !== node.data) node.data = next;
}

function isRichUnit(el) {
  let hasInline = false;
  let hasText = false;
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) { if (child.data.trim()) hasText = true; continue; }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    if (!INLINE.has(child.tagName)) return false;
    hasInline = true;
  }
  return hasInline && hasText;
}

const skipped = (node) => !!(node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest(SKIP);

/** Visits translation units under root: callback(kind, key, target) for 'html', 'text' and 'attr'. */
function visit(root, callback) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    if (!skipped(root)) callback('text', norm(root.data), root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || root.closest(SKIP)) return;

  const walk = (el) => {
    if (el.matches(SKIP)) return;
    for (const attr of ATTRIBUTES) {
      const value = el.getAttribute(attr);
      if (value && HAS_LETTERS.test(value)) callback('attr', norm(value), el, attr);
    }
    if (isRichUnit(el)) {
      callback('html', norm(el.innerHTML), el);
      return;
    }
    for (const child of [...el.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) { if (child.data.trim()) callback('text', norm(child.data), child); }
      else if (child.nodeType === Node.ELEMENT_NODE) walk(child);
    }
  };
  walk(root);
}

/** Translates everything under root into the active locale (no-op in English). */
export function localizeTree(root) {
  if (getLocale() === 'en') return;
  visit(root, (kind, key, target, attr) => {
    if (kind === 'text') translateTextNode(target);
    else if (kind === 'attr') { const out = translateText(key); if (out !== null && out !== target.getAttribute(attr)) target.setAttribute(attr, out); }
    else if (kind === 'html') {
      const out = hasMessage(key) ? t(key) : fromPatterns(key);
      if (out !== null && out !== key) target.innerHTML = out; // unchanged text is left alone (see translateTextNode)
      else if (out !== null) { /* already in its final form */ }
      else for (const child of [...target.childNodes]) if (child.nodeType === Node.TEXT_NODE) translateTextNode(child);
    }
  });
}

/**
 * Starts the demo in the saved language: sets the library locale (lang, dir, MudTail's own texts) and keeps
 * translating whatever the demo renders. Call before the first render.
 */
export function startDemoI18n() {
  const locale = preferredLocale('en');
  setLocale(DEMO_LOCALES.some((l) => l.code === locale) ? locale : 'en');
  if (getLocale() === 'en') return;

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') m.addedNodes.forEach((n) => localizeTree(n));
      else if (m.type === 'characterData') { if (!skipped(m.target)) translateTextNode(m.target); }
      else if (m.type === 'attributes') {
        const value = m.target.getAttribute(m.attributeName);
        const out = value && !m.target.closest(SKIP) ? translateText(value) : null;
        if (out !== null && out !== value) m.target.setAttribute(m.attributeName, out);
      }
    }
  });
  const begin = () => {
    localizeTree(document.body);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
  };
  if (document.body) begin(); else document.addEventListener('DOMContentLoaded', begin, { once: true });

  // The tab title is set by the router: translate it too.
  const titleEl = document.querySelector('title');
  if (titleEl) {
    new MutationObserver(() => {
      const out = translateText(document.title) ?? document.title.replace(/^(.+?) · MudTail$/, (_, page) => `${translateText(page) ?? page} · MudTail`);
      if (out !== document.title) document.title = out;
    }).observe(titleEl, { childList: true, characterData: true, subtree: true });
    document.title = translateText(document.title) ?? document.title;
  }
}

/** Switches the demo's language: remembered, then the page reloads so every view renders in it. */
export function switchDemoLocale(code) {
  setLocale(code, { persist: true });
  location.reload();
}

/** A language switch button for an app bar: shows the other language. */
export function languageButton(className = '') {
  const other = DEMO_LOCALES.find((l) => l.code !== getLocale()) ?? DEMO_LOCALES[0];
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.lang = other.code;
  b.dir = other.code === 'ar' ? 'rtl' : 'ltr';
  b.textContent = other.name;
  b.setAttribute('data-no-i18n', '');
  b.setAttribute('aria-label', other.code === 'ar' ? 'التبديل إلى العربية' : 'Switch to English');
  b.addEventListener('click', () => switchDemoLocale(other.code));
  return b;
}

/**
 * Development aid: the English units under root that have no translation yet (code and brand names excluded).
 * Run in the browser console on any page: __i18nMissing()
 */
export function missingUnits(root = document.body) {
  const found = new Set();
  const ignore = /^(MudTail|GSAP|Tailwind( CSS)?|Blazor|RTL|LTR|CSS|JS|HTML|SCSS|API|JSON|IDE|UI|\.NET|Razor|C#|EN|OK|PNG|JPG|SVG|URL|GET|POST|DOM|[A-Z]|GD|Pts|HT|FT|[A-Z]{2,4}|[\w.-]+\.(js|cs|css|scss|json|razor|md|html))$/;
  // Measurements and versions read the same in Arabic technical UI: "42 ms", "64 GB", "4px", "v2.4".
  const measure = /^[\d\s.,/%:–+-]*(ms|MB|GB|kB|px)?[\d\s.,/%–+-]*$|^v\d/;
  visit(root, (kind, key) => {
    if (!key || !HAS_LETTERS.test(key) || ignore.test(key) || measure.test(key)) return;
    // Translated text that keeps a Latin product name ("شبكة Tailwind CSS") is done; only English remains to check.
    if (/[؀-ۿ]/.test(key.replace(/<[^>]*>/g, ''))) return;
    // Bare code-like text (class names, calls) stays as it is; sentences that mention code are still checked.
    if (kind !== 'html' && /^[.#@<{(]|mud-|=>|\(\)/.test(key)) return;
    const known = hasMessage(key, 'ar') || patterns.some(([re]) => re.test(key));
    if (!known) found.add(key);
  });
  return [...found];
}

if (typeof window !== 'undefined') window.__i18nMissing = missingUnits;
