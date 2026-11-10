import test from 'node:test';
import assert from 'node:assert/strict';
import { generateScssExport, generateCssExport, DEFAULT_THEME } from './theme.js';

test('theme exports valid SCSS tokens', () => {
  const scss = generateScssExport(DEFAULT_THEME);
  assert.equal(scss.includes('$mud-palette-primary: #594ae2;'), true);
  assert.equal(scss.includes('$mud-palette-secondary: #ff4081;'), true);
  assert.equal(scss.includes('$mud-default-borderradius: 4px;'), true);
  assert.equal(scss.includes('@mixin mud-rounded'), true);
});

test('theme exports valid standalone CSS tokens and classes', () => {
  const css = generateCssExport(DEFAULT_THEME);
  assert.equal(css.includes('--mud-palette-primary: #594ae2;'), true);
  assert.equal(css.includes('--mud-default-borderradius: 4px;'), true);
  assert.equal(css.includes('.mud-rounded'), true);
  assert.equal(css.includes('.mud-elevation-4'), true);
});
