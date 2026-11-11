import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MUDTAIL_VERSION, PluginError, definePlugin, use, removePlugin, getPlugin, hasPlugin, listPlugins, loadPlugin,
  createComponent, componentNames, registerComponent, pluginTailwindCss, satisfies, reserveComponentNames,
} from './plugins.js';
import { getBehavior, behaviorNames } from '../behaviors/autoInit.js';
import { getIconSvg, hasIcon } from './icons.js';
import { t, setLocale } from './i18n.js';

const counter = (name, extra = {}) => definePlugin({
  name,
  version: '1.2.0',
  icons: { [`${name}-dot`]: '<circle cx="12" cy="12" r="4"/>' },
  messages: { en: { [`${name}.hello`]: 'Hello {who}' } },
  behaviors: { [`${name}-b`]: (el) => ({ el, dispose() {} }) },
  components: {
    [name]: (host, options, emit) => {
      let value = options.start ?? 0;
      return { increment() { value += 1; emit('change', value); return value; }, dispose() { emit('disposed', value); } };
    },
  },
  setup(ctx, options) {
    return { greet: (who) => ctx.t(`${name}.hello`, { who }), options };
  },
  ...extra,
});

test('the version matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(MUDTAIL_VERSION, pkg.version);
});

test('use() installs everything a plugin declares and removePlugin() undoes it', () => {
  setLocale('en');
  const record = use(counter('alpha'), { size: 2 });
  assert.equal(record.version, '1.2.0');
  assert.ok(hasPlugin('alpha'));
  assert.equal(getPlugin('alpha').greet('Sara'), 'Hello Sara');
  assert.deepEqual(getPlugin('alpha').options, { size: 2 });
  assert.ok(hasIcon('alpha-dot'));
  assert.match(getIconSvg('alpha-dot'), /<circle cx="12"/);
  assert.ok(behaviorNames().includes('alpha-b'));
  assert.ok(componentNames().includes('alpha'));
  assert.deepEqual(listPlugins().find((p) => p.name === 'alpha'), { name: 'alpha', version: '1.2.0', description: '', components: ['alpha'], behaviors: ['alpha-b'] });

  const events = [];
  const handle = createComponent('alpha', null, { start: 5 }, (name, payload) => events.push([name, payload]));
  assert.equal(handle.increment(), 6);
  assert.deepEqual(events, [['change', 6]]);
});

test('the same definition twice returns the first record; another one needs replace', () => {
  const def = counter('beta');
  const first = use(def);
  assert.equal(use(def), first);
  assert.throws(() => use(counter('beta')), PluginError);
  const second = use(counter('beta'), {}, { replace: true });
  assert.notEqual(second, first);
  removePlugin('beta');
});

test('removing a plugin disposes its live components and unregisters everything', () => {
  const events = [];
  const handle = createComponent('alpha', null, {}, { disposed: (v) => events.push(v) });
  handle.increment();
  assert.equal(removePlugin('alpha'), true);
  assert.deepEqual(events.slice(-1), [1], 'the live component was disposed');
  assert.ok(!hasPlugin('alpha'));
  assert.ok(!hasIcon('alpha-dot'));
  assert.equal(getBehavior('alpha-b'), null);
  assert.ok(!componentNames().includes('alpha'));
  assert.throws(() => createComponent('alpha', null), PluginError);
  handle.dispose(); // idempotent
  assert.equal(removePlugin('alpha'), false);
});

test('a plugin that overrides a behaviour puts the old one back when removed', () => {
  const original = getBehavior('ticker');
  use(definePlugin({ name: 'ticker-plus', behaviors: { ticker: () => null } }));
  assert.notEqual(getBehavior('ticker'), original);
  removePlugin('ticker-plus');
  assert.equal(getBehavior('ticker'), original);
});

test('requirements: MudTail version and other plugins', () => {
  assert.throws(() => use(definePlugin({ name: 'future', requires: { mudtail: '>=9.0.0' } })), /needs MudTail >=9\.0\.0/);
  assert.throws(() => use(definePlugin({ name: 'child', requires: { plugins: ['parent'] } })), /needs the plugin "parent"/);
  use(definePlugin({ name: 'parent', version: '2.1.0', setup: () => ({ id: 'p' }) }));
  assert.throws(() => use(definePlugin({ name: 'child', requires: { plugins: { parent: '^1.0.0' } } })), /needs "parent" \^1\.0\.0/);
  const child = use(definePlugin({ name: 'child', requires: { mudtail: '^0.1.0', plugins: { parent: '^2.0.0' } }, setup: (ctx) => ({ parentId: ctx.plugin('parent').id }) }));
  assert.equal(child.api.parentId, 'p');
  assert.throws(() => removePlugin('parent'), /"child" requires it/);
  removePlugin('parent', { force: true });
  assert.ok(!hasPlugin('child'));
});

