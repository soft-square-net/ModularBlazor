// Components ▸ Plugins: extending MudTail with your own components, behaviours, icons, texts, styles and tokens.
import {
  use, removePlugin, hasPlugin, listPlugins, getPlugin, createComponent, pluginTailwindCss, createMudButton, getIconSvg, t, formatDate,
} from 'mudtail';
import countdown from '../../plugins/countdown.plugin.js';
import { componentPage, esc } from './page.js';

/** A kick-off `hours` from now, rounded to the minute so the demo reads well. */
const kickoff = (hours) => new Date(Math.ceil((Date.now() + hours * 3600_000) / 60_000) * 60_000).toISOString();

const ensure = () => (hasPlugin('countdown') ? null : use(countdown));

/** Live example: install / remove the plugin, its component with an event log, and listPlugins(). */
function mountLive(el) {
  ensure();
  const stage = document.createElement('div');
  stage.className = 'cp-row';
  stage.style.alignItems = 'flex-start';
  const log = document.createElement('p');
  log.className = 'cp-tree-log';
  log.setAttribute('role', 'status');
  const list = document.createElement('pre');
  list.className = 'cp-request';
  const bar = document.createElement('div');
  bar.className = 'cp-row';

  let handles = [];
  const showList = () => {
    list.textContent = `listPlugins() → ${JSON.stringify(listPlugins(), null, 2)}`;
  };
  const build = () => {
    stage.replaceChildren();
    handles = [];
    if (!hasPlugin('countdown')) {
      const empty = document.createElement('p');
      empty.className = 'cp-tree-log';
      empty.textContent = t('demo.plugins.removed', {}, 'The plugin is removed: its component, behaviour, icon, styles and tokens are gone. Install it again.');
      stage.appendChild(empty);
      return;
    }
    const matches = [
      { to: kickoff(26.5), label: t('demo.plugins.match1', {}, 'Northbridge v Harbour City') },
      { to: new Date(Date.now() + 12_000).toISOString(), label: t('demo.plugins.match2', {}, 'Cup final: penalties'), units: ['minutes', 'seconds'] },
    ];
    for (const m of matches) {
      const host = document.createElement('div');
      stage.appendChild(host);
      handles.push(createComponent('countdown', host, m, {
        done: () => { log.textContent = t('demo.plugins.done', { label: m.label }, '"done" from {label}: the match is live.'); },
      }));
    }
    log.textContent = t('demo.plugins.hint', {}, 'The second countdown ends after a few seconds and raises "done".');
  };

  const toggle = createMudButton({
    variant: 'outlined', size: 'small', icon: getIconSvg('plugin', 16),
    text: hasPlugin('countdown') ? t('demo.plugins.remove', {}, 'Remove the plugin') : t('demo.plugins.install', {}, 'Install the plugin'),
    onClick: () => {
      if (hasPlugin('countdown')) removePlugin('countdown'); // disposes the live countdowns too
      else use(countdown);
      toggle.querySelector('span:not(.btn-icon)').textContent = hasPlugin('countdown')
        ? t('demo.plugins.remove', {}, 'Remove the plugin') : t('demo.plugins.install', {}, 'Install the plugin');
      build();
      showList();
    },
  });
  const pause = createMudButton({
    variant: 'text', size: 'small',
    text: t('demo.plugins.pause', {}, 'Pause / resume all (plugin API)'),
    onClick: () => {
      const apiObj = getPlugin('countdown');
      if (!apiObj) return;
      pause.dataset.paused = pause.dataset.paused ? '' : '1';
      if (pause.dataset.paused) apiObj.pauseAll(); else apiObj.resumeAll();
    },
  });
  bar.append(toggle, pause);
  el.append(bar, stage, log, list);
  build();
  showList();
  return () => handles.forEach((h) => h.dispose());
}

