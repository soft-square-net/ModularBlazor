// Components ▸ Plugins ▸ Animator Studio: the GSAP Animator plugin. Scenes made in the Studio, played by its player.
import { use, hasPlugin, getPlugin, createComponent, createMudButton } from 'mudtail';
import animator from 'mudtail/animator';
import { componentPage } from './page.js';

const ensure = () => { if (!hasPlugin('animator')) use(animator); };
const api = () => { ensure(); return getPlugin('animator'); };

const log = () => {
  const p = document.createElement('p');
  p.className = 'cp-tree-log';
  p.setAttribute('role', 'status');
  return p;
};

/** A player for a template scene, with an event log. */
function mountTemplate(id, options = {}, extra = null) {
  return (el) => {
    const scene = api().templateScene(id);
    const host = document.createElement('div');
    host.style.maxWidth = '960px';
    const status = log();
    const handle = createComponent('animator-player', host, { scene, ...options }, (name, payload) => {
      if (name === 'ready') status.textContent = `ready: ${payload.duration.toFixed(1)} s, view "${payload.view}", ${payload.mode}${payload.labels.length ? `, labels ${payload.labels.join(', ')}` : ''}`;
      else if (name === 'slide') status.textContent = `slide ${payload.index + 1} / ${payload.count}: ${payload.label}`;
      else if (name === 'view') status.textContent = `view changed to "${payload.view}" (Flip animates the layout)`;
      else if (name === 'interaction') status.textContent = `interaction: ${payload.action} on ${payload.layerId}`;
    });
    el.append(host);
    if (extra) el.append(extra(handle, status));
    el.append(status);
    return () => handle.dispose();
  };
}

const views = (handle) => {
  const bar = document.createElement('div');
  bar.className = 'cp-row';
  for (const [id, label] of [['auto', 'Auto (by width)'], ['desktop', 'Desktop'], ['tablet', 'Tablet'], ['mobile', 'Mobile']]) {
    bar.appendChild(createMudButton({ text: label, variant: 'outlined', size: 'small', onClick: () => handle.setView(id) }));
  }
  bar.appendChild(createMudButton({ text: 'Restart', variant: 'text', size: 'small', onClick: () => handle.restart() }));
  return bar;
};

