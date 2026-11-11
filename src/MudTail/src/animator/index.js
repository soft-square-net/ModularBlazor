// MudTail Animator: the package entry ('mudtail/animator'). The default export is the plugin; the named exports are
// the scene format and helpers, for tools that read or write scenes (a CMS, a server-side importer, tests).

export { default, ANIMATOR_VERSION } from './plugin.js';
export {
  SCENE_TYPE, SCENE_VERSION, DEFAULT_VIEWS, DEFAULT_SETTINGS, LAYER_KINDS, SceneError,
  createScene, createLayer, createClip, createAsset, addLayer, normalizeScene, parseScene, validateScene, serializeScene, cloneScene,
  resolveLayerProps, resolveClip, setLayerProps, pickView, getView, sceneDuration, sceneFileName,
} from './scene.js';
export { SHAPES, MOTION_PATHS, shapePath, motionPath } from './shapes.js';
export { EASE_NAMES, EASE_KINDS, toEase, easeKey } from './eases.js';
export { EFFECTS, TWEEN_PROPS } from './effects.js';
export { PRESETS, clipFromPreset } from './presets.js';
export { TEMPLATES, sceneFromTemplate } from './templates.js';
export { CANVAS_EFFECTS } from './canvas-effects.js';
export { PLUGIN_FEATURES, registerAnimatorPlugins } from './gsap-plugins.js';
export { createPlayer } from './player.js';
export { createStudio } from './studio/Studio.js';
