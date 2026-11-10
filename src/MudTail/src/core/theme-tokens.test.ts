import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PALETTE_PRESETS,
  generateExportableCss,
  generateTailwindConfigSnippet,
  getElevationShadow,
  hexToRgb,
  isValidHex,
  normalizeHex,
  getContrastRatio,
  createCustomPalette,
} from './theme-tokens';

test('PALETTE_PRESETS contains default MudBlazor and Material palettes', () => {
  assert.equal(typeof PALETTE_PRESETS.mudblazor, 'object');
  assert.equal(PALETTE_PRESETS.mudblazor.primary, '#594ae2');
  assert.equal(typeof PALETTE_PRESETS.materialBlue, 'object');
});

test('generateExportableCss outputs valid CSS tokens and rules', () => {
  const css = generateExportableCss({
    palette: PALETTE_PRESETS.mudblazor,
    borderRadius: 4,
    elevationScale: 1,
    darkMode: false,
  });

  assert.equal(css.includes('--mud-palette-primary: #594ae2;'), true);
  assert.equal(css.includes('--mud-default-borderradius: 4px;'), true);
  assert.equal(css.includes('--mud-elevation-24:'), true);
  assert.equal(css.includes('.mud-elevation-24'), true);
  assert.equal(css.includes('.mud-paper'), true);
  assert.equal(css.includes('[data-theme="dark"]'), true);
  assert.equal(css.includes('.mud-card'), true);
  assert.equal(css.includes('.mud-ripple'), true);
  assert.equal(css.includes('.mud-rounded-0'), true);
  assert.equal(css.includes('.mud-rounded-base'), true);
  assert.equal(css.includes('.mud-rounded-full'), true);
  assert.equal(css.includes('.mud-appbar'), true);
  assert.equal(css.includes('.mud-toolbar'), true);
  assert.equal(css.includes('.mud-drawer'), true);
  assert.equal(css.includes('.mud-tabs'), true);
});

test('getElevationShadow generates distinct shadow levels up to 24', () => {
  assert.equal(getElevationShadow(0), 'none');
  const shadow1 = getElevationShadow(1);
  const shadow4 = getElevationShadow(4);
  const shadow24 = getElevationShadow(24);
  assert.equal(shadow1.includes('rgba'), true);
  assert.notEqual(shadow1, shadow4);
  assert.notEqual(shadow4, shadow24);
});

test('generateTailwindConfigSnippet produces valid tailwind config', () => {
  const snippet = generateTailwindConfigSnippet(PALETTE_PRESETS.mudblazor);
  assert.equal(snippet.includes("primary: '#594ae2'"), true);
  assert.equal(snippet.includes('var(--mud-default-borderradius)'), true);
  assert.equal(snippet.includes('mud-24'), true);
});

test('hexToRgb and hex helpers work properly', () => {
  assert.equal(hexToRgb('#ffffff'), '255, 255, 255');
  assert.equal(isValidHex('#594ae2'), true);
  assert.equal(isValidHex('invalid'), false);
  assert.equal(normalizeHex('ff4081'), '#ff4081');

  const custom = createCustomPalette('#0ea5e9', '#f43f5e', 'Ocean Rose');
  assert.equal(custom.primary, '#0ea5e9');
  assert.equal(custom.secondary, '#f43f5e');
  assert.equal(custom.name, 'Ocean Rose');

  const contrast = getContrastRatio('#ffffff', '#000000');
  assert.equal(contrast >= 15, true);
});