export const ANIMATOR_PAGE = {
  id: 'animator', label: 'Animator Studio', icon: 'sparkles',
  render: () => componentPage({
    title: 'GSAP Animator Studio', trail: ['Components', 'Plugins'], kinds: ['Plugin', 'JS', 'Behaviour', 'Blazor'],
    lead: 'A plugin that adds a scene editor and a player. In the <a href="./animator.html" target="_blank" rel="noopener"><strong>Studio</strong></a> you compose a scene from layers (shapes, text, images, SVG, icons, video, audio, HTML, canvas effects), lay it out for Desktop, Tablet and Mobile, and animate it on a timeline with GSAP and its plugins: MorphSVG, DrawSVG, MotionPath, SplitText, Text, ScrambleText, Physics2D, PhysicsProps, CustomEase / Bounce / Wiggle, EasePack, Draggable + Inertia, Flip, ScrollTrigger, Observer and GSDevTools. Scenes are JSON: save, export and import them, then play them anywhere MudTail runs.',
    examples: [
      {
        title: 'Open the Studio',
        description: 'The editor needs the whole screen, so it has its own page. Start from a template, drop in your images, pick presets, drag clips on the timeline, preview, then export the scene file.',
        mount: (el) => {
          const row = document.createElement('div');
          row.className = 'cp-row';
          for (const [t, label] of [['', 'Open the Studio'], ['slideshow', 'Slideshow template'], ['cartoon', 'Cartoon template'], ['logo', 'Logo reveal template']]) {
            const a = document.createElement('a');
            a.href = `./animator.html${t ? `?template=${t}` : ''}`;
            a.target = '_blank';
            a.rel = 'noopener';
            a.className = `mud-button-root mud-button-${t ? 'outlined' : 'filled'} mud-button-primary mud-button-medium`;
            a.textContent = label;
            row.appendChild(a);
          }
          el.appendChild(row);
        },
        code: `import { use, createComponent } from 'mudtail';
          import animator from 'mudtail/animator';

          use(animator);
          const studio = createComponent('animator-studio', document.querySelector('#studio'), {
            template: 'slideshow',            // or scene: savedJson
            uploadUrl: '/api/media/upload',   // optional: store uploads on the server ({ url } back)
          }, {
            save: ({ id, name, json }) => fetch('/api/scenes/' + id, { method: 'PUT', body: json }),
          });
          // studio.getSceneJson(), .setScene(json), .save(), .play(), .setView('mobile'), .dispose()`,
      },
      {
        title: 'Slideshow (labels are slides)',
        description: 'Prev / next, dots, swipe, wheel and arrow keys (Observer); each slide plays from its label to the next. Iris reveals (clip-path), masked lines (SplitText), scramble kickers, morphing shapes, particles. Auto-advances after 3 s.',
        mount: mountTemplate('slideshow', { controls: true }),
        code: `createComponent('animator-player', host, { scene, controls: true }, {
            slide: ({ index, label, count }) => console.log(index, label, count),
          });`,
      },
      {
        title: 'Cartoon, per view',
        description: 'A character made of shapes: squash-and-bounce (CustomBounce), blink, motion paths, wiggles, a drawn smile. The player picks the view by width; force one to see Tablet and Mobile layouts, and Flip animating the change.',
        mount: mountTemplate('cartoon', { controls: true }, views),
        code: `const player = createComponent('animator-player', host, { scene });
          player.setView('mobile');   // 'auto' goes back to picking by width`,
      },
      {
        title: 'Logo reveal',
        description: 'DrawSVG strokes, MorphSVG star → heart with a colour change, 3D SplitText characters, ScrambleText, a starfield and a confetti burst on canvas.',
        mount: mountTemplate('logo', { controls: true }),
        code: `createComponent('animator-player', host, { src: '/scenes/logo-reveal.mudscene.json', controls: true });`,
      },
      {
        title: 'Interactive',
        description: 'Draggable layers you can throw (InertiaPlugin), a star that replays the scene when clicked, a hover effect: interactions are part of the scene.',
        mount: mountTemplate('interactive'),
        code: `// in the scene: layer.draggable = { type: 'x,y', inertia: true, bounds: true }
          // layer.interactions = [{ on: 'click', action: 'restart' }, { on: 'hover', action: 'animate', to: { scale: 1.1 } }]`,
      },
      {
        title: 'Markup and Razor',
        description: 'Server-rendered pages need no script of their own: <code>data-mud="animator-scene"</code> plays a scene from <code>data-src</code> or an inline JSON block. <code>data-trigger="scroll"</code> scrubs it with the page.',
        mount: (el) => {
          ensure();
          const scene = JSON.stringify(api().templateScene('stats')).replace(/</g, '\\u003c');
          el.innerHTML = `<div data-mud="animator-scene" data-trigger="load" style="max-width:960px"><script type="application/json">${scene}</script></div>`;
        },
        code: `<div data-mud="animator-scene" data-src="/scenes/stats.mudscene.json" data-trigger="visible"></div>

          <!-- options: data-view="mobile" data-fit="cover" data-controls="true" data-loop="true" data-trigger="scroll" -->
          <!-- events bubble from the element: animator:ready, animator:slide, animator:complete … -->`,
        language: 'HTML / Razor',
      },
      {
        title: 'Blazor',
        description: 'Load the plugin once (the Layouts module already imports MudTail), then create a player or the Studio like any MudTail component. Pages that only play scenes load <code>mudtail.animator.player.js</code> (about 107 KB gzipped, no Studio); editor pages load <code>mudtail.animator.js</code>. Both register the same <code>animator</code> plugin, so load one per page. <code>OnMudEvent</code> receives ready, slide, complete, interaction, and the Studio\'s save with the scene JSON.',
        code: `@inject IJSRuntime JS
          <div @ref="host"></div>

          @code {
              ElementReference host;
              IJSObjectReference? player;

              protected override async Task OnAfterRenderAsync(bool firstRender)
              {
                  if (!firstRender) return;
                  var mud = await JS.InvokeAsync<IJSObjectReference>("moduleHost.get", "Layouts.Default");
                  await mud.InvokeAsync<JsonElement>("loadPlugin", "./_content/MudTail/mudtail.animator.player.js"); // player only
                  player = await mud.InvokeAsync<IJSObjectReference>("create", "animator-player", host,
                      new { scene = SceneJson, controls = true }, DotNetObjectReference.Create(this));
              }

              [JSInvokable] public Task OnMudEvent(string name, JsonElement payload) => Task.CompletedTask;

              public async ValueTask DisposeAsync() { if (player is not null) await player.InvokeVoidAsync("dispose"); }
          }`,
        language: 'Razor',
      },
    ],
    api: [
      { title: 'animator-player options', rows: [
        ['scene | src', 'The scene (object or JSON text), or a URL to fetch it from.'],
        ['view', '<code>\'auto\'</code> (default: by the container\'s width) or a view id: <code>desktop</code>, <code>tablet</code>, <code>mobile</code>, …'],
        ['trigger', 'Overrides the scene\'s: <code>load</code>, <code>visible</code>, <code>scroll</code> (scrub, optional pin), <code>click</code>, <code>hover</code>, <code>none</code>.'],
        ['controls, loop, speed, fit', 'Show play / scrub or slide controls; loop forever; time scale; <code>contain</code>, <code>cover</code> or <code>width</code>.'],
        ['devtools', 'Attach GSDevTools to the scene\'s timeline.'],
        ['reducedMotion', '<code>\'respect\'</code> (default) shows the end state (or each slide\'s end) for people who prefer reduced motion; <code>\'ignore\'</code> plays anyway.'],
      ] },
      { title: 'Player methods and events', rows: [
        ['play(), pause(), toggle(), restart(), reverse()', 'Playback.'],
        ['seek(timeOrLabel), progress(p), timeScale(s)', 'Move the playhead; read or set progress and speed.'],
        ['next(), prev(), goTo(i)', 'Slideshow navigation.'],
        ['setView(id), load(scene), dispose()', 'Force a view (Flip animates it), replace the scene, remove the player.'],
        ['events', '<code>ready</code>, <code>play</code>, <code>pause</code>, <code>complete</code>, <code>slide</code>, <code>view</code>, <code>interaction</code>, <code>error</code>, plus any <code>emit</code> interaction.'],
      ] },
      { title: 'animator-studio', rows: [
        ['options', '<code>scene</code> or <code>template</code>, <code>storage: \'local\' | false</code>, <code>autosave</code>, <code>uploadUrl</code> or <code>uploadAsset(file) → url</code>, <code>mudtailUrl</code> / <code>animatorUrl</code> (HTML export), <code>warnOnLeave</code>.'],
        ['methods', '<code>getScene()</code>, <code>getSceneJson()</code>, <code>setScene()</code>, <code>loadTemplate(id)</code>, <code>save()</code>, <code>download()</code>, <code>play()</code>, <code>pause()</code>, <code>seek(t)</code>, <code>setView(id)</code>, <code>undo()</code>, <code>redo()</code>, <code>isDirty()</code>, <code>dispose()</code>.'],
        ['events', '<code>ready</code>, <code>change</code>, <code>save</code> (<code>{ id, name, json }</code>), <code>select</code>, <code>view</code>.'],
      ] },
      { title: 'Plugin API: getPlugin(\'animator\')', rows: [
        ['createPlayer(host, scene, options, onEvent)', 'The same player without createComponent.'],
        ['createStudio(host, options, onEvent)', 'The same studio without createComponent.'],
        ['parseScene, validateScene, serializeScene', 'Read (and migrate) a scene, list dangling references, write it.'],
        ['templates(), templateScene(id), presets(), clipTypes(), gsapPlugins()', 'What the Studio offers, for your own tooling.'],
      ] },
      { title: 'Scene file', rows: [
        ['type, version', '<code>mudtail-animator-scene</code>, <code>1</code>. Newer files are refused with a clear error; unknown fields are kept.'],
        ['views', 'Desktop / Tablet / Mobile (or your own): stage size and the width each starts at. The first is the base design; others follow it scaled unless a layer overrides values there.'],
        ['layers', 'Flat list, bottom to top; groups via <code>parentId</code>. <code>props</code>, per-view <code>views</code> overrides, <code>clips</code>, <code>interactions</code>, <code>draggable</code>.'],
        ['clips', '<code>type</code> (tween, set, morph, draw, motionPath, split, typewriter, scramble, counter, bounce, wiggle, physics2D, physicsProps, canvas, media, css), <code>start</code>, <code>duration</code>, <code>ease</code>, <code>repeat</code>, <code>yoyo</code>, <code>from</code> / <code>to</code>, <code>params</code>, <code>stagger</code>, <code>views</code>.'],
        ['assets, labels, settings', 'Uploaded media (data URLs or server URLs); labels (slides); duration, background, repeat, mode, trigger, scroll, fit, controls.'],
      ] },
    ],
  }),
};
