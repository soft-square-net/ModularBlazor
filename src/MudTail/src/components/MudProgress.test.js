import test from 'node:test';
import assert from 'node:assert/strict';
import { toneColor, colorForValue } from './MudProgress.js';

test('toneColor: palette names become tokens, anything else is a CSS colour', () => {
  assert.equal(toneColor('success'), 'var(--mud-palette-success)');
  assert.equal(toneColor('#16a34a'), '#16a34a');
  assert.equal(toneColor('rgb(0 0 0 / 50%)'), 'rgb(0 0 0 / 50%)');
  assert.equal(toneColor(''), '');
  assert.equal(toneColor(null), '');
});

test('colorForValue: the last threshold whose "from" is reached, in any order', () => {
  const steps = [{ from: 75, color: 'success' }, { from: 0, color: 'error' }, { from: 40, color: 'warning' }];
  assert.equal(colorForValue(10, steps, 'primary'), 'error');
  assert.equal(colorForValue(40, steps, 'primary'), 'warning');
  assert.equal(colorForValue(99, steps, 'primary'), 'success');
  assert.equal(colorForValue(50, [{ from: 60, color: 'success' }], 'primary'), 'primary', 'below every threshold: the fallback');
  assert.equal(colorForValue(50, null, 'info'), 'info');
});