test('a failing setup rolls back what was registered', () => {
  assert.throws(() => use(definePlugin({
    name: 'broken',
    icons: { 'broken-icon': '<path d="M0 0"/>' },
    components: { broken: () => ({}) },
    setup() { throw new Error('boom'); },
  })), /plugin "broken": boom/);
  assert.ok(!hasPlugin('broken'));
  assert.ok(!hasIcon('broken-icon'));
  assert.ok(!componentNames().includes('broken'));
});

test('async setup: api arrives with ready; loadPlugin accepts a module', async () => {
  let cleaned = false;
  const record = await loadPlugin({ default: definePlugin({ name: 'later', async setup(ctx) { await null; ctx.track(() => { cleaned = true; }); return { ok: true }; } }) });
  assert.deepEqual(record.api, { ok: true });
  removePlugin('later');
  assert.ok(cleaned);

  const failing = use(definePlugin({ name: 'later-fail', icons: { 'lf-icon': '<path d="M1 1"/>' }, async setup() { throw new Error('nope'); } }));
  await assert.rejects(failing.ready, /nope/);
  assert.ok(!hasPlugin('later-fail'));
  assert.ok(!hasIcon('lf-icon'));
});

test('validation reports mistakes early', () => {
  assert.throws(() => definePlugin({ name: 'Bad Name' }), /not a valid name/);
  assert.throws(() => definePlugin({ name: 'x', version: '1' }), /not x\.y\.z/);
  assert.throws(() => definePlugin({ name: 'x', setpu() {} }), /unknown key "setpu"/);
  assert.throws(() => definePlugin({ name: 'x', components: { a: 1 } }), /components\.a must be a function/);
  assert.ok(definePlugin({ name: '@acme/charts', version: '1.0.0-beta.1' }));
  reserveComponentNames(['tabs']);
  assert.throws(() => registerComponent('tabs', () => ({})), /built-in/);
});

test('satisfies() understands the usual ranges', () => {
  assert.ok(satisfies('0.1.0', '^0.1.0'));
  assert.ok(!satisfies('0.2.0', '^0.1.0'));
  assert.ok(satisfies('1.4.2', '^1.2.0'));
  assert.ok(!satisfies('2.0.0', '^1.2.0'));
  assert.ok(satisfies('1.2.9', '~1.2.0'));
  assert.ok(!satisfies('1.3.0', '~1.2.0'));
  assert.ok(satisfies('1.0.0', '>=0.9.0 <2.0.0'));
  assert.ok(satisfies('3.0.0', '^1.0.0 || ^3.0.0'));
  assert.ok(satisfies('5.0.0', '*'));
});

test('pluginTailwindCss maps colour tokens (and explicit namespaces) to Tailwind utilities', () => {
  const css = pluginTailwindCss(definePlugin({
    name: 'countdown',
    version: '1.0.0',
    tokens: {
      'countdown-digit': { light: '#1f2937', dark: '#f9fafb' },
      'countdown-accent': 'var(--mud-palette-primary)',
      'countdown-gap': { value: '0.5rem', tailwind: 'spacing' },
      'countdown-duration': '400ms',
    },
  }), { source: '../plugins' });
  assert.match(css, /@source "\.\.\/plugins";/);
  assert.match(css, /--color-countdown-digit: var\(--mud-countdown-digit\);/);
  assert.match(css, /--color-countdown-accent: var\(--mud-countdown-accent\);/);
  assert.match(css, /--spacing-countdown-gap: var\(--mud-countdown-gap\);/);
  assert.doesNotMatch(css, /countdown-duration/);
});

test('t() sees plugin messages', () => {
  use(definePlugin({ name: 'texts', messages: { ar: { 'texts.days': 'أيام' } } }));
  setLocale('ar');
  assert.equal(t('texts.days', {}, 'days'), 'أيام');
  setLocale('en');
  removePlugin('texts');
});
