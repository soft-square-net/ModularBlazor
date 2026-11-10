import test from 'node:test';
import assert from 'node:assert/strict';
import { DockModel, DropZone } from './model.js';

const DEFS = [
  { key: 'explorer', title: 'Explorer' },
  { key: 'props', title: 'Properties' },
  { key: 'output', title: 'Output' },
  { key: 'toolbox', title: 'Toolbox' },
  { key: 'editor', title: 'Untitled', allowMultiple: true, document: true },
  { key: 'note', title: 'Block', allowMultiple: true },
];

// [explorer] | [editor a, editor b / output] | [props]   + toolbox auto-hidden left
function layout(m) {
  const left = m.newGroup([m.createPanel('explorer')]);
  const docs = m.newGroup([m.createPanel('editor', 'a.cs'), m.createPanel('editor', 'b.cs')]);
  const out = m.newGroup([m.createPanel('output')]);
  const center = m.newSplit('column', [docs, out], 3);
  const right = m.newGroup([m.createPanel('props')]);
  return { root: m.newSplit('row', [left, center, right]), left: [m.newGroup([m.createPanel('toolbox')])] };
}

const make = () => new DockModel({ definitions: DEFS, defaultLayout: layout });
const groupWith = (m, key) => m.groups.find((g) => g.panels.some((p) => p.key === key));
const shape = (n) => (n.type === 'group' ? n.panels.map((p) => p.title).join('+') : `${n.direction}(${n.children.map(shape).join(', ')})`);

test('default layout is built and normalized with parents set', () => {
  const m = make();
  assert.equal(shape(m.root), 'row(Explorer, column(a.cs+b.cs, Output), Properties)');
  assert.equal(m.bar('left').length, 1);
  for (const n of m.walk()) if (n !== m.root) assert.ok(n.parent, 'every non-root node has a parent');
});

test('dropping a tab in the centre of another block merges it as a tab', () => {
  const m = make();
  const out = m.findPanelByKey('output');
  m.moveTo('tab', out.id, groupWith(m, 'props').id, DropZone.Center);
  assert.equal(shape(m.root), 'row(Explorer, a.cs+b.cs, Properties+Output)');
  assert.equal(groupWith(m, 'props').activeId, out.id);
});

test('dropping a tab on an edge splits the target and the empty source block disappears', () => {
  const m = make();
  const ex = m.findPanelByKey('explorer');
  m.moveTo('tab', ex.id, groupWith(m, 'output').id, DropZone.Right);
  assert.equal(shape(m.root), 'row(column(a.cs+b.cs, row(Output, Explorer)), Properties)');
});

test('tabs re-order inside their own strip', () => {
  const m = make();
  const g = groupWith(m, 'editor');
  const [a] = g.panels;
  m.moveTo('tab', a.id, g.id, DropZone.Tabs, 2);
  assert.deepEqual(g.panels.map((p) => p.title), ['b.cs', 'a.cs']);
});

test('a lone tab cannot split its own block', () => {
  const m = make();
  const before = shape(m.root);
  const ex = m.findPanelByKey('explorer');
  m.moveTo('tab', ex.id, groupWith(m, 'explorer').id, DropZone.Left);
  assert.equal(shape(m.root), before);
});

test('a whole block dropped on the workspace edge docks around everything', () => {
  const m = make();
  m.moveTo('group', groupWith(m, 'output').id, 'root', DropZone.Bottom);
  assert.equal(shape(m.root), 'column(row(Explorer, a.cs+b.cs, Properties), Output)');
});

test('closing the last tab removes the block and collapses the split', () => {
  const m = make();
  m.close(m.findPanelByKey('output').id);
  assert.equal(shape(m.root), 'row(Explorer, a.cs+b.cs, Properties)');
});

test('closing the active tab activates its neighbour', () => {
  const m = make();
  const g = groupWith(m, 'editor');
  const [a, b] = g.panels;
  m.close(a.id);
  assert.equal(g.activeId, b.id);
});

