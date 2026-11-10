// MudTreeView: a tree with levels that the reader can reorder: drag and drop (mouse, pen and touch), "move up" and
// "move down" buttons on every node (within its own level, among its siblings), and Alt+↑ / Alt+↓ from the keyboard.
// It follows the WAI-ARIA tree pattern (roving focus, arrow keys, aria-level / setsize / posinset) and announces
// every move to screen readers. Section navigation, menus, categories, playlists, a dock's explorer…
//
//   const tree = new MudTreeView({
//     nodes: [
//       { id: 'news', label: 'News', icon: 'news', expanded: true, children: [
//         { id: 'world', label: 'World' }, { id: 'local', label: 'Local' } ] },
//       { id: 'sport', label: 'Sport', icon: 'trophy', children: [ { id: 'football', label: 'Football' } ] },
//     ],
//     dragMode: 'any',              // 'any' (into other levels too) | 'level' (same depth) | 'siblings' (same parent) | 'none'
//     onMove: ({ node, from, to }) => api.saveOrder(…),
//   });
//   host.appendChild(tree.getElement());

import { getIconSvg } from '../core/icons.js';
import { t, formatNumber } from '../core/i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DRAG_THRESHOLD = 6;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let uid = 0;

function normalize(nodes) {
  return (nodes ?? []).map((n) => ({
    ...n,
    id: String(n.id ?? `node-${++uid}`),
    label: n.label ?? String(n.id ?? ''),
    expanded: !!n.expanded,
    children: n.children ? normalize(n.children) : [],
  }));
}

function clone(nodes) {
  return nodes.map(({ children, ...rest }) => ({ ...rest, children: clone(children) }));
}

export class MudTreeView {
  /**
   * @param {object} o
   * @param {Array} o.nodes   [{ id, label, icon?, badge?, expanded?, disabled?, draggable?, droppable?, children?, …your data }]
   * @param {string} [o.label]          the tree's accessible name
   * @param {'any'|'level'|'siblings'|'none'} [o.dragMode='any']
   * @param {boolean} [o.orderButtons=true]   the move up / move down buttons
   * @param {boolean} [o.allowNesting=true]   drop "inside" a node (makes it a child); off in 'level' / 'siblings' mode
   * @param {number} [o.maxDepth]             deepest level a node may be dropped at (1 = top level only)
   * @param {(node, target, position) => boolean} [o.canDrop]   position: 'before' | 'after' | 'inside'
   * @param {'single'|'none'} [o.selection='single']
   * @param {string} [o.selected]             the selected node's id
   * @param {boolean} [o.dense] [o.lines=true]  compact rows; indent guides
   * @param {string} [o.defaultIcon] [o.folderIcon]  icons for leaves / nodes with children (default: file / folder)
   * @param {(e) => void} [o.onMove]      { node, from: { parentId, index }, to: { parentId, index }, source: 'drag'|'button'|'keyboard'|'api' }
   * @param {(node) => void} [o.onSelect] [o.onToggle(node, expanded)] [o.onChange(nodes)]
   */
  constructor(o = {}) {
    this.options = { dragMode: 'any', orderButtons: true, allowNesting: true, selection: 'single', lines: true, ...o };
    this.nodes = normalize(o.nodes);
    this.selectedId = o.selected != null ? String(o.selected) : null;
    this.focusId = this.selectedId;
    this.id = `mud-tree-${++uid}`;
    this.drag = null;
    this._build();
    this.render();
  }

  // ───────── public API ─────────

  getElement() { return this.el; }
  /** A copy of the tree, in its current order. */
  getData() { return clone(this.nodes); }
  setData(nodes) { this.nodes = normalize(nodes); this.render(); }
  getSelected() { return this.selectedId ? this.find(this.selectedId)?.node ?? null : null; }

