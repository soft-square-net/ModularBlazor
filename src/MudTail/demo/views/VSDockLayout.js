// VS 2026-style IDE workspace for the demo, built on MudDock (the library's docking layout).
// Same arrangement and shell as the VsDock project: menu bar, toolbar, docked tool windows around the
// documents, auto-hidden Toolbox (start edge) and Notifications / Chat (end edge), status bar.
import { MudDock, DropZone, getIconSvg, showToast, t, getLocale } from 'mudtail';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name) => getIconSvg(name, 14);

const FILES = {
  'src/dock/MudDock.js': `// MudDock: IDE-style docking layout\nimport { DockModel, DropZone } from './model.js';\n\nexport class MudDock {\n  constructor({ definitions, defaultLayout, storageKey }) {\n    this.model = new DockModel({ definitions, defaultLayout });\n    // keyed rendering: panels are created once and only moved\n  }\n}\n`,
  'src/dock/model.js': `// A recursive tree of splits and groups\nexport const DropZone = { Center, Tabs, Left, Right, Top, Bottom };\n\nexport class DockModel {\n  moveTo(sourceType, sourceId, targetId, zone, index) { /* … */ }\n  autoHide(groupId) { /* … */ }\n  pin(groupId) { /* … */ }\n}\n`,
  'src/styles/_dock.scss': `.mud-dock {\n  --dock-surface: var(--mud-palette-surface);\n  --dock-accent: var(--mud-palette-primary);\n}\n`,
  'demo/main.js': `import { initTheme } from 'mudtail';\n\ninitTheme();\n`,
  'package.json': `{\n  "name": "mudtail",\n  "type": "module"\n}\n`,
  'README.md': `# MudTail\n\nTailwind CSS v4 + vanilla JS + GSAP.\n`,
};

const TREE = [
  { name: 'src', children: [
    { name: 'dock', children: [{ name: 'MudDock.js' }, { name: 'model.js' }] },
    { name: 'styles', children: [{ name: '_dock.scss' }] },
  ] },
  { name: 'demo', children: [{ name: 'main.js' }] },
  { name: 'package.json' },
  { name: 'README.md' },
];