test('only outer side columns without documents can auto-hide', () => {
  const m = make();
  assert.equal(m.sideOf(groupWith(m, 'explorer')), 'left');
  assert.equal(m.sideOf(groupWith(m, 'props')), 'right');
  assert.equal(m.sideOf(groupWith(m, 'output')), null, 'middle column');
  assert.equal(m.canAutoHide(groupWith(m, 'editor')), false);
});

test('auto-hide moves a block to its edge strip and pin docks it back', () => {
  const m = make();
  const props = groupWith(m, 'props');
  m.autoHide(props.id);
  assert.equal(shape(m.root), 'row(Explorer, column(a.cs+b.cs, Output))');
  assert.deepEqual(m.bar('right').map((g) => g.id), [props.id]);
  m.pin(props.id);
  assert.equal(shape(m.root), 'row(Explorer, column(a.cs+b.cs, Output), Properties)');
  assert.equal(m.bar('right').length, 0);
});

test('single-instance panels are revealed, not duplicated; an auto-hidden one asks for its flyout', () => {
  const m = make();
  const asked = [];
  m.on('flyout', (g, p) => asked.push([g, p]));
  m.show('toolbox');
  assert.equal(m.groups.flatMap((g) => g.panels).filter((p) => p.key === 'toolbox').length, 1);
  assert.equal(asked.length, 1);
});

test('addBlock splits the target with a new block', () => {
  const m = make();
  m.addBlock(groupWith(m, 'explorer').id, DropZone.Bottom);
  assert.match(shape(m.root), /^row\(column\(Explorer, Block\d+\)/);
});

test('resize keeps weights positive; maximize is forgotten when the block goes away', () => {
  const m = make();
  m.resize(m.root.id, [0, 2, 1]);
  assert.deepEqual(m.root.children.map((c) => c.weight), [0.01, 2, 1]);
  const out = groupWith(m, 'output');
  m.toggleMaximize(out.id);
  assert.equal(m.maximizedId, out.id);
  m.closeGroup(out.id);
  assert.equal(m.maximizedId, null);
});

test('serialize / load round-trips, and bad data changes nothing', () => {
  const m = make();
  m.findPanelByKey('explorer').state.expanded = 'src';
  m.moveTo('tab', m.findPanelByKey('output').id, groupWith(m, 'props').id, DropZone.Center);
  const json = m.serialize();

  const n = make();
  assert.equal(n.load(json), true);
  assert.equal(shape(n.root), shape(m.root));
  assert.equal(n.findPanelByKey('explorer').state.expanded, 'src');
  assert.equal(n.bar('left').length, 1);

  const before = shape(n.root);
  assert.equal(n.load('{"version":99}'), false);
  assert.equal(n.load('not json'), false);
  assert.equal(n.load(JSON.stringify({ version: 1, root: { type: 'split', direction: 'diagonal' } })), false);
  assert.equal(shape(n.root), before);
});

test('layoutFrom builds the default layout from saved-layout data (and from JSON)', () => {
  const saved = make().serialize();
  const fromObject = new DockModel({ definitions: DEFS, defaultLayout: DockModel.layoutFrom(JSON.parse(saved)) });
  const fromJson = new DockModel({ definitions: DEFS, defaultLayout: DockModel.layoutFrom(saved) });
  assert.equal(shape(fromObject.root), 'row(Explorer, column(a.cs+b.cs, Output), Properties)');
  assert.equal(shape(fromJson.root), shape(fromObject.root));
  assert.equal(fromJson.bar('left').length, 1);
  fromJson.close(fromJson.findPanelByKey('output').id);
  fromJson.resetLayout();
  assert.equal(shape(fromJson.root), 'row(Explorer, column(a.cs+b.cs, Output), Properties)');
});

test('every change fires one change event', () => {
  const m = make();
  let count = 0;
  m.on('change', () => count++);
  m.moveTo('tab', m.findPanelByKey('explorer').id, groupWith(m, 'output').id, DropZone.Top);
  assert.equal(count, 1);
});