/** Behaviour on markup someone else rendered (server, Blazor), plus Tailwind utilities made from the plugin's tokens. */
function mountMarkup(el) {
  ensure();
  const to = kickoff(3.25);
  el.innerHTML = `
    <div class="flex flex-wrap items-center gap-4">
      <div data-mud="countdown" data-to="${esc(to)}" class="flex items-baseline gap-countdown-gap rounded-mud bg-countdown-digit-bg px-4 py-2 font-semibold text-countdown-digit-fg tabular-nums">
        <span class="text-xs uppercase tracking-wider text-countdown-accent">${esc(t('demo.plugins.evening', {}, 'Evening kick-off'))}</span>
        <span data-unit="hours"></span>:<span data-unit="minutes"></span>:<span data-unit="seconds"></span>
      </div>
      <span class="text-sm text-ink-muted">${esc(formatDate(to, { dateStyle: 'medium', timeStyle: 'short' }))}</span>
    </div>`;
}

const CODE_PLUGIN = `
  // countdown.plugin.js: imports nothing, so a bundler and a runtime loadPlugin(url) can both use it
  export default {
    name: 'countdown',
    version: '1.0.0',
    requires: { mudtail: '^0.1.0' },                 // and/or plugins: { 'other-plugin': '^2.0.0' }

    tokens: {                                         // --mud-countdown-* (light / dark); colours → Tailwind too
      'countdown-digit-bg': { light: '#1f2937', dark: '#e5e7eb' },
      'countdown-accent': 'var(--mud-palette-primary)',
      'countdown-gap': { value: '.375rem', tailwind: 'spacing' },
    },
    styles: '.mud-countdown__cell { background: var(--mud-countdown-digit-bg); … }', // in @layer components
    icons: { stopwatch: '<circle cx="12" cy="14" r="8"/><path d="M12 10v4l2 2"/>' },
    messages: { ar: { 'countdown.days': 'أيام', 'countdown.kickoff': 'ضربة البداية' } },

    setup(ctx, options) {
      const { mudtail, gsap } = ctx;                  // the whole MudTail API, and GSAP

      ctx.component('countdown', (host, opts, emit) => {       // createComponent() / Blazor create()
        const root = document.createElement('div');
        host.appendChild(root);
        // … render, gsap.fromTo(…) on each new digit, emit('tick', parts), emit('done')
        return { setTarget(to) { … }, remaining() { … }, dispose() { root.remove(); } };
      });

      ctx.behavior('countdown', (el) => { … });                // data-mud="countdown"
      ctx.on('locale', () => { … });                           // removed with the plugin

      return { remaining(to) { … }, pauseAll() { … }, resumeAll() { … } };   // the plugin's API
    },
  };`;

const CODE_USE = `
  import { use, createComponent, getPlugin, removePlugin } from 'mudtail';
  import countdown from './plugins/countdown.plugin.js';

  use(countdown, { animate: true });                  // options reach setup(ctx, options)

  const match = createComponent('countdown', host, { to: '2026-11-12T19:45:00Z', label: 'Northbridge v Harbour City' }, {
    tick: (parts) => …,
    done: () => showToast('Kick-off!'),
  });

  getPlugin('countdown').pauseAll();                  // what setup() returned
  removePlugin('countdown');                          // undoes everything, disposes live countdowns`;

const CODE_MARKUP = `
  <!-- Rendered by the server or Blazor; the behaviour only sets data-value on the [data-unit] spans -->
  <div data-mud="countdown" data-to="2026-11-12T19:45:00Z"
       class="flex items-baseline gap-countdown-gap rounded-mud bg-countdown-digit-bg px-4 py-2 text-countdown-digit-fg">
    <span class="text-xs uppercase text-countdown-accent">Evening kick-off</span>
    <span data-unit="hours"></span>:<span data-unit="minutes"></span>:<span data-unit="seconds"></span>
  </div>`;

const CODE_TAILWIND = `
  # 1. Generate the Tailwind theme for the plugin's tokens (several plugins may be listed)
  npx mudtail-plugin-css ./plugins/countdown.plugin.js --source ./plugins --out ./styles/plugins.css

  /* 2. app.css: after Tailwind and the MudTail preset */
  @import "tailwindcss";
  @import "mudtail/tailwind.css";
  @import "./plugins.css";

  /* plugins.css (generated) */
  ${pluginTailwindCss(countdown, { source: './plugins' }).trim().split('\n').join('\n  ')}`;

