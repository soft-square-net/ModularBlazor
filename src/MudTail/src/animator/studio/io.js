// MudTail Animator Studio: saving, opening, importing, exporting and previewing scenes.
//   Save     → the browser's scene library (localStorage) and the studio's "save" event (Blazor / your API stores it)
//   Open     → a template or a saved scene
//   Import   → a .mudscene.json file (button, or drop it on the Studio)
//   Export   → the JSON file, and ready-to-paste embeds: MudTail markup, JavaScript, Blazor, a standalone HTML page
//   Preview  → the real player in a dialog, per view, with GSDevTools on demand

import { normalizeScene, serializeScene, sceneFileName, validateScene, sceneDuration } from '../scene.js';
import { TEMPLATES, sceneFromTemplate } from '../templates.js';
import { createPlayer } from '../player.js';
import { PLUGIN_FEATURES } from '../gsap-plugins.js';
import { h, esc, button, iconButton, modal, download, readAsText, formatTime } from './dom.js';

const LIBRARY_KEY = 'mudtail.animator.scenes';

/** Saved scenes: [{ id, name, updated, size }] newest first. */
export function listSaved() {
  try {
    const all = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '{}');
    return Object.values(all).map(({ id, name, updated, json }) => ({ id, name, updated, size: json?.length ?? 0 })).sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  } catch { return []; }
}

function readSaved(id) {
  try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '{}')[id]?.json ?? null; } catch { return null; }
}

/** Stores a scene in the browser library. Returns false when storage is full. */
export function saveToLibrary(scene) {
  try {
    const all = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '{}');
    all[scene.id] = { id: scene.id, name: scene.name, updated: scene.updated ?? new Date().toISOString(), json: JSON.stringify(scene) };
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(all));
    return true;
  } catch { return false; }
}

