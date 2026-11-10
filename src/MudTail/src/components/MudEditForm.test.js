import test from 'node:test';
import assert from 'node:assert/strict';
import { validateField } from './MudEditForm.js';
import { setLocale } from '../core/i18n.js';

setLocale('en');

test('validateField: required, by type', () => {
  assert.equal(validateField({ key: 'title', label: 'Title', required: true }, '  '), 'Title is required.');
  assert.equal(validateField({ key: 'title', label: 'Title', required: true }, 'Derby'), null);
  assert.equal(validateField({ key: 'ok', label: 'Terms', type: 'checkbox', required: true }, false), 'Terms is required.');
  assert.equal(validateField({ key: 'n', label: 'Views', type: 'number', required: true }, null), 'Views is required.');
  assert.equal(validateField({ key: 'n', label: 'Views', type: 'number' }, null), null, 'optional and empty: no rules run');
});

test('validateField: ranges, lengths, formats, patterns and custom rules', () => {
  const views = { key: 'views', label: 'Views', type: 'number', min: 0, max: 1000 };
  assert.equal(validateField(views, -1), 'Views must be at least 0.');
  assert.equal(validateField(views, 1001), 'Views must be at most 1,000.');
  assert.equal(validateField({ key: 'title', label: 'Title', minLength: 3, maxLength: 5 }, 'ab'), 'Title needs at least 3 characters.');
  assert.equal(validateField({ key: 'title', label: 'Title', minLength: 3, maxLength: 5 }, 'abcdef'), 'Title can have at most 5 characters.');
  assert.equal(validateField({ key: 'mail', label: 'Email', type: 'email' }, 'lina@'), 'Enter a valid email address.');
  assert.equal(validateField({ key: 'site', label: 'Site', type: 'url' }, 'not a url'), 'Enter a valid web address.');
  assert.equal(validateField({ key: 'code', label: 'Code', pattern: '[A-Z]{3}' }, 'ABCD'), 'Code is not in the expected format.', 'a string pattern must match the whole value');
  assert.equal(validateField({ key: 'code', label: 'Code', pattern: '[A-Z]{3}' }, 'ABC'), null);
  const end = { key: 'end', label: 'End', validate: (v, m) => (v < m.start ? 'End must be after start.' : null) };
  assert.equal(validateField(end, 1, { start: 5 }), 'End must be after start.');
  assert.equal(validateField(end, 9, { start: 5 }), null);
});
