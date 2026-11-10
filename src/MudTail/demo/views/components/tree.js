// Components ▸ Tree view: levels, drag & drop reordering, move up / down buttons, keyboard.
import { MudTreeView, createMudButton, showToast, t, formatNumber } from 'mudtail';
import { componentPage } from './page.js';

const n = (id, label, extra = {}) => ({ id, label: t(label), ...extra });

const siteSections = () => [
  n('news', 'News', { icon: 'news', expanded: true, badge: 128, children: [
    n('world', 'World', { badge: 42 }),
    n('politics', 'Politics', { badge: 31 }),
    n('local', 'Local', { expanded: true, children: [n('harbour', 'Harbour district'), n('old-town', 'Old Town')] }),
    n('business', 'Business', { badge: 18 }),
  ] }),
  n('sport', 'Sport', { icon: 'trophy', expanded: true, badge: 76, children: [
    n('football', 'Football', { children: [n('premier', 'Premier division'), n('cup', 'Cup')] }),
    n('basketball', 'Basketball'),
    n('athletics', 'Athletics'),
  ] }),
  n('culture', 'Culture', { icon: 'image', children: [n('gallery', 'Gallery'), n('music', 'Music'), n('film', 'Film')] }),
  n('opinion', 'Opinion', { icon: 'docs' }),
  n('about', 'About us', { icon: 'globe', draggable: false, droppable: false }),
];

const competitions = () => [
  n('league', 'Premier division', { icon: 'trophy', expanded: true, children: [n('northbridge', 'Northbridge'), n('harbour-city', 'Harbour City'), n('ridgeway', 'Ridgeway')] }),
  n('cup', 'Cup', { icon: 'trophy', expanded: true, children: [n('old-town-fc', 'Old Town'), n('coastal', 'Coastal United')] }),
];

const playlist = () => [
  n('morning', 'Morning briefing', { icon: 'news', expanded: true, children: [n('m1', 'Headlines'), n('m2', 'Weather'), n('m3', 'Markets')] }),
  n('evening', 'Evening edition', { icon: 'news', expanded: true, children: [n('e1', 'Match report'), n('e2', 'Gallery picks'), n('e3', 'Tomorrow')] }),
];

/** "Moved to …" in words, for the event log under each tree. */
function describe(tree, { node, to, source }) {
  const parent = to.parentId ? tree.find(to.parentId).node.label : t('demo.tree.top', {}, 'the top level');
  return t('demo.tree.log', { label: node.label, position: formatNumber(to.index + 1), parent, source: t(`demo.tree.by.${source}`, {}, source) },
    '{label} → position {position} in {parent} ({source})');
}

/** A tree, a toolbar (expand / collapse all) and a live log of moves. */
function mountTree(el, options, { showOrder = false } = {}) {
  const log = document.createElement('p');
  log.className = 'cp-tree-log';
  log.setAttribute('role', 'status');
  log.textContent = t('demo.tree.hint', {}, 'Drag a node, or use its ↑ ↓ buttons (Alt+↑ / Alt+↓ from the keyboard).');
  const order = document.createElement('pre');
  order.className = 'cp-request';
  order.setAttribute('aria-label', 'Order');
  const outline = (nodes, depth = 0) => nodes.map((x) => `${'  '.repeat(depth)}${x.label}\n${outline(x.children, depth + 1)}`).join('');
  const tree = new MudTreeView({
    ...options,
    onMove: (e) => { log.textContent = describe(tree, e); },
    onChange: (nodes) => { order.textContent = outline(nodes); },
    onSelect: (node) => { log.textContent = t('demo.tree.selected', { label: node.label }, 'Selected: {label}'); },
  });
  order.textContent = outline(tree.getData());
  const bar = document.createElement('div');
  bar.className = 'cp-row';
  bar.append(
    createMudButton({ text: t('demo.tree.expandAll', {}, 'Expand all'), variant: 'outlined', size: 'small', onClick: () => tree.expandAll() }),
    createMudButton({ text: t('demo.tree.collapseAll', {}, 'Collapse all'), variant: 'text', size: 'small', onClick: () => tree.collapseAll() }),
  );
  const layout = document.createElement('div');
  layout.className = showOrder ? 'cp-tree-layout' : '';
  const panel = document.createElement('div');
  panel.className = 'cp-tree-panel';
  panel.appendChild(tree.getElement());
  layout.append(panel);
  if (showOrder) layout.append(order);
  el.append(bar, layout, log);
  return () => tree.dispose();
}