const CODE_BLAZOR = `
  // Program / layout: load the plugin once, from the Razor class library that ships it
  var mud = await JS.InvokeAsync<IJSObjectReference>("moduleHost.get", "Layouts.Default");
  var info = await mud.InvokeAsync<JsonElement>("loadPlugin",
      "./_content/MyCompany.Plugins/countdown.plugin.js", new { animate = true });

  // A component, exactly like the built-in ones: <div @ref="host"></div>
  _countdown = await mud.InvokeAsync<IJSObjectReference>("create", "countdown", host,
      new { to = Match.KickOff, label = Match.Title }, DotNetObjectReference.Create(this));

  [JSInvokable] public Task OnMudEvent(string name, JsonElement payload)
      => name == "done" ? InvokeAsync(() => { IsLive = true; StateHasChanged(); }) : Task.CompletedTask;

  await _countdown.InvokeVoidAsync("setTarget", newKickOff);
  await _countdown.InvokeVoidAsync("dispose");                 // in DisposeAsync

  // The plugin's own API
  var api = await mud.InvokeAsync<IJSObjectReference>("plugin", "countdown");
  await api.InvokeVoidAsync("pauseAll");
  var left = await mud.InvokeAsync<string>("invokePlugin", "countdown", "format", Match.KickOff);`;

