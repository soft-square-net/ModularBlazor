// MudTail Animator, player-only edition: for sites that play scenes made in the Studio but never edit them.
// Same plugin name ('animator'), same animator-player component, data-mud="animator-scene" behaviour and scene API
// (createPlayer, parseScene, validateScene, serializeScene) as the full plugin, without the Studio, its templates,
// presets and GSDevTools. Install one edition per page.
//
//   import { use } from 'mudtail';  import animator from 'mudtail/animator/player';  use(animator);
//   Blazor:  await mud.InvokeAsync<object>("loadPlugin", "./_content/MudTail/mudtail.animator.player.js");

import { ANIMATOR_PLAYER_CSS } from './styles.js';
import { ANIMATOR_AR } from './messages.ar.js';
import { ANIMATOR_VERSION, PLAYER_ICONS, depsFor, playerComponentFactory, sceneBehaviorFactory, playerApi } from './plugin-core.js';

export { ANIMATOR_VERSION };

const playerComponent = playerComponentFactory();

const animatorPlayer = {
  name: 'animator',
  version: ANIMATOR_VERSION,
  description: 'GSAP Animator player: plays Animator Studio scenes (slideshows, cartoons, HTML motion) in MudTail sites.',
  requires: { mudtail: '^0.1.0' },
  styles: ANIMATOR_PLAYER_CSS,
  icons: PLAYER_ICONS,
  messages: { ar: Object.fromEntries(Object.entries(ANIMATOR_AR).filter(([k]) => k.startsWith('animator.player.'))) },
  components: { 'animator-player': playerComponent },
  behaviors: { 'animator-scene': sceneBehaviorFactory(playerComponent) },
  setup: (ctx) => playerApi(ctx, depsFor(ctx), 'player'),
};

export default animatorPlayer;