function deleteSaved(id) {
  try { const all = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '{}'); delete all[id]; localStorage.setItem(LIBRARY_KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

// ───── open ─────
export function openSceneDialog(S) {
  const { T, icon } = S;
  const body = h('div.mud-anim-open');
  let dlg;
  const open = (scene) => {
    if (S.opts.confirmDiscard !== false && S.canUndo && !confirm(T('io.discard', 'Open another scene? Unsaved changes stay in Undo history.'))) return;
    S.setScene(scene);
    dlg.close();
  };
  body.append(h('h3.mud-anim-h3', {}, T('io.templates', 'Start from')), h('div.mud-anim-templates', {}, TEMPLATES.map((t) =>
    h('button.mud-anim-template', { type: 'button', onclick: () => open(sceneFromTemplate(t.id)) }, [h('strong', {}, t.name), h('span', {}, t.description)]))));
  const saved = S.opts.storage === 'local' ? listSaved() : [];
  if (saved.length) {
    body.append(h('h3.mud-anim-h3', {}, T('io.saved', 'Saved in this browser')), h('div.mud-anim-saved', {}, saved.map((s) => h('div.mud-anim-saved__row', {}, [
      h('button.mud-anim-saved__open', { type: 'button', onclick: () => { const json = readSaved(s.id); if (json) open(normalizeScene(json)); } }, [h('strong', {}, s.name), h('span', {}, `${new Date(s.updated).toLocaleString()} · ${(s.size / 1024).toFixed(0)} KB`)]),
      iconButton(icon('anim-trash', 15), T('io.deleteSaved', 'Delete'), (e) => { if (confirm(T('io.deleteConfirm', 'Delete "{name}" from this browser?', { name: s.name }))) { deleteSaved(s.id); e.currentTarget.closest('.mud-anim-saved__row').remove(); } }),
    ]))));
  }
  dlg = modal(T('io.openTitle', 'New or open a scene'), body, { wide: true, actions: [button(T('io.importFile', 'Import a file…'), () => { dlg.close(); importSceneFile(S); }, { icon: icon('upload', 16) })] });
}

// ───── import ─────
export async function importSceneFile(S, file = null) {
  const { T } = S;
  if (!file) {
    file = await new Promise((resolve) => {
      const input = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
      input.addEventListener('change', () => { resolve(input.files[0] ?? null); input.remove(); });
      document.body.appendChild(input);
      input.click();
    });
  }
  if (!file) return;
  try {
    const text = await readAsText(file);
    const scene = normalizeScene(text);
    const warnings = validateScene(scene);
    S.setScene(scene);
    S.toast(warnings.length ? T('toast.importedWarn', 'Imported "{name}" ({n} warning(s): {first})', { name: scene.name, n: warnings.length, first: warnings[0] }) : T('toast.imported', 'Imported "{name}"', { name: scene.name }), warnings.length ? 'warning' : 'success');
  } catch (e) {
    S.toast(e.message, 'error');
  }
}

// ───── export ─────
export function openExportDialog(S) {
  const { T, icon } = S;
  const scene = S.scene;
  const json = serializeScene(scene);
  const compact = serializeScene(scene, { pretty: false });
  const file = sceneFileName(scene);
  const urls = { mudtail: S.opts.mudtailUrl ?? './mudtail.blazor.js', animator: S.opts.animatorUrl ?? './mudtail.animator.player.js', css: S.opts.cssUrl ?? './mudtail.css' };
  const snippets = [
    [T('io.embedMarkup', 'MudTail markup (data-mud behaviour)'), 'html',
      `<!-- the scene file next to the page, played by MudTail's autoInit -->\n<div data-mud="animator-scene" data-src="/scenes/${file}"></div>\n\n<!-- or inline -->\n<div data-mud="animator-scene">\n  <script type="application/json">${compact.slice(0, 120)}…</script>\n</div>`],
    [T('io.embedJs', 'JavaScript (bundler)'), 'js',
      `import { use, createComponent } from 'mudtail';\nimport animator from 'mudtail/animator';\nimport scene from './scenes/${file}';\n\nuse(animator);\nconst player = createComponent('animator-player', document.querySelector('#hero'), { scene, controls: true }, {\n  ready: (info) => console.log('ready', info),\n  slide: ({ index, label }) => console.log('slide', index, label),\n});\n// player.play(), .pause(), .seek('label'), .next(), .setView('mobile'), .dispose()`],
    [T('io.embedBlazor', 'Blazor (.razor)'), 'cs',
      `@inject IJSRuntime JS\n@inject HttpClient Http\n@implements IAsyncDisposable\n<div @ref="host" style="width:100%"></div>\n\n@code {\n    ElementReference host;\n    IJSObjectReference? mud, player;\n\n    protected override async Task OnAfterRenderAsync(bool first)\n    {\n        if (!first) return;\n        mud = await JS.InvokeAsync<IJSObjectReference>("import", "./_content/MudTail/mudtail.blazor.js");\n        await mud.InvokeVoidAsync("loadPlugin", "./_content/MudTail/mudtail.animator.js");\n        var scene = await Http.GetStringAsync("scenes/${file}");\n        player = await mud.InvokeAsync<IJSObjectReference>("create", "animator-player", host, new { scene, controls = true });\n    }\n\n    public async ValueTask DisposeAsync() { if (player is not null) await player.InvokeVoidAsync("dispose"); }\n}`],
  ];
  const standalone = standaloneHtml(scene, urls);
  const body = h('div.mud-anim-export', {}, [
    h('div.mud-anim-row.mud-anim-wrap-row', {}, [
      button(T('io.downloadJson', 'Download {file}', { file }), () => download(file, json), { icon: icon('download', 16), variant: 'primary' }),
      button(T('io.copyJson', 'Copy JSON'), async () => { await navigator.clipboard?.writeText(json); S.toast(T('toast.copied', 'Copied'), 'success'); }, { icon: icon('copy', 16) }),
      button(T('io.downloadHtml', 'Download HTML page'), () => download(sceneFileName(scene, '.html'), standalone, 'text/html'), { icon: icon('anim-html', 16) }),
      S.opts.storage === 'local' ? button(T('io.saveBrowser', 'Save in this browser'), () => S.save(), { icon: icon('anim-save', 16) }) : null,
    ]),
    h('p.mud-anim-note', {}, T('io.summary', '{layers} layers · {assets} assets · {time} · {kb} KB. Images and SVG you uploaded are inside the file (data URLs) unless an upload URL is configured.', { layers: scene.layers.length, assets: scene.assets.length, time: formatTime(sceneDuration(scene)), kb: (json.length / 1024).toFixed(1) })),
    ...snippets.map(([title, lang, code]) => h('div.mud-anim-snippet', {}, [
      h('div.mud-anim-snippet__head', {}, [h('strong', {}, title), button(T('io.copy', 'Copy'), async () => { await navigator.clipboard?.writeText(code); S.toast(T('toast.copied', 'Copied'), 'success'); }, { variant: 'text', icon: icon('copy', 14) })]),
      h(`pre.mud-anim-code.lang-${lang}`, {}, code),
    ])),
    h('p.mud-anim-note', {}, T('io.htmlNote', 'The HTML page loads MudTail from {mudtail} and the Animator from {animator}: copy both files from MudTail\'s dist/ next to it (or set mudtailUrl / animatorUrl on the Studio).', { mudtail: urls.mudtail, animator: urls.animator })),
  ]);
  modal(T('io.exportTitle', 'Export & embed "{name}"', { name: scene.name }), body, { wide: true });
}

/** A self-contained page that plays the scene with MudTail's Blazor bundle and the Animator plugin. */
export function standaloneHtml(scene, urls) {
  const json = serializeScene(scene, { pretty: false }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(scene.name)}</title>
<link rel="stylesheet" href="${esc(urls.css)}">
<style>html,body{margin:0;background:${esc(scene.settings.background || '#000')};min-height:100%}#scene{width:min(100%,${scene.views[0].width}px);margin:0 auto}</style>
</head>
<body>
<div id="scene"></div>
<script type="application/json" id="scene-data">${json}</script>
<script type="module">
  const mud = await import(${JSON.stringify(urls.mudtail)});
  await mud.loadPlugin(${JSON.stringify(urls.animator)});
  const scene = document.getElementById('scene-data').textContent;
  mud.create('animator-player', document.getElementById('scene'), { scene, controls: ${scene.settings.controls ? 'true' : 'false'} });
</script>
</body>
</html>
`;
}

// ───── preview ─────
export function openPreview(S) {
  const { T, icon, deps } = S;
  let player = null;
  let viewId = 'auto';
  let devtools = false;
  const log = h('div.mud-anim-preview__log', { role: 'log', 'aria-live': 'polite' });
  const frame = h('div.mud-anim-preview__frame');
  const host = h('div.mud-anim-preview__host');
  frame.append(host);
  const note = (text) => { log.prepend(h('div', {}, `${new Date().toLocaleTimeString()} · ${text}`)); while (log.childElementCount > 30) log.lastChild.remove(); };
  const start = () => {
    player?.dispose();
    const v = viewId === 'auto' ? null : S.scene.views.find((x) => x.id === viewId);
    host.style.width = v ? `${Math.min(v.width, frame.clientWidth || v.width)}px` : '100%';
    player = createPlayer(host, JSON.parse(JSON.stringify(S.scene)), { view: viewId, devtools, controls: true, trigger: S.scene.settings.trigger === 'scroll' || S.scene.settings.trigger === 'visible' ? 'load' : null }, (name, payload) => note(`${name} ${payload ? JSON.stringify(payload) : ''}`), deps);
  };
  const viewButtons = h('div.mud-anim-group', {}, [
    h('button.mud-anim-chipbtn', { type: 'button', 'aria-pressed': 'true', onclick: (e) => pick('auto', e) }, T('io.auto', 'Auto (by width)')),
    ...S.scene.views.map((v) => h('button.mud-anim-chipbtn', { type: 'button', onclick: (e) => pick(v.id, e) }, `${v.label} ${v.width}×${v.height}`)),
  ]);
  function pick(id, e) { viewId = id; viewButtons.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); start(); }
  const tools = h('div.mud-anim-row.mud-anim-wrap-row', {}, [
    viewButtons,
    button(T('io.restart', 'Restart'), () => start(), { icon: icon('anim-restart', 16) }),
    h('label.mud-anim-inline', {}, [(() => { const c = h('input.mud-anim-check', { type: 'checkbox' }); c.addEventListener('change', () => { devtools = c.checked; start(); }); return c; })(), h('span', {}, T('io.devtools', 'GSDevTools'))]),
  ]);
  const scrollNote = S.scene.settings.trigger === 'scroll' || S.scene.settings.trigger === 'visible' ? h('p.mud-anim-note', {}, T('io.scrollNote', 'This scene starts with the page scroll (ScrollTrigger); the preview plays it on load instead.')) : null;
  modal(T('io.previewTitle', 'Preview "{name}"', { name: S.scene.name }), [tools, scrollNote, frame, log], { wide: true, onClose: () => { player?.dispose(); document.querySelectorAll('.gs-dev-tools').forEach((n) => n.remove()); } });
  requestAnimationFrame(start);
}

// ───── about the plugins ─────
export function openPluginsDialog(S) {
  const { T } = S;
  const version = S.gsap?.version ?? '';
  modal(T('io.gsapTitle', 'GSAP {version} in the Studio', { version }), h('div', {}, [
    h('p.mud-anim-note', {}, T('io.gsapLead', 'Every scene is one GSAP timeline. These plugins are registered and used by clip types, presets, the editor and the player:')),
    h('table.mud-anim-table', {}, [h('tbody', {}, PLUGIN_FEATURES.map(([name, what]) => h('tr', {}, [h('th', {}, name), h('td', {}, what)])))]),
  ]), { wide: true });
}