export const PLUGINS_PAGE = {
  id: 'plugins', label: 'Plugins', icon: 'plugin',
  render: () => componentPage({
    title: 'Plugins', kinds: ['JS', 'Tailwind', 'Blazor'],
    lead: 'Extend MudTail with your own components, <code>data-mud</code> behaviours, icons, texts, styles and design tokens, in plain JavaScript with GSAP and Tailwind. A plugin is one object; <code>use(plugin)</code> installs it and <code>removePlugin(name)</code> undoes all of it. Its components work in vanilla JS (<code>createComponent</code>) and in Blazor (<code>create</code>, with <code>OnMudEvent</code>), like the built-in ones.',
    examples: [
      {
        title: 'Writing a plugin',
        description: 'Static parts (tokens, styles, icons, texts) are declared; components, behaviours and the plugin\'s API come from <code>setup(ctx, options)</code>. The context records everything it registers. A plugin loaded from a URL cannot <code>import \'mudtail\'</code>, so <code>ctx.mudtail</code> (the whole API) and <code>ctx.gsap</code> are handed to it.',
        code: CODE_PLUGIN,
      },
      {
        title: 'Installing it and using its component',
        description: 'The countdown plugin on this page, live. Remove it and its components, behaviour, icon, styles and tokens are gone; install it again and they come back. The second countdown raises <code>done</code> after a few seconds.',
        code: CODE_USE,
        mount: mountLive,
      },
      {
        title: 'Its behaviour on markup rendered elsewhere, styled with Tailwind',
        description: 'The plugin\'s <code>data-mud="countdown"</code> behaviour starts on markup the server or Blazor rendered, also on elements that were there before the plugin loaded. The colours are Tailwind utilities made from the plugin\'s tokens (<code>bg-countdown-digit-bg</code>, <code>text-countdown-accent</code>, <code>gap-countdown-gap</code>), so they follow dark mode.',
        code: CODE_MARKUP,
        language: 'HTML / Razor',
        mount: mountMarkup,
      },
      {
        title: 'Tailwind: utilities from a plugin\'s tokens',
        description: 'Tailwind runs when the app is built, so the app adds the plugin\'s theme to its stylesheet once. Colour tokens become colours; give a token <code>tailwind: \'spacing\'</code>, <code>\'radius\'</code>, <code>\'shadow\'</code>… for other namespaces, or <code>false</code> for none. <code>@source</code> lets Tailwind see the classes the plugin\'s own files use.',
        code: CODE_TAILWIND,
        language: 'Shell / CSS',
      },
      {
        title: 'Blazor: load a plugin and use it from C#',
        description: 'Ship the plugin file in a Razor class library\'s <code>wwwroot</code> and load it at runtime: the URL is resolved against the page. Its components go through the same <code>create</code> and <code>OnMudEvent</code> as the built-in ones, and the module\'s <code>dispose()</code> and <code>activeCount()</code> include them.',
        code: CODE_BLAZOR,
        language: 'C#',
      },
    ],
    api: [
      { title: 'Plugin definition', rows: [
        ['name, version, description', 'Lower-case name (optionally <code>@scope/name</code>), <code>x.y.z</code> version.'],
        ['requires', '<code>{ mudtail: \'^0.1.0\', plugins: { other: \'>=1.0.0\' } | [\'other\'] }</code>. Ranges: <code>^ ~ >= > <= < =</code>, several with spaces (all) or <code>||</code> (any).'],
        ['tokens', '<code>{ key: value | { light, dark, tailwind? } }</code> → <code>--mud-&lt;key&gt;</code> on <code>:root</code> and the dark theme.'],
        ['styles', 'CSS, injected inside <code>@layer components</code> so Tailwind utilities still win (<code>setPluginStyleLayer</code> changes it).'],
        ['icons, messages', 'Icons for <code>getIconSvg</code> (a Lucide icon node or inner SVG markup); texts per locale for <code>t()</code>.'],
        ['behaviors, components', '<code>{ name: factory }</code>, the same as <code>ctx.behavior</code> / <code>ctx.component</code>.'],
        ['setup(ctx, options)', 'Returns the plugin\'s API (an object, its <code>dispose</code> runs on removal), a cleanup function, or a promise of either.'],
      ] },
      { title: 'Context (ctx)', rows: [
        ['component(name, factory)', '<code>factory(host, options, emit, ctx)</code> → a handle with <code>dispose()</code>. Built-in names are reserved.'],
        ['behavior(name, factory)', '<code>factory(element, ctx)</code> → <code>{ dispose }</code> or <code>null</code>. Replacing a built-in one puts it back on removal.'],
        ['icons, messages, styles, tokens', 'The same as the definition keys, at runtime. <code>styles</code> and <code>tokens</code> return a remover.'],
        ['on(event, fn), emit(event, detail)', '<code>\'theme\'</code>, <code>\'locale\'</code>, <code>\'direction\'</code> or any window event; <code>emit</code> raises <code>mud-plugin:&lt;name&gt;:&lt;event&gt;</code>.'],
        ['mudtail, gsap, t, signal', 'The whole API, GSAP, the translator, and an <code>AbortSignal</code> aborted on removal.'],
        ['plugin(name), emitter(target), track(x), handle(obj)', 'Another plugin\'s API; <code>emit(name, payload)</code> for a <code>DotNetObjectReference</code> or callbacks; cleanup on removal; a disposable handle that Blazor\'s <code>dispose()</code> / <code>activeCount()</code> also see.'],
      ] },
      { title: 'Functions', rows: [
        ['definePlugin(def)', 'Checks a definition when it is written; returns it frozen.'],
        ['use(plugin, options, { replace })', 'Installs; returns <code>{ name, version, api, ready, dispose }</code>. The same plugin twice is harmless.'],
        ['usePlugins(list), loadPlugin(url | module, options)', 'Several in order; from a URL (resolved against the page) or a module, resolving after async setup.'],
        ['removePlugin(name, { force })', 'Undoes everything, disposes live components. Plugins that require it go first (or with <code>force</code>).'],
        ['getPlugin, hasPlugin, listPlugins', 'The API, a check, and <code>[{ name, version, description, components, behaviors }]</code>.'],
        ['createComponent(name, host, options, onEvent)', '<code>onEvent</code>: <code>(name, payload) =&gt; …</code> or <code>{ eventName: handler }</code>.'],
        ['registerComponent(name, factory)', 'A component without a plugin; returns the remover.'],
        ['pluginTailwindCss(plugin, { source })', 'The <code>@theme inline</code> block for its tokens (the <code>mudtail-plugin-css</code> command writes it).'],
        ['Events', '<code>mud-plugin-installed</code>, <code>mud-plugin-removed</code> on <code>window</code>, detail <code>{ name, version }</code>.'],
      ] },
      { title: 'Blazor (mudtail.blazor.js)', rows: [
        ['loadPlugin(url, options), loadPlugins([{ url, options }])', 'Load and install; resolve to the plugin descriptions.'],
        ['create(name, host, options, dotNetRef)', 'Plugin components too; <code>componentNames()</code> lists them after the built-in ones.'],
        ['plugin(name), invokePlugin(name, method, …args)', 'The API as an <code>IJSObjectReference</code>, or one call returning its value.'],
        ['plugins(), removePlugin(name, force), observePlugins(dotNetRef)', 'List, remove, and <code>OnMudEvent("plugin", { action, name, version })</code>.'],
      ] },
    ],
  }),
};