export const TREE_PAGE = {
  id: 'tree-view', label: 'Tree view', icon: 'folder',
  render: () => componentPage({
    title: 'Tree view', kinds: ['JS', 'Blazor'],
    lead: 'A tree with levels that readers can reorder: drag and drop (mouse, pen or touch, using the grip on touch screens), or the <strong>move up</strong> / <strong>move down</strong> buttons on each node, which move it among its siblings on the same level. It follows the WAI-ARIA tree pattern and announces every move to screen readers.',
    examples: [
      {
        title: 'Site sections: drag anywhere',
        description: 'With <code>dragMode: \'any\'</code> a node can go before or after another one, or <em>inside</em> it (drop on the middle of a row; a collapsed node opens if you hold it there). A node never goes into its own branch. <em>About us</em> is locked: <code>draggable: false</code> and <code>droppable: false</code>. The outline on the right is <code>getData()</code> after each change.',
        code: `
          import { MudTreeView } from 'mudtail';

          const tree = new MudTreeView({
            label: 'Site sections',
            nodes: [
              { id: 'news', label: 'News', icon: 'news', expanded: true, badge: 128, children: [
                { id: 'world', label: 'World' }, { id: 'politics', label: 'Politics' },
                { id: 'local', label: 'Local', children: [{ id: 'harbour', label: 'Harbour district' }] },
              ] },
              { id: 'sport', label: 'Sport', icon: 'trophy', children: [ … ] },
              { id: 'about', label: 'About us', icon: 'globe', draggable: false, droppable: false },
            ],
            dragMode: 'any',                       // before / after / inside, on any level
            onMove: ({ node, from, to, source }) => api.moveSection(node.id, to.parentId, to.index),
            onChange: (nodes) => …,                // the whole tree, in its new order
          });
          host.appendChild(tree.getElement());`,
        mount: (el) => mountTree(el, { label: t('demo.tree.sections', {}, 'Site sections'), nodes: siteSections(), selected: 'world' }, { showOrder: true }),
      },
      {
        title: 'Same level only',
        description: '<code>dragMode: \'level\'</code>: a team can move to another competition, but stays a team (level 2). Competitions can be reordered among themselves.',
        code: `
          new MudTreeView({ nodes: competitions, dragMode: 'level' });`,
        mount: (el) => mountTree(el, { label: t('demo.tree.competitions', {}, 'Competitions'), nodes: competitions(), dragMode: 'level', dense: true }),
      },
      {
        title: 'Within its own parent only',
        description: '<code>dragMode: \'siblings\'</code>: the order inside each show changes, but nothing moves to another show. The same rule as the ↑ ↓ buttons.',
        code: `
          new MudTreeView({ nodes: playlist, dragMode: 'siblings', defaultIcon: 'tag' });`,
        mount: (el) => mountTree(el, { label: t('demo.tree.playlist', {}, 'Running order'), nodes: playlist(), dragMode: 'siblings', defaultIcon: 'tag' }),
      },
      {
        title: 'Buttons only, from code',
        description: 'With <code>dragMode: \'none\'</code> only the buttons reorder. Everything is also available from code: <code>moveUp</code>, <code>moveDown</code>, <code>move(id, parentId, index)</code>, <code>addNode</code>, <code>removeNode</code>, <code>updateNode</code>, <code>select</code>.',
        code: `
          const tree = new MudTreeView({ nodes, dragMode: 'none' });
          tree.addNode('sport', { id: 'tennis', label: 'Tennis' }, 0);   // first child of Sport
          tree.moveDown('tennis');
          tree.move('tennis', null, 0);                                   // to the top level, first`,
        mount(el) {
          const tree = new MudTreeView({ label: t('demo.tree.sections', {}, 'Site sections'), nodes: siteSections().slice(0, 3), dragMode: 'none', lines: false });
          let count = 0;
          const bar = document.createElement('div');
          bar.className = 'cp-row';
          bar.append(
            createMudButton({ text: t('demo.tree.addTennis', {}, 'Add a node to Sport'), size: 'small', onClick: () => {
              const id = tree.addNode('sport', { id: `tennis-${++count}`, label: `${t('Tennis')} ${formatNumber(count)}`, icon: 'tag' }, 0);
              tree.select(id);
            } }),
            createMudButton({ text: t('demo.tree.moveTop', {}, 'Move the selected node to the top level'), variant: 'outlined', size: 'small', onClick: () => {
              const node = tree.getSelected();
              if (!node) { showToast(t('demo.tree.selectFirst', {}, 'Select a node first'), 'warning'); return; }
              tree.move(node.id, null, 0);
            } }),
            createMudButton({ text: t('demo.tree.remove', {}, 'Remove the selected node'), variant: 'text', color: 'error', size: 'small', onClick: () => {
              const node = tree.getSelected();
              if (node) tree.removeNode(node.id);
            } }),
          );
          const panel = document.createElement('div');
          panel.className = 'cp-tree-panel';
          panel.appendChild(tree.getElement());
          el.append(bar, panel);
          return () => tree.dispose();
        },
      },
      {
        title: 'Blazor', language: 'Razor / C#',
        description: 'The tree raises <code>move</code> with the node id and its old and new place (parent id and index), and <code>change</code> with the whole tree, so you can save a single move or the full order.',
        code: `
          _tree = await _mud.InvokeAsync<IJSObjectReference>("create", "tree", _host, new
          {
              label = "Site sections",
              dragMode = "any",                      // any | level | siblings | none
              maxDepth = 3,
              nodes = sections.Select(s => new { id = s.Id, label = s.Name, icon = "news", children = … }),
          }, _self);

          [JSInvokable]
          public async Task OnMudEvent(string name, JsonElement payload)
          {
              if (name == "move")
              {
                  var id = payload.GetProperty("id").GetString()!;
                  var to = payload.GetProperty("to");
                  var parentId = to.GetProperty("parentId").GetString();      // null = top level
                  await Api.MoveSectionAsync(id, parentId, to.GetProperty("index").GetInt32());
              }
          }

          // from C#: await _tree.InvokeVoidAsync("moveUp", "politics");`,
      },
    ],
    api: [
      { title: 'Options', rows: [
        ['nodes', '<code>[{ id, label, icon?, badge?, expanded?, disabled?, draggable?, droppable?, children? }]</code>, plus any data of your own (kept in <code>getData()</code> and the events).'],
        ['dragMode', '<code>any</code> (before / after / inside, any level), <code>level</code> (same depth), <code>siblings</code> (same parent) or <code>none</code>.'],
        ['orderButtons, allowNesting, maxDepth, canDrop(node, target, position)', 'The ↑ ↓ buttons (default on); drops inside a node; the deepest level allowed; your own rule.'],
        ['selection, selected, label, dense, lines', 'Single selection (or <code>none</code>), the starting selection, the accessible name, compact rows, indent guides.'],
        ['defaultIcon, folderIcon, folderOpenIcon', 'Icons for nodes without their own.'],
        ['onMove, onChange, onSelect, onToggle', '<code>onMove({ node, from, to, source })</code> with <code>{ parentId, index }</code>; <code>source</code> is <code>drag</code>, <code>button</code>, <code>keyboard</code> or <code>api</code>.'],
      ] },
      { title: 'Methods', rows: [
        ['moveUp(id), moveDown(id), move(id, parentId, index)', 'Reorder from code (the index counts the siblings without the node).'],
        ['addNode(parentId, node, index), removeNode(id), updateNode(id, patch)', 'Change the tree.'],
        ['select(id), toggle(id, expanded), expandAll(), collapseAll()', 'Selection and expansion.'],
        ['getData(), setData(nodes), find(id), getSelected(), dispose()', 'Read and replace the tree.'],
      ] },
      { title: 'Keyboard', rows: [
        ['↑ ↓, Home, End', 'Previous / next visible node, first / last.'],
        ['→ ←', 'Open a node or go to its first child; close it or go to its parent (mirrored in right-to-left).'],
        ['Enter, Space', 'Select.'],
        ['Alt+↑, Alt+↓', 'Move the node up or down among its siblings.'],
        ['*, a letter', 'Open all siblings; jump to the next node starting with that letter.'],
        ['Esc', 'Cancel a drag.'],
      ] },
      { title: 'Blazor', rows: [
        ['create("tree", host, options, dotNetRef)', 'Handle methods: setData, getData, select, toggle, expandAll, collapseAll, moveUp, moveDown, move, addNode, removeNode, updateNode, dispose.'],
        ['Events', '<code>move</code> ({ id, from, to, source }), <code>change</code> (the tree), <code>select</code> (node), <code>toggle</code> ({ id, expanded }).'],
      ] },
    ],
  }),
};
