// MudTail Animator: the full plugin (Studio + player). Install it and MudTail gains
//   components  animator-studio   the editor (createComponent / Blazor create())
//               animator-player   plays a scene (object, JSON text or src URL)
//   behaviour   data-mud="animator-scene"  plays a scene in server-rendered or Razor markup (data-src or inline JSON)
//   API         getPlugin('animator'): createPlayer, createStudio, parseScene, validateScene, serializeScene, templates …
//
//   import { use } from 'mudtail';  import animator from 'mudtail/animator';  use(animator);
//   Blazor:  await mud.InvokeAsync<object>("loadPlugin", "./_content/MudTail/mudtail.animator.js");
//
// Pages that only play scenes can load the player-only edition instead (player-plugin.js → mudtail.animator.player.js):
// same plugin name, same player, behaviour and scene API, without the Studio. Install one edition per page.
//
// It imports nothing from MudTail: it uses ctx.mudtail and ctx.gsap, so the same file works bundled or loaded at runtime.

import { GSDevTools } from 'gsap/GSDevTools';
import { PLUGIN_FEATURES } from './gsap-plugins.js';
import { createStudio } from './studio/Studio.js';
import { ANIMATOR_ICONS } from './studio/icons.js';
import { ANIMATOR_CSS, ANIMATOR_TOKENS } from './styles.js';
import { ANIMATOR_AR } from './messages.ar.js';
import { TEMPLATES, sceneFromTemplate } from './templates.js';
import { PRESETS } from './presets.js';
import { EFFECTS } from './effects.js';
import { ANIMATOR_VERSION, depsFor, playerComponentFactory, sceneBehaviorFactory, playerApi } from './plugin-core.js';

export { ANIMATOR_VERSION };

const EXTRA = { GSDevTools }; // the Studio's preview (and the player's devtools option) use it
const playerComponent = playerComponentFactory(EXTRA);

function studioComponent(host, options, emit, ctx) {
  const studio = createStudio(host, options ?? {}, emit, depsFor(ctx, EXTRA));
  return {
    getScene: () => studio.getScene(),
    getSceneJson: () => studio.getSceneJson(),
    setScene: (scene) => studio.setScene(scene),
    loadTemplate: (id) => studio.loadTemplate(id),
    save: () => studio.save(),
    download: () => studio.download(),
    play: () => studio.play(),
    pause: () => studio.pause(),
    seek: (t) => studio.seek(t),
    setView: (id) => studio.setView(id),
    select: (layerIds = [], clipId = null) => studio.select(layerIds, clipId),
    undo: () => studio.undo(),
    redo: () => studio.redo(),
    isDirty: () => studio.dirty,
    refit: () => studio.refit(),
    dispose: () => studio.dispose(),
  };
}

const animator = {
  name: 'animator',
  version: ANIMATOR_VERSION,
  description: 'GSAP Animator Studio: compose responsive animated scenes (slideshows, cartoons, HTML motion) and play them anywhere.',
  requires: { mudtail: '^0.1.0' },
  tokens: ANIMATOR_TOKENS,
  styles: ANIMATOR_CSS,
  icons: ANIMATOR_ICONS,
  messages: { ar: ANIMATOR_AR },
  components: { 'animator-player': playerComponent, 'animator-studio': studioComponent },
  behaviors: { 'animator-scene': sceneBehaviorFactory(playerComponent) },

  setup(ctx) {
    const deps = depsFor(ctx, EXTRA);
    return {
      ...playerApi(ctx, deps, 'full'),
      /** createStudio(host, options, onEvent) → studio handle. */
      createStudio: (host, options = {}, onEvent = null) => ctx.handle(createStudio(host, options, ctx.emitter(onEvent), deps)),
      templates: () => TEMPLATES.map(({ id, name, description }) => ({ id, name, description })),
      templateScene: (id) => sceneFromTemplate(id),
      presets: () => PRESETS.map(({ id, label, group, type }) => ({ id, label, group, type })),
      clipTypes: () => Object.entries(EFFECTS).map(([type, e]) => ({ type, label: e.label, group: e.group, plugin: e.plugin, description: e.description })),
      gsapPlugins: () => PLUGIN_FEATURES.map(([name, what]) => ({ name, what })),
    };
  },
};

export default animator;
