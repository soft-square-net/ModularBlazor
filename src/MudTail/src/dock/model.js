// MudDock layout model: a recursive tree of splits and groups, plus the auto-hidden blocks at each edge.
// Pure data, no DOM. A JavaScript port of VsDock's DockService (the "Blazor WASM Web IDE Dock Panel Layout"
// project): the same operations and rules, so layouts behave the same in both.
//
//   split  { type: 'split', id, weight, direction: 'row' | 'column', children: Node[] }
//   group  { type: 'group', id, weight, panels: Panel[], activeId, flyoutWidth, tabsAtBottom }
//   panel  { id, key, title, state: { [k]: string } }     (state survives moves and is saved with the layout)
//
// A split's children share its space by `weight` (flex-grow); only the ratio between siblings matters.
// Every change fires 'change' once. Sides 'left' / 'right' are logical: start / end in RTL.

export const DropZone = Object.freeze({
  Center: 'Center', Tabs: 'Tabs', Left: 'Left', Right: 'Right', Top: 'Top', Bottom: 'Bottom',
});

const LAYOUT_VERSION = 1;

export function newId() {
  const raw = globalThis.crypto?.randomUUID?.() ?? `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  return raw.replace(/-/g, '').slice(0, 8);
}

export class DockModel {
  /**
   * @param {object} options
   * @param {Array<{key:string,title:string,icon?:string,allowMultiple?:boolean,document?:boolean}>} options.definitions
   *   Panel kinds. `document: true` marks documents (editors): a column holding one cannot be auto-hidden.
   * @param {(model: DockModel) => {root: object|null, left?: object[], right?: object[]}} [options.defaultLayout]
   * @param {string} [options.blockKey] Panel kind used by "add a block" (default 'note').
   */
  constructor({ definitions = [], defaultLayout = null, blockKey = 'note' } = {}) {
    this._defs = new Map();
    this._defaultLayout = defaultLayout;
    this._blockKey = blockKey;
    this._untitled = 0;
    this._left = [];
    this._right = [];
    this._maximizedId = null;
    this._listeners = { change: new Set(), flyout: new Set() };
    this.root = null;
    definitions.forEach((d) => this.register(d));
    this._applyDefault();
  }

  /**
   * A defaultLayout function that builds the arrangement described by a saved layout (the object or JSON string
   * serialize() produces). Lets a layout be declared as data, e.g. passed from C#.
   */
  static layoutFrom(saved) {
    return (m) => {
      const d = typeof saved === 'string' ? JSON.parse(saved) : saved;
      return {
        root: d?.root ? m._fromDto(d.root) : null,
        left: (d?.left ?? []).map((x) => m._fromDto(x)),
        right: (d?.right ?? []).map((x) => m._fromDto(x)),
      };
    };
  }

  // ───────────── events ─────────────

  /** on('change', fn) after every change; on('flyout', (groupId, panelId) => …) when an auto-hidden panel should show. */
  on(event, fn) {
    this._listeners[event]?.add(fn);
    return () => this._listeners[event]?.delete(fn);
  }

  _raise() { this._listeners.change.forEach((fn) => fn()); }

  // ───────────── registry ─────────────

  register(def) { this._defs.set(def.key, { allowMultiple: false, document: false, icon: '', ...def }); }
  get definitions() { return [...this._defs.values()]; }
  getDefinition(key) { return this._defs.get(key) ?? null; }

  // ───────────── queries ─────────────

  *walk(node = this.root) {
    if (!node) return;
    yield node;
    if (node.type === 'split') for (const child of node.children) yield* this.walk(child);
  }

  /** Every block: the docked ones first, then the auto-hidden ones. */
  get groups() { return [...this.walk()].filter(isGroup).concat(this._left, this._right); }
  bar(side) { return side === 'left' ? this._left : this._right; }
  findNode(id) { return [...this.walk()].find((n) => n.id === id) ?? null; }
  findGroup(id) { return this.groups.find((g) => g.id === id) ?? null; }
  groupOf(panelId) { return this.groups.find((g) => g.panels.some((p) => p.id === panelId)) ?? null; }
  findPanel(id) { return this.groups.flatMap((g) => g.panels).find((p) => p.id === id) ?? null; }
  findPanelByKey(key) { return this.groups.flatMap((g) => g.panels).find((p) => p.key === key) ?? null; }
  activeOf(group) { return group.panels.find((p) => p.id === group.activeId) ?? group.panels[0] ?? null; }
  isDocked(group) { return [...this.walk()].includes(group); }

  /** Id of the block that fills the whole workspace, or null. Not persisted. */
  get maximizedId() {
    return this._maximizedId && [...this.walk()].some((n) => isGroup(n) && n.id === this._maximizedId) ? this._maximizedId : null;
  }

  // ───────────── factories ─────────────

  createPanel(key, title = null, state = null) {
    const def = this.getDefinition(key);
    if (!def) throw new Error(`MudDock: unknown panel kind "${key}"`);
    return {
      id: newId(),
      key,
      title: title ?? (def.allowMultiple ? `${def.title}${++this._untitled}` : def.title),
      state: { ...(state ?? {}) },
    };
  }

  newGroup(panels = [], { weight = 1, tabsAtBottom = false } = {}) {
    return { type: 'group', id: newId(), weight, parent: null, panels: [...panels], activeId: panels[0]?.id ?? null, flyoutWidth: 320, tabsAtBottom };
  }

  newSplit(direction, children, weight = 1) {
    return { type: 'split', id: newId(), weight, parent: null, direction, children: [...children] };
  }

  // ───────────── simple operations ─────────────

  activate(groupId, panelId) {
    const g = this.findGroup(groupId);
    if (!g || g.activeId === panelId) return;
    g.activeId = panelId;
    this._raise();
  }

  close(panelId) {
    const g = this.groupOf(panelId);
    if (!g) return;
    const idx = g.panels.findIndex((p) => p.id === panelId);
    g.panels.splice(idx, 1);
    if (g.activeId === panelId) g.activeId = g.panels.length ? g.panels[Math.min(idx, g.panels.length - 1)].id : null;
    this._normalize();
    this._raise();
  }

  closeGroup(groupId) {
    const g = this.findGroup(groupId);
    if (!g) return;
    g.panels.length = 0;
    this._normalize();
    this._raise();
  }

  /** New weights for a split's children (e.g. after dragging a splitter). */
  resize(splitId, weights) {
    const s = this.findNode(splitId);
    if (!s || s.type !== 'split' || s.children.length !== weights.length) return;
    s.children.forEach((c, i) => { c.weight = Math.max(0.01, weights[i]); });
    this._raise();
  }

  toggleTabsPosition(groupId) {
    const g = this.findGroup(groupId);
    if (!g) return;
    g.tabsAtBottom = !g.tabsAtBottom;
    this._raise();
  }

  canMaximize(group) { return this.isDocked(group); }

  toggleMaximize(groupId) {
    this._maximizedId = this.maximizedId === groupId ? null : groupId;
    this._raise();
  }

  restore() {
    if (!this.maximizedId) return;
    this._maximizedId = null;
    this._raise();
  }

  resetLayout() {
    this._applyDefault();
    this._raise();
  }

  // ───────────── adding panels / blocks ─────────────

  /** Adds a panel as a tab (Center) or as a new block beside the target. Single-instance kinds are focused instead. */
  addPanel(key, targetGroupId, zone = DropZone.Center) {
    const def = this.getDefinition(key);
    if (!def) return;
    if (!def.allowMultiple) {
      const existing = this.findPanelByKey(key);
      if (existing) { this._reveal(existing); return; }
    }
    this._place([this.createPanel(key)], null, targetGroupId, zone, -1, null);
    this._normalize();
    this._raise();
  }

  /** Splits the target and puts an empty block on the given side. */
  addBlock(targetGroupId, zone) { this.addPanel(this._blockKey, targetGroupId, zone); }

  /** View-menu behaviour: focus the panel if it is open, otherwise open it in the first block. */
  show(key) { this.addPanel(key, this.groups[0]?.id ?? '', DropZone.Center); }

  /** Opens (or focuses) a document panel, next to the other documents when there are any. */
  openDocument(key, title, state = {}) {
    const match = (p) => p.key === key && Object.entries(state).every(([k, v]) => p.state[k] === v);
    const existing = this.groups.flatMap((g) => g.panels).find(match);
    if (existing) { this._reveal(existing); return existing; }
    const panel = this.createPanel(key, title, state);
    const host = this.groups.find((g) => g.panels.some((p) => p.key === key)) ?? this.groups[0];
    this._place([panel], null, host?.id ?? '', DropZone.Center, -1, null);
    this._normalize();
    this._raise();
    return panel;
  }

  _reveal(panel) {
    const g = this.groupOf(panel.id);
    if (!g) return;
    g.activeId = panel.id;
    if (this._left.includes(g) || this._right.includes(g)) this._listeners.flyout.forEach((fn) => fn(g.id, panel.id));
    this._raise();
  }

  // ───────────── auto-hide / pin ─────────────

  /**
   * The edge a block can be auto-hidden to ('left' | 'right'), or null. Only outer, full-height side docks qualify:
   * its column must be the first or last of the workspace, and it must not hold documents, which stay in the middle.
   */
  sideOf(group) {
    let n = group;
    let column = null;
    let left = true;
    let right = true;
    while (n.parent) {
      const p = n.parent;
      if (p.direction === 'row') {
        if (p.children[0] !== n) left = false;
        if (p.children[p.children.length - 1] !== n) right = false;
        column = n;
      }
      n = p;
    }
    if (!column || left === right) return null;
    const holdsDocuments = [...this.walk(column)].some((x) => isGroup(x) && x.panels.some((p) => this.getDefinition(p.key)?.document));
    if (holdsDocuments) return null;
    return left ? 'left' : 'right';
  }

  canAutoHide(group) { return this.isDocked(group) && this.sideOf(group) !== null; }

  autoHide(groupId) {
    const g = [...this.walk()].find((n) => isGroup(n) && n.id === groupId);
    const side = g ? this.sideOf(g) : null;
    if (!side) return;
    this._removeNode(g);
    this.bar(side).push(g);
    this._normalize();
    this._raise();
  }

  /** Docks an auto-hidden block back at its edge of the workspace. */
  pin(groupId, activePanelId = null) {
    let side = 'left';
    let g = this._left.find((x) => x.id === groupId);
    if (!g) { side = 'right'; g = this._right.find((x) => x.id === groupId); }
    if (!g) return;
    const bar = this.bar(side);
    bar.splice(bar.indexOf(g), 1);
    if (activePanelId && g.panels.some((p) => p.id === activePanelId)) g.activeId = activePanelId;
    if (!this.root) this.root = g;
    else this._insertBeside(this.root, g, side === 'left' ? DropZone.Left : DropZone.Right, true);
    this._normalize();
    this._raise();
  }

  setFlyoutWidth(groupId, width) {
    const g = this.findGroup(groupId);
    if (!g) return;
    g.flyoutWidth = Math.min(1400, Math.max(180, width));
    this._raise();
  }

  // ───────────── drag & drop ─────────────

  /**
   * @param {'tab'|'group'} sourceType  one panel, or a whole block
   * @param {string} targetId  a group id, or 'root' for the outer edge of the workspace
   * @param {number} index  insert position when zone is Tabs
   */
  moveTo(sourceType, sourceId, targetId, zone, index = -1) {
    if (!this.root) return;
    const wholeGroup = sourceType === 'group';
    let srcGroup;
    let moving;
    let activeId = null;
    let singlePanel = null;

    if (wholeGroup) {
      srcGroup = this.findGroup(sourceId);
      if (!srcGroup || targetId === srcGroup.id) return;
      moving = [...srcGroup.panels];
      activeId = srcGroup.activeId;
    } else {
      singlePanel = this.findPanel(sourceId);
      if (!singlePanel) return;
      srcGroup = this.groupOf(singlePanel.id);
      moving = [singlePanel];

      const sameGroup = srcGroup.id === targetId;
      if (sameGroup && (zone === DropZone.Center || zone === DropZone.Tabs)) {
        if (index < 0) { this._reveal(singlePanel); return; }
        const from = srcGroup.panels.indexOf(singlePanel);
        const to = from < index ? index - 1 : index; // the tab leaves its old slot first
        srcGroup.panels.splice(from, 1);
        srcGroup.panels.splice(Math.min(Math.max(to, 0), srcGroup.panels.length), 0, singlePanel);
        srcGroup.activeId = singlePanel.id;
        this._raise();
        return;
      }
      if (sameGroup && srcGroup.panels.length === 1) return; // a lone tab cannot split its own block
    }

    if (targetId === 'root' && this.root === srcGroup && (wholeGroup || srcGroup.panels.length === 1)) return;

    // A block made by this drop starts with the tab position of the block it was dropped on
    // (or of the one it came from when dropped on the workspace edge). A whole block keeps its own.
    const tabsBottom = wholeGroup ? null
      : targetId === 'root' ? srcGroup.tabsAtBottom
        : this.findGroup(targetId)?.tabsAtBottom ?? null;

    // 1) take the item out of its old place
    let detached = null;
    const isEdge = zone !== DropZone.Center && zone !== DropZone.Tabs;
    if (!wholeGroup) {
      const i = srcGroup.panels.indexOf(singlePanel);
      srcGroup.panels.splice(i, 1);
      if (srcGroup.activeId === singlePanel.id) {
        srcGroup.activeId = srcGroup.panels.length ? srcGroup.panels[Math.min(i, srcGroup.panels.length - 1)].id : null;
      }
    } else if (isEdge) {
      detached = srcGroup; // the whole block is re-inserted as it is
      this._removeNode(srcGroup);
    } else {
      srcGroup.panels.length = 0; // its tabs merge into the target; the empty block disappears
    }
    this._normalize();

    // 2) put it in its new place
    this._place(moving, detached, targetId, zone, index, activeId, tabsBottom);
    this._normalize();
    this._raise();
  }

  _place(panels, detached, targetId, zone, index, activeId, tabsBottom = null) {
    if (!this.root) { this.root = detached ?? this.newGroup(panels); return; }

    if (zone === DropZone.Center || zone === DropZone.Tabs) {
      const target = this.findGroup(targetId) ?? this.groups[0];
      const at = zone === DropZone.Tabs && index >= 0 ? Math.min(index, target.panels.length) : target.panels.length;
      target.panels.splice(at, 0, ...panels);
      target.activeId = activeId ?? panels[0].id;
      return;
    }

    const node = detached ?? this.newGroup(panels);
    const atRoot = targetId === 'root';
    const anchor = atRoot ? this.root : this.findNode(targetId) ?? this.root;
    if (!detached) node.tabsAtBottom = tabsBottom ?? (isGroup(anchor) ? anchor.tabsAtBottom : false);
    this._insertBeside(anchor, node, zone, atRoot);
  }

  _insertBeside(anchor, node, zone, atRoot) {
    const dir = zone === DropZone.Left || zone === DropZone.Right ? 'row' : 'column';
    const before = zone === DropZone.Left || zone === DropZone.Top;

    if (atRoot) {
      // Dock around the whole workspace; the new block gets a quarter of it.
      if (anchor.type === 'split' && anchor.direction === dir) {
        node.weight = anchor.children.reduce((sum, c) => sum + c.weight, 0) / 3;
        anchor.children.splice(before ? 0 : anchor.children.length, 0, node);
      } else {
        anchor.weight = 3;
        node.weight = 1;
        this.root = this.newSplit(dir, before ? [node, anchor] : [anchor, node]);
      }
      return;
    }

    const parent = anchor.parent;
    if (parent && parent.direction === dir) {
      // Same direction as the parent: add a sibling that shares the anchor's space.
      const half = anchor.weight / 2;
      anchor.weight = half;
      node.weight = half;
      const i = parent.children.indexOf(anchor);
      parent.children.splice(before ? i : i + 1, 0, node);
    } else {
      // Different direction: the anchor is replaced by a new split holding anchor + node.
      const wrap = this.newSplit(dir, [], anchor.weight);
      anchor.weight = 1;
      node.weight = 1;
      if (!parent) this.root = wrap;
      else parent.children[parent.children.indexOf(anchor)] = wrap;
      wrap.children.push(...(before ? [node, anchor] : [anchor, node]));
    }
  }

  _removeNode(node) {
    if (isGroup(node)) {
      remove(this._left, node);
      remove(this._right, node);
    }
    if (node.parent) remove(node.parent.children, node);
    else if (this.root === node) this.root = null;
    node.parent = null;
  }

  // ───────────── tidying ─────────────

  /** Drops empty blocks, collapses single-child splits, hoists same-direction nesting, fixes parents. */
  _normalize() {
    this._left = this._left.filter((g) => g.panels.length);
    this._right = this._right.filter((g) => g.panels.length);
    this.root = this.root ? norm(this.root) : null;
    if (!this.root) return;
    this.root.parent = null;
    setParents(this.root);
  }

  _applyDefault() {
    this._left = [];
    this._right = [];
    this._maximizedId = null;
    const built = this._defaultLayout?.(this) ?? { root: null };
    this.root = built.root ?? null;
    this._left.push(...(built.left ?? []));
    this._right.push(...(built.right ?? []));
    this._normalize();
  }

  // ───────────── persistence ─────────────

  serialize() {
    return JSON.stringify({
      version: LAYOUT_VERSION,
      root: this.root ? toDto(this.root) : null,
      left: this._left.map(toDto),
      right: this._right.map(toDto),
    });
  }

  /** Restores a saved layout. Returns false (and changes nothing) for missing or invalid data. */
  load(json) {
    if (!json || !String(json).trim()) return false;
    try {
      const dto = JSON.parse(json);
      if (!dto || dto.version !== LAYOUT_VERSION) return false;
      // Build everything first so a bad file cannot leave the layout half-replaced.
      const root = dto.root ? this._fromDto(dto.root) : null;
      const left = (dto.left ?? []).map((d) => this._fromDto(d)).filter(isGroup);
      const right = (dto.right ?? []).map((d) => this._fromDto(d)).filter(isGroup);
      this.root = root;
      this._left = left;
      this._right = right;
      this._maximizedId = null;
      this._normalize();
      this._untitled = this.groups.reduce((n, g) => n + g.panels.length, 0);
      this._raise();
      return true;
    } catch {
      return false;
    }
  }

  _fromDto(d) {
    if (d.type === 'split') {
      if (d.direction !== 'row' && d.direction !== 'column') throw new Error('bad split');
      const s = { type: 'split', id: String(d.id || newId()), weight: num(d.weight, 1), parent: null, direction: d.direction, children: [] };
      for (const c of d.children ?? []) s.children.push(this._fromDto(c));
      return s;
    }
    if (d.type !== 'group') throw new Error('bad node');
    const panels = (d.panels ?? [])
      .filter((p) => this.getDefinition(p.key)) // a panel kind that no longer exists is dropped
      .map((p) => ({ id: String(p.id || newId()), key: p.key, title: String(p.title ?? ''), state: { ...(p.state ?? {}) } }));
    return {
      type: 'group', id: String(d.id || newId()), weight: num(d.weight, 1), parent: null, panels,
      activeId: d.activeId ?? null, flyoutWidth: num(d.flyoutWidth, 320) || 320,
      tabsAtBottom: d.tabsAtBottom ?? !panels.some((p) => this.getDefinition(p.key)?.document),
    };
  }
}

// ───────────── helpers ─────────────

function isGroup(n) { return n?.type === 'group'; }

function remove(list, item) {
  const i = list.indexOf(item);
  if (i >= 0) list.splice(i, 1);
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function norm(node) {
  if (isGroup(node)) return node.panels.length ? node : null;
  const kept = [];
  for (const child of node.children) {
    const r = norm(child);
    if (!r) continue;
    if (r.type === 'split' && r.direction === node.direction) {
      // A split inside a split of the same direction is redundant: hoist its children.
      const total = r.children.reduce((sum, c) => sum + c.weight, 0);
      for (const gc of r.children) {
        gc.weight = (gc.weight / total) * r.weight;
        kept.push(gc);
      }
    } else kept.push(r);
  }
  node.children = kept;
  if (!kept.length) return null;
  if (kept.length === 1) { kept[0].weight = node.weight; return kept[0]; }
  return node;
}

function setParents(node) {
  if (node.type !== 'split') return;
  for (const c of node.children) { c.parent = node; setParents(c); }
}

function toDto(n) {
  if (n.type === 'split') {
    return { type: 'split', id: n.id, weight: n.weight, direction: n.direction, children: n.children.map(toDto) };
  }
  return {
    type: 'group', id: n.id, weight: n.weight, activeId: n.activeId, flyoutWidth: n.flyoutWidth, tabsAtBottom: n.tabsAtBottom,
    panels: n.panels.map((p) => ({ id: p.id, key: p.key, title: p.title, state: { ...p.state } })),
  };
}
