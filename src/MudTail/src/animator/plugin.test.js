import { test } from 'node:test';
import assert from 'node:assert/strict';
import full from './plugin.js';
import player from './player-plugin.js';
import { ANIMATOR_PLAYER_CSS, ANIMATOR_CSS } from './styles.js';

test('the two editions are one plugin: same name and version, the player edition without the Studio', () => {
  assert.equal(player.name, full.name);
  assert.equal(player.version, full.version);
  assert.deepEqual(Object.keys(player.components), ['animator-player']);
  assert.deepEqual(Object.keys(full.components).sort(), ['animator-player', 'animator-studio']);
  assert.deepEqual(Object.keys(player.behaviors), Object.keys(full.behaviors));
});

test('the player edition brings the player styles and control icons only', () => {
  assert.ok(ANIMATOR_CSS.startsWith(ANIMATOR_PLAYER_CSS));
  assert.equal(player.styles, ANIMATOR_PLAYER_CSS);
  assert.ok(!player.styles.includes('.mud-anim-topbar'));
  assert.deepEqual(Object.keys(player.icons).sort(), ['anim-next', 'anim-pause', 'anim-play', 'anim-prev', 'anim-restart']);
  assert.ok(Object.keys(player.messages.ar).every((k) => k.startsWith('animator.player.')));
});