/** A tiny event hub so panels can talk (Explorer selection → Properties). */
function createHub() {
  const subs = new Map();
  return {
    on(name, fn) { if (!subs.has(name)) subs.set(name, new Set()); subs.get(name).add(fn); return () => subs.get(name).delete(fn); },
    emit(name, data) { subs.get(name)?.forEach((fn) => fn(data)); },
  };
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ───────────────────────── panels ─────────────────────────

function definitions(hub) {
  return [
    {
      key: 'explorer', title: t('Solution Explorer'), icon: icon('folder'),
      render(panel, ctx) {
        const expanded = new Set((panel.state.expanded ?? 'src,src/dock').split(',').filter(Boolean));
        const root = el('<div class="ide-tree" role="tree"></div>');
        const draw = () => {
          const rows = [];
          const walk = (nodes, depth, prefix) => nodes.forEach((n) => {
            const path = prefix ? `${prefix}/${n.name}` : n.name;
            const dir = !!n.children;
            const open = expanded.has(path);
            rows.push(`<div class="ide-tree__row" role="treeitem" tabindex="0" data-path="${esc(path)}" data-dir="${dir}" ${dir ? `aria-expanded="${open}"` : ''} style="padding-inline-start:${8 + depth * 14}px">
              <span class="ide-tree__caret">${dir ? (open ? '▾' : '▸') : ''}</span>
              <span class="ide-tree__icon ${dir ? 'is-dir' : 'is-file'}">${icon(dir ? 'folder' : 'docs')}</span>${esc(n.name)}</div>`);
            if (dir && open) walk(n.children, depth + 1, path);
          });
          walk(TREE, 0, '');
          root.innerHTML = rows.join('');
        };
        const pick = (row) => {
          root.querySelectorAll('.is-selected').forEach((r) => r.classList.remove('is-selected'));
          row.classList.add('is-selected');
          const path = row.dataset.path;
          if (row.dataset.dir === 'true') {
            if (!expanded.delete(path)) expanded.add(path);
            ctx.setState('expanded', [...expanded].join(','));
            draw();
          } else {
            hub.emit('select', path);
          }
        };
        root.addEventListener('click', (e) => { const row = e.target.closest('.ide-tree__row'); if (row) pick(row); });
        root.addEventListener('dblclick', (e) => {
          const row = e.target.closest('.ide-tree__row[data-dir="false"]');
          if (row) ctx.model.openDocument('editor', row.dataset.path.split('/').pop(), { file: row.dataset.path });
        });
        root.addEventListener('keydown', (e) => {
          const row = e.target.closest('.ide-tree__row');
          if (!row || e.key !== 'Enter') return;
          if (row.dataset.dir === 'true') pick(row);
          else ctx.model.openDocument('editor', row.dataset.path.split('/').pop(), { file: row.dataset.path });
        });
        draw();
        const wrap = el('<div class="ide-pad"><input class="ide-input" placeholder="Search Solution Explorer" aria-label="Search Solution Explorer"><p class="ide-hint">Double-click a file to open it.</p></div>');
        wrap.appendChild(root);
        return wrap;
      },
    },
    {
      key: 'properties', title: t('Properties'), icon: icon('sliders'),
      render() {
        const root = el('<div class="ide-pad"></div>');
        const show = (path) => {
          const text = FILES[path] ?? '';
          root.innerHTML = `<div class="ide-prop-head">${esc(path ? path.split('/').pop() : 'Nothing selected')}</div>
            <table class="ide-props"><tbody>
              <tr><td>Full path</td><td>${esc(path || '—')}</td></tr>
              <tr><td>Type</td><td>${esc(path ? path.split('.').pop().toUpperCase() : '—')}</td></tr>
              <tr><td>Lines</td><td>${path ? text.split('\n').length : '—'}</td></tr>
              <tr><td>Build action</td><td>${path?.endsWith('.js') ? 'Module' : 'Content'}</td></tr>
              <tr><td>Copy to output</td><td>Do not copy</td></tr>
            </tbody></table>
            <p class="ide-hint">Select a file in Solution Explorer.</p>`;
        };
        show('src/dock/MudDock.js');
        const off = hub.on('select', show);
        return { element: root, dispose: off };
      },
    },
    {
      key: 'toolbox', title: t('Toolbox'), icon: icon('dashboard'),
      render() {
        const groups = { 'Common controls': ['Button', 'Check box', 'Text field', 'Select', 'Switch'], Containers: ['Card', 'Tabs', 'Drawer', 'Dialog', 'Dock'], Editorial: ['Article card', 'Ticker', 'Match card', 'League table', 'Gallery'] };
        const root = el(`<div class="ide-pad"><input class="ide-input" placeholder="Search Toolbox" aria-label="Search Toolbox"><div class="ide-toolbox"></div></div>`);
        const list = root.querySelector('.ide-toolbox');
        const draw = (q = '') => {
          list.innerHTML = Object.entries(groups).map(([g, items]) => {
            const hits = items.filter((i) => i.toLowerCase().includes(q.toLowerCase()));
            return hits.length ? `<div class="ide-toolbox__group">${esc(g)}</div>${hits.map((i) => `<div class="ide-toolbox__item">${icon('code')} ${esc(i)}</div>`).join('')}` : '';
          }).join('') || '<p class="ide-hint">No matches.</p>';
        };
        root.querySelector('input').addEventListener('input', (e) => draw(e.target.value));
        draw();
        return root;
      },
    },
    {
      key: 'output', title: t('Output'), icon: icon('terminal'),
      render() {
        const root = el(`<div class="ide-pad"><div class="ide-out-head">Show output from: <span class="ide-chip">Build</span><button type="button" class="ide-link">Clear</button></div><pre class="ide-log"></pre></div>`);
        const log = root.querySelector('.ide-log');
        const lines = ['Build started…', '1>------ Build started: Project: MudTail ------', '1>vite v8.3.7 building for production…', '1>✓ 2045 modules transformed.', '1>dist/mudtail.js  54.75 kB', '========== Build: 1 succeeded, 0 failed =========='];
        log.textContent = lines.join('\n');
        root.querySelector('button').addEventListener('click', () => { log.textContent = ''; });
        return root;
      },
    },
    {
      key: 'errors', title: t('Error List'), icon: icon('error'),
      render: () => `<div class="ide-pad">
        <div class="ide-pills"><span class="ide-pill is-err">✕ 1 Error</span><span class="ide-pill is-warn">⚠ 2 Warnings</span><span class="ide-pill is-info">ⓘ 1 Message</span></div>
        <table class="ide-grid"><thead><tr><th></th><th>Code</th><th>Description</th><th>File</th><th>Line</th></tr></thead><tbody>
          <tr><td class="is-err">✕</td><td>TS2304</td><td>Cannot find name 'DockZone'.</td><td>MudDock.js</td><td>42</td></tr>
          <tr><td class="is-warn">⚠</td><td>CSS001</td><td>Unknown property 'inset-inline'.</td><td>_dock.scss</td><td>18</td></tr>
          <tr><td class="is-warn">⚠</td><td>A11Y12</td><td>Button has no accessible name.</td><td>main.js</td><td>7</td></tr>
          <tr><td class="is-info">ⓘ</td><td>IDE0005</td><td>Unnecessary import.</td><td>model.js</td><td>2</td></tr>
        </tbody></table></div>`,
    },
    {
      key: 'tests', title: t('Test Explorer'), icon: icon('test'),
      render: () => `<div class="ide-pad">
        <div class="ide-pills"><span class="ide-pill is-ok">✓ 26 Passed</span><span class="ide-pill is-err">✕ 0 Failed</span></div>
        ${['dropping a tab in the centre merges it', 'dropping on an edge splits the target', 'tabs re-order inside their strip', 'closing the last tab collapses the split', 'auto-hide and pin round-trip', 'serialize / load round-trips']
          .map((t) => `<div class="ide-test"><span class="is-ok">✓</span> ${esc(t)}</div>`).join('')}</div>`,
    },
    {
      key: 'git', title: t('Git Changes'), icon: icon('git'),
      render: (panel, ctx) => {
        const root = el(`<div class="ide-pad"><textarea class="ide-input" rows="3" placeholder="Enter a message" aria-label="Commit message"></textarea>
          <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-small">Commit all</button>
          <div class="ide-toolbox__group">Changes (3)</div>
          <div class="ide-test"><span class="is-warn">M</span> src/dock/MudDock.js</div>
          <div class="ide-test"><span class="is-ok">A</span> src/dock/model.js</div>
          <div class="ide-test"><span class="is-ok">A</span> src/styles/_dock.scss</div></div>`);
        const msg = root.querySelector('textarea');
        msg.value = panel.state.message ?? '';
        msg.addEventListener('input', () => ctx.setState('message', msg.value));
        root.querySelector('button').addEventListener('click', () => showToast(msg.value ? `Committed: ${msg.value}` : 'Enter a commit message first', msg.value ? 'success' : 'error'));
        return root;
      },
    },
    {
      key: 'notifications', title: t('Notifications'), icon: icon('bell'),
      render: () => `<div class="ide-pad">
        <div class="ide-note"><b>Layout saved</b><span>Your window layout is kept between visits.</span></div>
        <div class="ide-note"><b>Tip</b><span>Drag a tab onto the edge of any block to split it, or onto the outer edge to dock around everything.</span></div>
        <div class="ide-note"><b>Tip</b><span>Double-click a tab strip to maximize the block; Esc restores it.</span></div></div>`,
    },
    {
      key: 'chat', title: t('Chat'), icon: icon('sparkles'),
      render(panel, ctx) {
        const root = el(`<div class="ide-chat"><div class="ide-chat__log"></div><form class="ide-chat__input"><input class="ide-input" placeholder="Ask about the layout…" aria-label="Message"><button type="submit" class="mud-button-root mud-button-filled mud-button-primary mud-button-small">Send</button></form></div>`);
        const logEl = root.querySelector('.ide-chat__log');
        const messages = JSON.parse(panel.state.messages ?? '[["Copilot","Hi! Try dragging this Chat tab into the middle of the workspace."]]');
        const draw = () => { logEl.innerHTML = messages.map(([who, text]) => `<div class="ide-chat__msg${who === 'You' ? ' is-me' : ''}"><b>${esc(who)}</b>${esc(text)}</div>`).join(''); logEl.scrollTop = logEl.scrollHeight; };
        root.querySelector('form').addEventListener('submit', (e) => {
          e.preventDefault();
          const input = e.target.querySelector('input');
          if (!input.value.trim()) return;
          messages.push(['You', input.value.trim()], ['Copilot', 'Noted. Your message stays here even if you move this panel.']);
          input.value = '';
          ctx.setState('messages', JSON.stringify(messages));
          draw();
        });
        draw();
        return root;
      },
    },
    {
      key: 'json', title: t('Layout JSON'), icon: icon('database'), allowMultiple: true,
      render(panel, ctx) {
        const pre = el('<pre class="ide-log ide-pad"></pre>');
        const draw = () => { pre.textContent = JSON.stringify(JSON.parse(ctx.model.serialize()), null, 2); };
        const off = ctx.model.on('change', draw);
        draw();
        return { element: pre, dispose: off };
      },
    },
    {
      key: 'editor', title: t('Untitled'), icon: icon('code'), allowMultiple: true, document: true,
      render(panel, ctx) {
        const root = el('<div class="ide-editor"><div class="ide-editor__gutter" aria-hidden="true"></div><textarea class="ide-editor__text" spellcheck="false"></textarea></div>');
        const gutter = root.querySelector('.ide-editor__gutter');
        const text = root.querySelector('textarea');
        text.setAttribute('aria-label', panel.title);
        text.value = panel.state.text ?? FILES[panel.state.file] ?? `// ${panel.title}\n`;
        const numbers = () => { gutter.textContent = Array.from({ length: text.value.split('\n').length }, (_, i) => i + 1).join('\n'); };
        text.addEventListener('input', () => { numbers(); ctx.setState('text', text.value); });
        text.addEventListener('scroll', () => { gutter.scrollTop = text.scrollTop; });
        text.addEventListener('keydown', (e) => {
          if (e.key !== 'Tab') return;
          e.preventDefault();
          text.setRangeText('  ', text.selectionStart, text.selectionEnd, 'end');
          text.dispatchEvent(new Event('input'));
        });
        numbers();
        return root;
      },
    },
    {
      key: 'note', title: t('Block'), icon: icon('docs'), allowMultiple: true,
      render: () => `<div class="ide-note-panel"><div class="ide-note-panel__title">A new block</div>
        <ul><li>Drag any tab here, or onto an edge of this block to split it.</li>
        <li>Drag the empty part of the tab bar to move the whole block.</li>
        <li>Use ⋯ to add panels, move the tabs to the bottom, maximize or auto-hide.</li></ul></div>`,
    },
  ];
}

/** The VsDock arrangement: tool windows left and right, documents in the middle with output below. */
function defaultLayout(m) {
  const file = (path) => m.createPanel('editor', path.split('/').pop(), { file: path });

  const explorer = m.newGroup([m.createPanel('explorer')], { weight: 1.3, tabsAtBottom: true });
  const git = m.newGroup([m.createPanel('git')], { weight: 1, tabsAtBottom: true });
  const left = m.newSplit('column', [explorer, git], 1.1);

  const docs = m.newGroup([file('src/dock/MudDock.js'), file('src/dock/model.js'), file('src/styles/_dock.scss')], { weight: 3 });
  const bottom = m.newGroup([m.createPanel('output'), m.createPanel('errors'), m.createPanel('json')], { weight: 1.2, tabsAtBottom: true });
  const center = m.newSplit('column', [docs, bottom], 4);

  const props = m.newGroup([m.createPanel('properties')], { weight: 2, tabsAtBottom: true });
  const tests = m.newGroup([m.createPanel('tests')], { weight: 1.2, tabsAtBottom: true });
  const right = m.newSplit('column', [props, tests], 1.4);

  return {
    root: m.newSplit('row', [left, center, right]),
    left: [m.newGroup([m.createPanel('toolbox')], { tabsAtBottom: true })],
    right: [m.newGroup([m.createPanel('notifications'), m.createPanel('chat')], { tabsAtBottom: true })],
  };
}

// ───────────────────────── shell ─────────────────────────

export class VSDockLayout {
  constructor() {
    this.hub = createHub();
    // One saved layout per language: panel titles are stored in it.
    this.dock = new MudDock({ definitions: definitions(this.hub), defaultLayout, storageKey: `mudtail.demo.ide.v1.${getLocale()}` });
    this.container = this._shell();
    this._offStatus = this.dock.model.on('change', () => this._status());
    this._status();
  }

  getElement() { return this.container; }

  dispose() {
    this._offStatus();
    this._closeMenu();
    this.dock.dispose();
  }

  _shell() {
    const root = el(`
      <div class="ide-shell">
        <header class="ide-titlebar">
          <span class="ide-logo" aria-hidden="true">◈</span>
          <nav class="ide-menubar" aria-label="Menu">
            ${['File', 'Edit', 'View', 'Window', 'Help'].map((m) => `<button type="button" class="ide-menu-btn" data-menu="${m.toLowerCase()}" aria-haspopup="menu">${m}</button>`).join('')}
          </nav>
          <div class="ide-search">${icon('search')} Search (Ctrl+Q)</div>
          <span class="ide-title">MudTail · VS 2026 Dock</span>
        </header>
        <div class="ide-toolbar">
          <button type="button" class="ide-tool" aria-label="Back">◀</button>
          <button type="button" class="ide-tool" aria-label="Forward">▶</button>
          <span class="ide-sep"></span>
          <span class="ide-select">Debug ▾</span>
          <span class="ide-select">Any CPU ▾</span>
          <button type="button" class="ide-tool is-run" data-cmd="run">▶ Start</button>
          <span class="ide-sep"></span>
          <button type="button" class="ide-tool" data-cmd="block" title="Add a block to the right of the first block">＋ Block</button>
          <button type="button" class="ide-tool" data-cmd="reset">Reset layout</button>
        </div>
        <main class="ide-main"></main>
        <footer class="ide-status"><span>● Ready</span><span class="ide-grow"></span><span class="ide-status__count"></span></footer>
      </div>`);
    root.querySelector('.ide-main').appendChild(this.dock.getElement());

    root.addEventListener('click', (e) => {
      const menuBtn = e.target.closest('[data-menu]');
      if (menuBtn) { this._openMenu(menuBtn); return; }
      const cmd = e.target.closest('[data-cmd]')?.dataset.cmd;
      const m = this.dock.model;
      if (cmd === 'reset') m.resetLayout();
      else if (cmd === 'block') m.addBlock(m.groups[0]?.id ?? '', DropZone.Right);
      else if (cmd === 'run') showToast('Build succeeded', 'success');
    });
    return root;
  }

  _status() {
    const m = this.dock.model;
    const count = this.container?.querySelector('.ide-status__count');
    if (count) count.textContent = `${m.groups.length} blocks · ${m.groups.reduce((n, g) => n + g.panels.length, 0)} tabs`;
  }

  _openMenu(button) {
    const name = button.dataset.menu;
    const wasOpen = this._menu?.name === name;
    this._closeMenu();
    if (wasOpen) return;
    const m = this.dock.model;
    let items;
    if (name === 'view') {
      items = `<div class="mud-dock-menu__fold" aria-hidden="true">Open window</div>${m.definitions.map((d) => `<button type="button" role="menuitem" class="mud-dock-menu__item" data-open="${esc(d.key)}"><span class="mud-dock-menu__icon">${d.icon}</span>${esc(d.title)}${d.allowMultiple ? ' (new)' : ''}</button>`).join('')}`;
    } else if (name === 'window') {
      items = `<button type="button" role="menuitem" class="mud-dock-menu__item" data-win="reset"><span class="mud-dock-menu__icon">↺</span>Reset window layout</button>
        <button type="button" role="menuitem" class="mud-dock-menu__item" data-win="forget"><span class="mud-dock-menu__icon">✕</span>Forget saved layout</button>`;
    } else {
      items = '<div class="mud-dock-menu__fold" aria-hidden="true">Not part of this demo</div>';
    }
    const backdrop = el('<div class="mud-dock-menu-backdrop"></div>');
    const menu = el(`<div class="mud-dock-menu" role="menu">${items}</div>`);
    document.body.append(backdrop, menu);
    const r = button.getBoundingClientRect();
    menu.style.top = `${r.bottom + 4}px`;
    menu.style.left = `${Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)}px`;
    button.classList.add('is-open');

    menu.addEventListener('click', (e) => {
      const open = e.target.closest('[data-open]')?.dataset.open;
      const win = e.target.closest('[data-win]')?.dataset.win;
      if (open) m.addPanel(open, m.groups[0]?.id ?? '');
      if (win === 'reset') m.resetLayout();
      if (win === 'forget') this.dock.clearSaved();
      if (open || win) this._closeMenu();
    });
    backdrop.addEventListener('click', () => this._closeMenu());
    const onKey = (e) => { if (e.key === 'Escape') { this._closeMenu(); button.focus(); } };
    document.addEventListener('keydown', onKey);
    this._menu = { name, menu, backdrop, button, onKey };
    menu.querySelector('button')?.focus();
  }

  _closeMenu() {
    if (!this._menu) return;
    this._menu.menu.remove();
    this._menu.backdrop.remove();
    this._menu.button.classList.remove('is-open');
    document.removeEventListener('keydown', this._menu.onKey);
    this._menu = null;
  }
}