  /** { node, parent (null at the top), siblings (the array it is in), index, level (1-based) }, or null. */
  find(id, list = this.nodes, parent = null, level = 1) {
    const key = String(id);
    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      if (node.id === key) return { node, parent, siblings: list, index: i, level };
      const deeper = this.find(key, node.children, node, level + 1);
      if (deeper) return deeper;
    }
    return null;
  }

  select(id, { focus = false } = {}) {
    const hit = this.find(id);
    if (!hit || hit.node.disabled) return;
    if (this.options.selection !== 'none') this.selectedId = hit.node.id;
    this.focusId = hit.node.id;
    this._expandAncestors(hit.node.id);
    this.render();
    if (focus) this._focus(hit.node.id);
    this.options.onSelect?.(hit.node);
  }

  toggle(id, expanded) {
    const hit = this.find(id);
    if (!hit || !hit.node.children.length) return;
    const next = expanded ?? !hit.node.expanded;
    if (next === hit.node.expanded) return;
    hit.node.expanded = next;
    this.render();
    this.options.onToggle?.(hit.node, next);
  }

  expandAll() { this._walk((n) => { if (n.children.length) n.expanded = true; }); this.render(); }
  collapseAll() { this._walk((n) => { n.expanded = false; }); this.render(); }

  /** Moves a node one place up among its siblings. Returns true when it moved. */
  moveUp(id, source = 'api') {
    const hit = this.find(id);
    if (!hit || hit.index === 0) return false;
    return this.move(id, hit.parent?.id ?? null, hit.index - 1, source);
  }

  /** Moves a node one place down among its siblings. Returns true when it moved. */
  moveDown(id, source = 'api') {
    const hit = this.find(id);
    if (!hit || hit.index >= hit.siblings.length - 1) return false;
    return this.move(id, hit.parent?.id ?? null, hit.index + 1, source);
  }

  /**
   * Moves a node to `index` among the children of `parentId` (null = top level), the index counted after the node
   * is taken out. Refuses a move into the node itself or its descendants. Returns true when it moved.
   */
  move(id, parentId, index, source = 'api') {
    const hit = this.find(id);
    if (!hit) return false;
    const target = parentId == null ? null : this.find(parentId);
    if (parentId != null && (!target || this._contains(hit.node, target.node))) return false;
    const list = target ? target.node.children : this.nodes;
    const from = { parentId: hit.parent?.id ?? null, index: hit.index };
    const to = { parentId: target?.node.id ?? null, index: Math.max(0, Math.min(index, list.length - (list === hit.siblings ? 1 : 0))) };
    if (from.parentId === to.parentId && from.index === to.index) return false;

    const before = this._positions();
    hit.siblings.splice(hit.index, 1);
    list.splice(to.index, 0, hit.node);
    if (target) target.node.expanded = true;
    this.focusId = hit.node.id;
    this.render();
    this._animate(before, hit.node.id);
    this._announce(hit.node, to);
    this.options.onMove?.({ node: hit.node, from, to, source });
    this.options.onChange?.(this.getData());
    return true;
  }

  /** Adds a node under parentId (null = top level) at index (default: last). Returns its id. */
  addNode(parentId, node, index = Infinity) {
    const [n] = normalize([node]);
    const target = parentId == null ? null : this.find(parentId);
    const list = target ? target.node.children : this.nodes;
    list.splice(Math.min(index, list.length), 0, n);
    if (target) target.node.expanded = true;
    this.render();
    this.options.onChange?.(this.getData());
    return n.id;
  }

  removeNode(id) {
    const hit = this.find(id);
    if (!hit) return false;
    hit.siblings.splice(hit.index, 1);
    if (this.selectedId && !this.find(this.selectedId)) this.selectedId = null;
    if (this.focusId && !this.find(this.focusId)) this.focusId = hit.siblings[Math.min(hit.index, hit.siblings.length - 1)]?.id ?? hit.parent?.id ?? null;
    this.render();
    this.options.onChange?.(this.getData());
    return true;
  }

  updateNode(id, patch) {
    const hit = this.find(id);
    if (!hit) return false;
    const { children, ...rest } = patch ?? {};
    Object.assign(hit.node, rest);
    if (children) hit.node.children = normalize(children);
    this.render();
    return true;
  }

  dispose() {
    this._endDrag(true);
    this.el.remove();
  }

  // ───────── building & rendering ─────────

  _build() {
    const o = this.options;
    const el = document.createElement('div');
    el.className = `mud-tree${o.dense ? ' mud-tree--dense' : ''}${o.lines ? ' mud-tree--lines' : ''}${o.dragMode !== 'none' ? ' mud-tree--draggable' : ''}`;
    el.innerHTML = `
      <ul class="mud-tree__root" role="tree" id="${this.id}" aria-label="${esc(o.label ?? t('tree.label', {}, 'Tree'))}"></ul>
      <div class="mud-tree__drop-line" aria-hidden="true" hidden></div>
      <div class="mud-sr-only" aria-live="polite"></div>`;
    this.el = el;
    this.$ = { root: el.querySelector('ul'), line: el.querySelector('.mud-tree__drop-line'), live: el.querySelector('[aria-live]') };

    el.addEventListener('click', (e) => this._onClick(e));
    el.addEventListener('keydown', (e) => this._onKey(e));
    el.addEventListener('focusin', (e) => {
      const li = e.target.closest?.('[role="treeitem"]');
      if (li && e.target === li) this.focusId = li.dataset.id;
    });
    el.addEventListener('pointerdown', (e) => this._onPointerDown(e));
  }

  render() {
    const hadFocus = this.el.contains(document.activeElement);
    if (!this.focusId || !this._visible().some((n) => n.id === this.focusId)) this.focusId = this.selectedId && this._visible().some((n) => n.id === this.selectedId) ? this.selectedId : this.nodes[0]?.id ?? null;
    this.$.root.innerHTML = this._items(this.nodes, 1);
    if (hadFocus && this.focusId) this._focus(this.focusId);
  }

  _items(list, level) {
    const o = this.options;
    return list.map((n, i) => {
      const hasKids = n.children.length > 0;
      const expanded = hasKids && n.expanded;
      const selected = n.id === this.selectedId;
      const draggable = o.dragMode !== 'none' && n.draggable !== false && !n.disabled;
      const icon = n.icon ?? (hasKids ? (expanded ? o.folderOpenIcon ?? 'folderOpen' : o.folderIcon ?? 'folderClosed') : o.defaultIcon ?? 'file');
      const label = esc(n.label);
      const order = o.orderButtons && !n.disabled ? `
        <span class="mud-tree__order">
          <button type="button" class="mud-tree__btn" data-tree="up" tabindex="-1" ${i === 0 ? 'disabled' : ''}
            title="${esc(t('tree.moveUp', {}, 'Move up'))}" aria-label="${esc(t('tree.moveUpNode', { label: n.label }, 'Move {label} up'))}">${getIconSvg('arrowUp', 15)}</button>
          <button type="button" class="mud-tree__btn" data-tree="down" tabindex="-1" ${i === list.length - 1 ? 'disabled' : ''}
            title="${esc(t('tree.moveDown', {}, 'Move down'))}" aria-label="${esc(t('tree.moveDownNode', { label: n.label }, 'Move {label} down'))}">${getIconSvg('arrowDown', 15)}</button>
        </span>` : '';
      return `<li role="treeitem" class="mud-tree__item${selected ? ' is-selected' : ''}${n.disabled ? ' is-disabled' : ''}" data-id="${esc(n.id)}"
          aria-level="${level}" aria-setsize="${list.length}" aria-posinset="${i + 1}"
          ${hasKids ? `aria-expanded="${expanded}"` : ''} ${o.selection !== 'none' ? `aria-selected="${selected}"` : ''} ${n.disabled ? 'aria-disabled="true"' : ''}
          tabindex="${n.id === this.focusId ? 0 : -1}" ${o.orderButtons ? 'aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"' : ''}>
        <div class="mud-tree__row" style="--mud-tree-level: ${level - 1}">
          ${draggable ? `<span class="mud-tree__grip" data-tree="grip" aria-hidden="true" title="${esc(t('tree.drag', {}, 'Drag to reorder'))}">${getIconSvg('grip', 15)}</span>` : '<span class="mud-tree__grip is-empty" aria-hidden="true"></span>'}
          ${hasKids ? `<span class="mud-tree__toggle" data-tree="toggle" aria-hidden="true">${getIconSvg('chevronRight', 16)}</span>` : '<span class="mud-tree__toggle is-leaf" aria-hidden="true"></span>'}
          ${icon ? `<span class="mud-tree__icon" aria-hidden="true">${getIconSvg(icon, 17)}</span>` : ''}
          <span class="mud-tree__label">${label}</span>
          ${n.badge != null ? `<span class="mud-tree__badge">${esc(typeof n.badge === 'number' ? formatNumber(n.badge) : n.badge)}</span>` : ''}
          ${order}
        </div>
        ${hasKids ? `<ul role="group" class="mud-tree__group"${expanded ? '' : ' hidden'}>${this._items(n.children, level + 1)}</ul>` : ''}
      </li>`;
    }).join('');
  }

  _row(id) { return this.$.root.querySelector(`[data-id="${CSS.escape(id)}"] > .mud-tree__row`); }

  _focus(id) {
    const li = this.$.root.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!li) return;
    this.$.root.querySelectorAll('[role="treeitem"][tabindex="0"]').forEach((x) => { x.tabIndex = -1; });
    li.tabIndex = 0;
    li.focus({ preventScroll: false });
    this.focusId = id;
  }

  /** Visible nodes in reading order (children of collapsed nodes left out). */
  _visible(list = this.nodes, out = []) {
    for (const n of list) {
      out.push(n);
      if (n.expanded && n.children.length) this._visible(n.children, out);
    }
    return out;
  }

  _walk(fn, list = this.nodes) { for (const n of list) { fn(n); this._walk(fn, n.children); } }

  _contains(node, maybeChild) {
    if (node === maybeChild) return true;
    return node.children.some((c) => this._contains(c, maybeChild));
  }

  _expandAncestors(id) {
    let hit = this.find(id);
    while (hit?.parent) { hit.parent.expanded = true; hit = this.find(hit.parent.id); }
  }

  // ───────── mouse & keyboard ─────────

  _onClick(e) {
    if (this._suppressClick) { this._suppressClick = false; return; }
    const li = e.target.closest('[role="treeitem"]');
    if (!li || !this.el.contains(li)) return;
    const id = li.dataset.id;
    const action = e.target.closest('[data-tree]')?.dataset.tree;
    if (action === 'up') { this.moveUp(id, 'button'); this._focusButton(id, 'up'); return; }
    if (action === 'down') { this.moveDown(id, 'button'); this._focusButton(id, 'down'); return; }
    if (action === 'toggle') { this.focusId = id; this.toggle(id); this._focus(id); return; }
    if (e.target.closest('.mud-tree__row')) {
      const node = this.find(id)?.node;
      if (!node || node.disabled) return;
      this.select(id, { focus: true });
    }
  }

  /** After a button move, keep the pointer user's place: focus the node (the buttons are not tab stops). */
  _focusButton(id) { this._focus(id); }

  _onKey(e) {
    const li = e.target.closest?.('[role="treeitem"]');
    if (!li || e.target !== li) return;
    if (this.drag && e.key === 'Escape') { this._endDrag(true); return; }
    const id = li.dataset.id;
    const hit = this.find(id);
    const visible = this._visible();
    const i = visible.findIndex((n) => n.id === id);
    const go = (n) => { if (n) { e.preventDefault(); this._focus(n.id); } };

    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      if (!this.options.orderButtons || hit.node.disabled) return;
      if (e.key === 'ArrowUp') this.moveUp(id, 'keyboard'); else this.moveDown(id, 'keyboard');
      this._focus(id);
      return;
    }
    const rtl = getComputedStyle(this.el).direction === 'rtl';
    const inward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const outward = rtl ? 'ArrowRight' : 'ArrowLeft';
    switch (e.key) {
      case 'ArrowDown': go(visible[i + 1]); break;
      case 'ArrowUp': go(visible[i - 1]); break;
      case 'Home': go(visible[0]); break;
      case 'End': go(visible[visible.length - 1]); break;
      case inward:
        e.preventDefault();
        if (hit.node.children.length && !hit.node.expanded) { this.toggle(id, true); this._focus(id); }
        else if (hit.node.expanded) go(hit.node.children[0]);
        break;
      case outward:
        e.preventDefault();
        if (hit.node.expanded) { this.toggle(id, false); this._focus(id); }
        else if (hit.parent) go(hit.parent);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        this.select(id, { focus: true });
        break;
      case '*': // expand every sibling
        e.preventDefault();
        hit.siblings.forEach((n) => { if (n.children.length) n.expanded = true; });
        this.render();
        this._focus(id);
        break;
      default:
        // Type-ahead: the next visible node whose label starts with the letter.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const k = e.key.toLocaleLowerCase();
          const next = [...visible.slice(i + 1), ...visible.slice(0, i)].find((n) => String(n.label).toLocaleLowerCase().startsWith(k));
          go(next);
        }
    }
  }

  // ───────── drag & drop ─────────

  _onPointerDown(e) {
    if (e.button !== 0 || this.options.dragMode === 'none') return;
    const row = e.target.closest('.mud-tree__row');
    if (!row || !this.el.contains(row) || e.target.closest('button')) return;
    const id = row.parentElement.dataset.id;
    const node = this.find(id)?.node;
    if (!node || node.disabled || node.draggable === false) return;
    // Touch scrolls the page, so on touch screens only the grip starts a drag.
    if (e.pointerType !== 'mouse' && !e.target.closest('[data-tree="grip"]')) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const move = (ev) => {
      if (!this.drag) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
        this._startDrag(id, row, ev);
      }
      ev.preventDefault();
      this._dragOver(ev);
    };
    const up = (ev) => {
      cleanup();
      if (this.drag) { this._suppressClick = true; this._drop(ev); setTimeout(() => { this._suppressClick = false; }, 0); }
    };
    const cancel = () => { cleanup(); this._endDrag(true); };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }

  _startDrag(id, row, ev) {
    const ghost = document.createElement('div');
    ghost.className = 'mud-tree__ghost';
    ghost.dir = getComputedStyle(this.el).direction;
    ghost.innerHTML = row.querySelector('.mud-tree__icon')?.outerHTML ?? '';
    ghost.append(Object.assign(document.createElement('span'), { textContent: this.find(id).node.label }));
    document.body.appendChild(ghost);
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); this._endDrag(true); } };
    document.addEventListener('keydown', onKey, true);
    this.drag = { id, ghost, target: null, onKey, expandTimer: 0, scrollTimer: 0 };
    row.parentElement.classList.add('is-dragging');
    this.el.classList.add('is-dragging');
    this._moveGhost(ev);
  }

  _moveGhost(ev) {
    this.drag.ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 8}px)`;
  }

  _dragOver(ev) {
    const d = this.drag;
    if (!d) return;
    this._moveGhost(ev);
    this._autoScroll(ev);
    const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.mud-tree__row');
    const prev = d.target;
    d.target = null;
    if (row && this.el.contains(row)) {
      const targetId = row.parentElement.dataset.id;
      const rect = row.getBoundingClientRect();
      const rel = (ev.clientY - rect.top) / rect.height;
      const nesting = this._nestingAllowed();
      const position = nesting ? (rel < 0.28 ? 'before' : rel > 0.72 ? 'after' : 'inside') : rel < 0.5 ? 'before' : 'after';
      if (this._canDrop(d.id, targetId, position)) d.target = { id: targetId, position, row };
      else if (nesting && position === 'inside') {
        // A node that cannot take children still accepts a drop before or after it.
        const fallback = rel < 0.5 ? 'before' : 'after';
        if (this._canDrop(d.id, targetId, fallback)) d.target = { id: targetId, position: fallback, row };
      }
    }
    if (prev?.id !== d.target?.id || prev?.position !== d.target?.position) {
      clearTimeout(d.expandTimer);
      if (d.target?.position === 'inside') {
        const node = this.find(d.target.id).node;
        if (node.children.length && !node.expanded) d.expandTimer = setTimeout(() => { if (this.drag?.target?.id === node.id) { node.expanded = true; this._rerenderDuringDrag(); } }, 700);
      }
    }
    this._paintTarget();
  }

  _rerenderDuringDrag() {
    const id = this.drag.id;
    this.render();
    this.$.root.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.add('is-dragging');
    if (this.drag.target) this.drag.target.row = this._row(this.drag.target.id);
    this._paintTarget();
  }

  _paintTarget() {
    const d = this.drag;
    this.$.root.querySelectorAll('.is-drop-inside').forEach((r) => r.classList.remove('is-drop-inside'));
    const line = this.$.line;
    this.el.classList.toggle('is-drop-invalid', !d?.target);
    if (!d?.target) { line.hidden = true; return; }
    const { row, position } = d.target;
    if (position === 'inside') { row.classList.add('is-drop-inside'); line.hidden = true; return; }
    const host = this.el.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const label = row.querySelector('.mud-tree__toggle') ?? row;
    const lr = label.getBoundingClientRect();
    const rtl = getComputedStyle(this.el).direction === 'rtl';
    line.hidden = false;
    line.style.top = `${(position === 'before' ? r.top : r.bottom) - host.top + this.el.scrollTop - 1}px`;
    line.style.insetInlineStart = `${rtl ? host.right - lr.right : lr.left - host.left}px`;
  }

  _autoScroll(ev) {
    const d = this.drag;
    clearInterval(d.scrollTimer);
    const scroller = this.el.scrollHeight > this.el.clientHeight ? this.el : null;
    const box = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const edge = 40;
    const dir = ev.clientY < box.top + edge ? -1 : ev.clientY > box.bottom - edge ? 1 : 0;
    if (!dir) return;
    d.scrollTimer = setInterval(() => {
      if (scroller) scroller.scrollTop += dir * 10; else window.scrollBy(0, dir * 10);
      this._paintTarget();
    }, 16);
  }

  _nestingAllowed() {
    const m = this.options.dragMode;
    return this.options.allowNesting && m === 'any';
  }

  /** Is dropping node `id` at `position` of `targetId` allowed by the mode, the depth limit and canDrop? */
  _canDrop(id, targetId, position) {
    if (id === targetId) return false;
    const src = this.find(id);
    const dst = this.find(targetId);
    if (!src || !dst || this._contains(src.node, dst.node)) return false;
    if (position === 'inside' && (dst.node.droppable === false || dst.node.disabled)) return false;
    const mode = this.options.dragMode;
    const newLevel = position === 'inside' ? dst.level + 1 : dst.level;
    const newParent = position === 'inside' ? dst.node : dst.parent;
    if (mode === 'siblings' && newParent !== src.parent) return false;
    if (mode === 'level' && newLevel !== src.level) return false;
    if (this.options.maxDepth && newLevel + this._depth(src.node) - 1 > this.options.maxDepth) return false;
    if (newParent && newParent.droppable === false) return false;
    return this.options.canDrop ? this.options.canDrop(src.node, dst.node, position) !== false : true;
  }

  _depth(node) { return 1 + Math.max(0, ...node.children.map((c) => this._depth(c))); }

  _drop() {
    const d = this.drag;
    const target = d?.target;
    const id = d?.id;
    this._endDrag(false);
    if (!target) return;
    const dst = this.find(target.id);
    const src = this.find(id);
    if (target.position === 'inside') { this.move(id, dst.node.id, dst.node.children.length, 'drag'); return; }
    let index = dst.index + (target.position === 'after' ? 1 : 0);
    if (src.siblings === dst.siblings && src.index < index) index -= 1; // counted after the node is taken out
    this.move(id, dst.parent?.id ?? null, index, 'drag');
    this._focus(id);
  }

  _endDrag(cancelled) {
    const d = this.drag;
    if (!d) return;
    clearTimeout(d.expandTimer);
    clearInterval(d.scrollTimer);
    document.removeEventListener('keydown', d.onKey, true);
    d.ghost.remove();
    this.drag = null;
    this.el.classList.remove('is-dragging', 'is-drop-invalid');
    this.$.root.querySelectorAll('.is-dragging, .is-drop-inside').forEach((x) => x.classList.remove('is-dragging', 'is-drop-inside'));
    this.$.line.hidden = true;
    if (cancelled) this._announceText(t('tree.cancelled', {}, 'Move cancelled.'));
  }

  // ───────── feedback ─────────

  _positions() {
    const map = new Map();
    this.$.root.querySelectorAll('.mud-tree__row').forEach((r) => map.set(r.parentElement.dataset.id, r.getBoundingClientRect().top));
    return map;
  }

  /** FLIP: rows slide from where they were to where they are; the moved one flashes. */
  _animate(before, movedId) {
    const moved = this._row(movedId);
    moved?.classList.add('is-moved');
    setTimeout(() => this._row(movedId)?.classList.remove('is-moved'), 900);
    if (reducedMotion() || typeof Element.prototype.animate !== 'function') return;
    this.$.root.querySelectorAll('.mud-tree__row').forEach((r) => {
      const old = before.get(r.parentElement.dataset.id);
      if (old == null) return;
      const delta = old - r.getBoundingClientRect().top;
      if (Math.abs(delta) > 1) r.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
    });
  }

  _announce(node, to) {
    const list = to.parentId == null ? this.nodes : this.find(to.parentId).node.children;
    const parent = to.parentId == null ? null : this.find(to.parentId).node;
    const position = { position: formatNumber(to.index + 1), count: formatNumber(list.length), label: node.label };
    this._announceText(parent
      ? t('tree.movedIn', { ...position, parent: parent.label }, '{label} moved to position {position} of {count} in {parent}.')
      : t('tree.moved', position, '{label} moved to position {position} of {count}.'));
  }

  _announceText(text) {
    this.$.live.textContent = '';
    setTimeout(() => { this.$.live.textContent = text; }, 30);
  }
}
