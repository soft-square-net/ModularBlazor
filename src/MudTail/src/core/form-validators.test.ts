import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEmail,
  evaluatePasswordStrength,
  validateNumericRange,
  formatCurrency,
} from './form-validators';

test('validateEmail validates correct and incorrect emails', () => {
  assert.equal(validateEmail('test@example.com').isValid, true);
  assert.equal(validateEmail('user.name+tag@domain.co.uk').isValid, true);
  assert.equal(validateEmail('').isValid, false);
  assert.equal(validateEmail('plainaddress').isValid, false);
  assert.equal(validateEmail('@missingusername.com').isValid, false);
});

test('evaluatePasswordStrength correctly rates passwords', () => {
  const weak = evaluatePasswordStrength('short');
  assert.equal(weak.score <= 1, true);

  const medium = evaluatePasswordStrength('Password123');
  assert.equal(medium.score >= 3, true);

  const veryStrong = evaluatePasswordStrength('C0mpl3x#P@ssw0rd!');
  assert.equal(veryStrong.score, 4);
  assert.equal(veryStrong.label, 'Very Strong');
});

test('validateNumericRange checks bounds accurately', () => {
  assert.equal(validateNumericRange(50, 10, 100).isValid, true);
  assert.equal(validateNumericRange(5, 10, 100).isValid, false);
  assert.equal(validateNumericRange(105, 10, 100).isValid, false);
  assert.equal(validateNumericRange('invalid', 0, 10).isValid, false);
});

test('formatCurrency formats USD correctly', () => {
  const formatted = formatCurrency(1250.5);
  assert.equal(formatted.includes('1,250.50'), true);
});
