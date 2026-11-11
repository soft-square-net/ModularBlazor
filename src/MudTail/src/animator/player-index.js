// MudTail Animator, player-only package entry ('mudtail/animator/player'): the player-only plugin as the default
// export, plus the scene helpers a page may need. The Studio and its templates are in 'mudtail/animator'.

export { default, ANIMATOR_VERSION } from './player-plugin.js';
export {
  SCENE_TYPE, SCENE_VERSION, SceneError, normalizeScene, parseScene, validateScene, serializeScene, pickView, sceneDuration,
} from './scene.js';
export { createPlayer } from './player.js';
export { registerAnimatorPlugins } from './gsap-plugins.js';
