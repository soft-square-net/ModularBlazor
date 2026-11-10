import test from 'node:test';
import assert from 'node:assert/strict';
import { t, addMessages, setLocale, getLocale, isRtlLocale, hasMessage } from './i18n.js';
import arabic from '../locales/ar.js';

addMessages('ar', arabic);
addMessages('en', { greet: 'Hello {name}', items: { one: '{count} item', other: '{count} items' } });
addMessages('ar', { greet: 'مرحبًا {name}' });
addMessages('ar-eg', { greet: 'أهلًا {name}' });

test('English defaults and interpolation', () => {
  setLocale('en');
  assert.equal(t('greet', { name: 'Lina' }), 'Hello Lina');
  assert.equal(t('missing.key', {}, 'Default {x}'), 'Default {x}', 'unknown placeholders stay');
  assert.equal(t('missing.key'), 'missing.key', 'the key when there is nothing else');
  assert.equal(t('items', { count: 1 }), '1 item');
  assert.equal(t('items', { count: 5 }), '5 items');
});

test('lookup: exact locale, then its language, then the fallback, then the default text', () => {
  setLocale('ar-EG');
  assert.equal(getLocale(), 'ar-eg');
  assert.equal(t('greet', { name: 'Lina' }), 'أهلًا Lina');
  assert.equal(t('common.close'), 'إغلاق', 'from ar');
  assert.equal(t('items', { count: 2 }), '٢ items', 'from the en fallback: English plural rules, ar-EG default digits (Arabic-Indic)');
  assert.equal(t('nowhere', {}, 'English default'), 'English default');
  assert.equal(hasMessage('common.close'), true);
});

test('Arabic plural forms (zero, one, two, few, many, other)', () => {
  setLocale('ar');
  const forms = [0, 1, 2, 3, 11, 100].map((count) => t('dock.tabs', { count }));
  assert.deepEqual(forms, ['لا تبويبات', 'تبويب واحد', 'تبويبان', '3 تبويبات', '11 تبويبًا', '100 تبويب']);
});

test('defaults written as plural objects work for English too', () => {
  setLocale('en');
  assert.equal(t('dock.tabs', { count: 1 }, { one: '{count} tab', other: '{count} tabs' }), '1 tab');
  assert.equal(t('dock.tabs', { count: 4 }, { one: '{count} tab', other: '{count} tabs' }), '4 tabs');
});

test('right-to-left languages', () => {
  assert.equal(isRtlLocale('ar'), true);
  assert.equal(isRtlLocale('ar-EG'), true);
  assert.equal(isRtlLocale('he'), true);
  assert.equal(isRtlLocale('en-US'), false);
  setLocale('en');
});

test('numerals: auto (browser default), Western or Arabic-Indic, via setNumerals or setLocale', async () => {
  const { setNumerals, getNumerals, formatNumber, localizeDigits, intlLocale } = await import('./i18n.js');
  setLocale('ar');
  setNumerals('latn');
  assert.equal(formatNumber(1234.5), '1,234.5');
  assert.equal(t('dock.tabs', { count: 3 }), '3 تبويبات');
  assert.equal(intlLocale(), 'ar-u-nu-latn');

  setNumerals('arab');
  assert.equal(formatNumber(1234.5), '١٬٢٣٤٫٥');
  assert.equal(t('dock.tabs', { count: 3 }), '٣ تبويبات', 'numbers passed to t() follow the digits');
  assert.equal(t('dock.tabs', { count: 11 }), '١١ تبويبًا', 'the plural form is still chosen from the number');
  assert.equal(localizeDigits('Page 25'), 'Page ٢٥');

  setNumerals('auto');
  assert.equal(getNumerals(), 'auto');
  assert.equal(intlLocale(), 'ar');

  setLocale('ar', { numerals: 'arab' });
  assert.equal(getNumerals(), 'arab');
  assert.equal(setNumerals('nonsense'), 'auto', 'unknown values fall back to auto');
  setLocale('en');
});
