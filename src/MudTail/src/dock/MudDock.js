// MudDock: an IDE-style docking layout (tab groups, recursive splits, drag & drop docking, splitters,
// maximize, auto-hide edge strips with flyouts, layout persistence). The view for DockModel, ported from
// VsDock (the "Blazor WASM Web IDE Dock Panel Layout" project) and themed with MudTail tokens.
//
//   const dock = new MudDock({ definitions, defaultLayout, storageKey: 'my-app.layout' });
//   container.appendChild(dock.getElement());
//   …
//   dock.dispose();
//
// definitions: [{ key, title, icon, allowMultiple?, document?, render(panel, ctx) → Node | string | { element, dispose } }]
//   ctx.setState(name, value) stores a string in panel.state (saved with the layout and kept when the panel moves).
//
// Rendering is keyed: every split, group and panel element is created once and cached by id, and each change
// only moves the nodes whose place changed, so panel content (text, scroll, focus) is never rebuilt.

import { DockModel, DropZone } from './model.js';
import { isRtl } from '../core/direction.js';
import { t } from '../core/i18n.js';

const EDGE_PX = 18; // band along the workspace edge that docks around everything
const EDGE_TOP_PX = 6; // thinner on top so it does not steal drops meant for the tab strip below
const ZONE = 0.3; // fraction of a block that counts as an edge drop
const FLYOUT_CLOSE_MS = 280;

const svg = (body, extra = '') => `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" ${extra}>${body}</svg>`;
const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.3"';
const ICON = {
  maximize: svg('<rect x="2.5" y="2.5" width="11" height="11" />', STROKE),
  restore: svg('<rect x="2.5" y="5.5" width="8" height="8" /><path d="M5.5 5.5v-3h8v8h-3" />', STROKE),
  pin: svg('<path d="M5 1.5h6v1l-1 .5v3.5l2 2.5v1H8.5v4.5h-1V10H4V9l2-2.5V3L5 2.5z" />', 'fill="currentColor" class="mud-dock-pin"'),
  unpin: svg('<path d="M5 1.5h6v1l-1 .5v3.5l2 2.5v1H8.5v4.5h-1V10H4V9l2-2.5V3L5 2.5z" />', 'fill="currentColor" class="mud-dock-pin is-unpinned"'),
  addRight: svg('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="M8.5 2.5v11" />', STROKE),
  addBelow: svg('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="M1.5 8h13" />', STROKE),
  more: svg('<circle cx="3.5" cy="8" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="12.5" cy="8" r="1.2" />', 'fill="currentColor"'),
  close: svg('<path d="M4 4l8 8M12 4l-8 8" />', 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"'),
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Makes parent's children exactly `desired`, moving only the nodes that are out of place. */
function syncChildren(parent, desired) {
  let cursor = parent.firstChild;
  for (const el of desired) {
    if (el === cursor) { cursor = cursor.nextSibling; continue; }
    parent.insertBefore(el, cursor);
  }
  while (cursor) {
    const next = cursor.nextSibling;
    parent.removeChild(cursor);
    cursor = next;
  }
}

function div(className, attrs = {}) {
  const el = document.createElement('div');
  el.className = className;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export class MudDock {
  constructor({ model = null, definitions = [], defaultLayout = null, blockKey = 'note', storageKey = null } = {}) {
    this.model = model ?? new DockModel({ definitions, defaultLayout, blockKey });
    this.storageKey = storageKey;
    if (storageKey) {
      try { this.model.load(localStorage.getItem(storageKey)); } catch { /* storage blocked */ }
    }

    this.el = div('mud-dock');
    this._sides = { left: this._createSide('left'), right: this._createSide('right') };
    this._main = div('mud-dock__main');
    this.el.append(this._sides.left.el, this._main, this._sides.right.el);

    this._splits = new Map();
    this._wrappers = new Map();
    this._splitters = new Map();
    this._groups = new Map();
    this._panels = new Map();
    this._flyouts = new Map();
    this._folded = new Map(); // groupId -> Set of folded menu sections
    this._flyout = { groupId: null, panelId: null };
    this._closeTimer = 0;
    this._drag = null;
    this._target = null;
    this._overlay = null;
    this._menu = null;
    this._saveTimer = 0;

    this._bindEvents();
    this._offChange = this.model.on('change', () => { this.render(); this._save(); });
    this._offFlyout = this.model.on('flyout', (g, p) => this._openFlyout(g, p, 3000));
    this.render();
  }

  getElement() { return this.el; }

  /** Forgets the saved layout and goes back to the default one. */
  clearSaved() {
    if (this.storageKey) { try { localStorage.removeItem(this.storageKey); } catch { /* ignore */ } }
    this.model.resetLayout();
  }

  // ───────────────────────── rendering ─────────────────────────

  render() {
    const m = this.model;
    this._main.classList.toggle('has-max', !!m.maximizedId);
    if (!m.root) syncChildren(this._main, [this._emptyState()]);
    else syncChildren(this._main, [this._renderNode(m.root)]);

    if (this._flyout.groupId && ![...m.bar('left'), ...m.bar('right')].some((g) => g.id === this._flyout.groupId)) {
      this._flyout = { groupId: null, panelId: null };
    }
    this._renderSide('left');
    this._renderSide('right');
    this._collectGarbage();
  }

  _emptyState() {
    if (!this._empty) {
      this._empty = div('mud-dock__empty');
      this._empty.innerHTML = `
        <div class="mud-dock__empty-title">${esc(t('dock.emptyTitle', {}, 'No windows are open'))}</div>
        <div class="mud-dock__empty-sub">${esc(t('dock.emptyText', {}, 'Open one from the View menu, or restore the default layout.'))}</div>
        <button type="button" class="mud-button-root mud-button-filled mud-button-primary mud-button-small" data-dock-action="reset">${esc(t('dock.reset', {}, 'Reset window layout'))}</button>`;
    }
    return this._empty;
  }

  _renderNode(node) {
    return node.type === 'split' ? this._renderSplit(node) : this._renderGroup(node);
  }

  _renderSplit(split) {
    let el = this._splits.get(split.id);
    if (!el) {
      el = div('mud-dock-split');
      el.dataset.nodeId = split.id;
      this._splits.set(split.id, el);
    }
    el.className = `mud-dock-split mud-dock-split--${split.direction}`;
    el.dataset.dir = split.direction;

    const children = [];
    split.children.forEach((child, i) => {
      if (i > 0) {
        let sp = this._splitters.get(child.id);
        if (!sp) {
          sp = div('mud-dock-splitter', { role: 'separator', title: t('dock.splitter', {}, 'Drag to resize · double-click to equalize') });
          this._splitters.set(child.id, sp);
        }
        sp.className = `mud-dock-splitter mud-dock-splitter--${split.direction}`;
        sp.setAttribute('aria-orientation', split.direction === 'row' ? 'vertical' : 'horizontal');
        children.push(sp);
      }
      let w = this._wrappers.get(child.id);
      if (!w) {
        w = div('mud-dock-node');
        w.dataset.nodeId = child.id;
        this._wrappers.set(child.id, w);
      }
      w.style.flex = `${+child.weight.toFixed(4)} 1 0%`;
      syncChildren(w, [this._renderNode(child)]);
      children.push(w);
    });
    syncChildren(el, children);
    return el;
  }

  _actionsHtml(g) {
    const m = this.model;
    const isMax = m.maximizedId === g.id;
    let html = '';
    if (m.canMaximize(g)) {
      html += `<button type="button" class="mud-dock-btn" data-dock-action="maximize" title="${esc(isMax ? t('dock.restoreHint', {}, 'Restore (Esc)') : t('dock.maximizeHint', {}, 'Maximize (double-click the tab bar)'))}" aria-label="${esc(isMax ? t('dock.restore', {}, 'Restore') : t('dock.maximize', {}, 'Maximize'))}">${isMax ? ICON.restore : ICON.maximize}</button>`;
    }
    if (m.canAutoHide(g)) {
      html += `<button type="button" class="mud-dock-btn" data-dock-action="autohide" title="${esc(t('dock.autoHide', {}, 'Auto hide'))}" aria-label="${esc(t('dock.autoHide', {}, 'Auto hide'))}">${ICON.pin}</button>`;
    }
    html += `<button type="button" class="mud-dock-btn" data-dock-action="add-right" title="${esc(t('dock.addRight', {}, 'Add a block to the right'))}" aria-label="${esc(t('dock.addRight', {}, 'Add a block to the right'))}">${ICON.addRight}</button>`;
    html += `<button type="button" class="mud-dock-btn" data-dock-action="add-below" title="${esc(t('dock.addBelow', {}, 'Add a block below'))}" aria-label="${esc(t('dock.addBelow', {}, 'Add a block below'))}">${ICON.addBelow}</button>`;
    html += `<button type="button" class="mud-dock-btn" data-dock-action="menu" title="${esc(t('dock.more', {}, 'More actions'))}" aria-label="${esc(t('dock.more', {}, 'More actions'))}" aria-haspopup="menu">${ICON.more}</button>`;
    return html;
  }

  _renderGroup(g) {
    const m = this.model;
    let view = this._groups.get(g.id);
    if (!view) {
      const el = div('mud-dock-group');
      el.dataset.groupId = g.id;
      const toolbar = div('mud-dock-group__toolbar');
      const header = div('mud-dock-group__header');
      const tabs = div('mud-dock-tabs', { role: 'tablist' });
      const grip = () => div('mud-dock-grip', { draggable: 'true', 'data-drag-type': 'group', 'data-drag-id': g.id, title: t('dock.dragBlock', {}, 'Drag to move this whole block') });
      const actionsTop = div('mud-dock-actions');
      const actionsHeader = div('mud-dock-actions');
      toolbar.append(grip(), actionsTop);
      header.append(tabs, grip(), actionsHeader);
      const body = div('mud-dock-group__body');
      el.append(toolbar, header, body);
      view = { el, tabs, actionsTop, actionsHeader, body, signature: '' };
      this._groups.set(g.id, view);
    }

    const isMax = m.maximizedId === g.id;
    view.el.classList.toggle('is-max', isMax);
    view.el.classList.toggle('tabs-bottom', !!g.tabsAtBottom);
    const active = m.activeOf(g);

    // The tab strip and buttons are cheap to rebuild, but only when something they show changed.
    const signature = JSON.stringify([g.panels.map((p) => [p.id, p.title, p.key]), active?.id, isMax, m.canMaximize(g), m.canAutoHide(g)]);
    if (signature !== view.signature) {
      view.signature = signature;
      view.tabs.innerHTML = g.panels.map((p) => {
        const on = p.id === active?.id;
        const def = m.getDefinition(p.key);
        return `<div class="mud-dock-tab${on ? ' is-active' : ''}" role="tab" aria-selected="${on}" tabindex="${on ? 0 : -1}"
          draggable="true" data-drag-type="tab" data-drag-id="${esc(p.id)}" data-panel-id="${esc(p.id)}" title="${esc(p.title)}">
          <span class="mud-dock-tab__icon">${def?.icon ?? ''}</span><span class="mud-dock-tab__title">${esc(p.title)}</span>
          <button type="button" class="mud-dock-tab__close" data-dock-close="${esc(p.id)}" tabindex="-1" aria-label="${esc(t('dock.closeTab', { title: p.title }, 'Close {title}'))}">${ICON.close}</button>
        </div>`;
      }).join('');
      const actions = this._actionsHtml(g);
      view.actionsTop.innerHTML = actions;
      view.actionsHeader.innerHTML = actions;
    }

    syncChildren(view.body, g.panels.map((p) => this._panelHost(p, p.id === active?.id)));
    return view.el;
  }

  _panelHost(panel, visible) {
    let view = this._panels.get(panel.id);
    if (view && view.panel !== panel) {
      // Same id, new object (a loaded or reset layout): the old content would write to a stale panel.
      try { view.dispose?.(); } catch (e) { console.error('[MudDock] panel dispose failed', e); }
      view.el.remove();
      view = null;
    }
    if (!view) {
      const el = div('mud-dock-panel', { role: 'tabpanel' });
      el.dataset.panelId = panel.id;
      const def = this.model.getDefinition(panel.key);
      const ctx = {
        panel,
        dock: this,
        model: this.model,
        setState: (name, value) => { panel.state[name] = String(value); this._save(); },
      };
      let disposeContent = null;
      try {
        const out = def?.render?.(panel, ctx);
        if (typeof out === 'string') el.innerHTML = out;
        else if (out instanceof Node) el.appendChild(out);
        else if (out?.element instanceof Node) { el.appendChild(out.element); disposeContent = out.dispose ?? null; }
      } catch (e) {
        el.textContent = t('dock.renderError', { message: e?.message ?? e }, 'This panel failed to render: {message}');
        console.error('[MudDock] panel render failed', panel.key, e);
      }
      view = { el, panel, dispose: disposeContent };
      this._panels.set(panel.id, view);
    }
    view.el.hidden = !visible;
    return view.el;
  }

  // ───────────────────────── auto-hide strips + flyouts ─────────────────────────

  _createSide(side) {
    const el = div(`mud-dock-side mud-dock-side--${side}`);
    const strip = div('mud-dock-side__strip');
    el.append(strip);
    el.hidden = true;
    el.addEventListener('pointerenter', () => this._cancelClose());
    el.addEventListener('pointerleave', () => { if (this._flyout.groupId) this._scheduleClose(FLYOUT_CLOSE_MS); });
    return { el, strip };
  }

  _renderSide(side) {
    const m = this.model;
    const { el, strip } = this._sides[side];
    const groups = m.bar(side);
    el.hidden = groups.length === 0;

    strip.innerHTML = groups.map((g) => `<div class="mud-dock-side__group">${g.panels.map((p) => {
      const on = this._flyout.groupId === g.id && this._flyout.panelId === p.id;
      const def = m.getDefinition(p.key);
      return `<button type="button" class="mud-dock-side__tab${on ? ' is-active' : ''}" data-side-group="${esc(g.id)}" data-panel-id="${esc(p.id)}" title="${esc(p.title)}" aria-expanded="${on}">
        <span class="mud-dock-side__icon">${def?.icon ?? ''}</span>${esc(p.title)}</button>`;
    }).join('')}</div>`).join('');

    const flyouts = groups.map((g) => {
      let view = this._flyouts.get(g.id);
      if (!view) {
        const fel = div(`mud-dock-flyout mud-dock-flyout--${side}`, { role: 'dialog' });
        fel.dataset.flyoutId = g.id;
        const header = div('mud-dock-flyout__header');
        const body = div('mud-dock-group__body');
        const resizer = div('mud-dock-flyout__resizer', { title: t('dock.resize', {}, 'Drag to resize') });
        resizer.dataset.side = side;
        fel.append(header, body, resizer);
        view = { el: fel, header, body, signature: '' };
        this._flyouts.set(g.id, view);
      }
      view.el.className = `mud-dock-flyout mud-dock-flyout--${side}`;
      view.el.querySelector('.mud-dock-flyout__resizer').dataset.side = side;
      const open = this._flyout.groupId === g.id;
      view.el.classList.toggle('is-open', open);
      view.el.style.inlineSize = `${Math.round(g.flyoutWidth)}px`;
      const shownId = open ? this._flyout.panelId : m.activeOf(g)?.id;
      const current = g.panels.find((p) => p.id === shownId) ?? g.panels[0];
      const def = m.getDefinition(current.key);

      const signature = JSON.stringify([current.id, current.title]);
      if (signature !== view.signature) {
        view.signature = signature;
        view.header.innerHTML = `
          <span class="mud-dock-tab__icon">${def?.icon ?? ''}</span><span class="mud-dock-flyout__title">${esc(current.title)}</span>
          <button type="button" class="mud-dock-btn" data-dock-action="pin" data-group-id="${esc(g.id)}" data-panel-id="${esc(current.id)}" title="${esc(t('dock.pinHint', {}, 'Dock (pin) this window'))}" aria-label="${esc(t('dock.pin', {}, 'Dock this window'))}">${ICON.unpin}</button>
          <button type="button" class="mud-dock-btn" data-dock-close="${esc(current.id)}" title="${esc(t('common.close', {}, 'Close'))}" aria-label="${esc(t('dock.closeTab', { title: current.title }, 'Close {title}'))}">${ICON.close}</button>`;
      }
      syncChildren(view.body, g.panels.map((p) => this._panelHost(p, p.id === current.id)));
      return view.el;
    });
    syncChildren(el, [strip, ...flyouts]);
  }

  _openFlyout(groupId, panelId, autoCloseMs = 0) {
    this._cancelClose();
    if (this._flyout.groupId === groupId && this._flyout.panelId === panelId) return;
    this._flyout = { groupId, panelId };
    this._renderSide('left');
    this._renderSide('right');
    if (autoCloseMs) this._scheduleClose(autoCloseMs);
  }

  _cancelClose() { clearTimeout(this._closeTimer); this._closeTimer = 0; }

  _scheduleClose(ms) {
    this._cancelClose();
    this._closeTimer = setTimeout(() => {
      this._flyout = { groupId: null, panelId: null };
      this._renderSide('left');
      this._renderSide('right');
    }, ms);
  }

  // ───────────────────────── housekeeping ─────────────────────────

  _collectGarbage() {
    const m = this.model;
    const nodeIds = new Set([...m.walk()].map((n) => n.id));
    const groups = m.groups;
    const groupIds = new Set(groups.map((g) => g.id));
    const panelIds = new Set(groups.flatMap((g) => g.panels.map((p) => p.id)));

    for (const [id] of this._splits) if (!nodeIds.has(id)) this._splits.delete(id);
    for (const [id] of this._wrappers) if (!nodeIds.has(id)) this._wrappers.delete(id);
    for (const [id] of this._splitters) if (!nodeIds.has(id)) this._splitters.delete(id);
    for (const [id] of this._groups) if (!nodeIds.has(id)) this._groups.delete(id);
    for (const [id] of this._flyouts) if (!m.bar('left').concat(m.bar('right')).some((g) => g.id === id)) this._flyouts.delete(id);
    for (const [id] of this._folded) if (!groupIds.has(id)) this._folded.delete(id);
    for (const [id, view] of this._panels) {
      if (panelIds.has(id)) continue;
      try { view.dispose?.(); } catch (e) { console.error('[MudDock] panel dispose failed', e); }
      view.el.remove();
      this._panels.delete(id);
    }
  }

  _save() {
    if (!this.storageKey) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try { localStorage.setItem(this.storageKey, this.model.serialize()); } catch { /* private mode / quota */ }
    }, 150);
  }

  dispose() {
    this._offChange();
    this._offFlyout();
    this._unbind?.();
    this._closeMenu();
    this._cancelClose();
    clearTimeout(this._saveTimer);
    if (this.storageKey) { try { localStorage.setItem(this.storageKey, this.model.serialize()); } catch { /* ignore */ } }
    this._overlay?.remove();
    for (const view of this._panels.values()) { try { view.dispose?.(); } catch { /* ignore */ } }
    this._panels.clear();
    this.el.remove();
  }

  // ───────────────────────── events ─────────────────────────

  _bindEvents() {
    const host = this.el;
    const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); return () => target.removeEventListener(type, fn, opts); };
    const offs = [
      on(host, 'click', (e) => this._onClick(e)),
      on(host, 'mousedown', (e) => { // middle-click closes a tab
        const tab = e.button === 1 && e.target.closest('.mud-dock-tab');
        if (tab) { e.preventDefault(); this.model.close(tab.dataset.panelId); }
      }),
      on(host, 'dblclick', (e) => this._onDoubleClick(e)),
      on(host, 'contextmenu', (e) => {
        const header = e.target.closest('.mud-dock-group__header, .mud-dock-group__toolbar');
        if (!header) return;
        e.preventDefault();
        this._openMenu(header.closest('[data-group-id]').dataset.groupId, e.clientX, e.clientY);
      }),
      on(host, 'keydown', (e) => this._onTabKey(e)),
      on(host, 'pointerover', (e) => {
        const tab = e.pointerType === 'mouse' && e.target.closest('.mud-dock-side__tab');
        if (tab) this._openFlyout(tab.dataset.sideGroup, tab.dataset.panelId);
      }),
      on(host, 'pointerdown', (e) => this._onPointerDown(e)),
      on(host, 'dragstart', (e) => this._onDragStart(e)),
      on(document, 'dragover', (e) => this._onDragOver(e)),
      on(document, 'drop', (e) => this._onDrop(e)),
      on(document, 'dragend', () => { this._hideOverlay(); this._endDrag(); }),
      on(document, 'keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (this._menu) { this._closeMenu(true); return; }
        if (!this.model.maximizedId || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
        this.model.restore();
      }),
    ];
    this._unbind = () => offs.forEach((off) => off());
  }

  _onClick(e) {
    const m = this.model;
    const close = e.target.closest('[data-dock-close]');
    if (close) { m.close(close.dataset.dockClose); return; }

    const action = e.target.closest('[data-dock-action]');
    if (action) {
      const groupId = action.dataset.groupId ?? action.closest('[data-group-id]')?.dataset.groupId;
      switch (action.dataset.dockAction) {
        case 'maximize': m.toggleMaximize(groupId); break;
        case 'autohide': m.autoHide(groupId); break;
        case 'add-right': m.addBlock(groupId, DropZone.Right); break;
        case 'add-below': m.addBlock(groupId, DropZone.Bottom); break;
        case 'pin': this._flyout = { groupId: null, panelId: null }; m.pin(groupId, action.dataset.panelId); break;
        case 'reset': m.resetLayout(); break;
        case 'menu': {
          const r = action.getBoundingClientRect();
          this._openMenu(groupId, r.right, r.bottom + 4, action);
          break;
        }
        default: break;
      }
      return;
    }

    const tab = e.target.closest('.mud-dock-tab');
    if (tab) { m.activate(tab.closest('[data-group-id]').dataset.groupId, tab.dataset.panelId); return; }

    const sideTab = e.target.closest('.mud-dock-side__tab');
    if (sideTab) this._openFlyout(sideTab.dataset.sideGroup, sideTab.dataset.panelId);
  }

  _onDoubleClick(e) {
    const sp = e.target.closest('.mud-dock-splitter');
    if (sp) {
      const prev = sp.previousElementSibling;
      const next = sp.nextElementSibling;
      if (!prev || !next) return;
      const avg = (flexGrow(prev) + flexGrow(next)) / 2;
      prev.style.flexGrow = avg;
      next.style.flexGrow = avg;
      this._commitSplit(sp.parentElement);
      return;
    }
    const tabs = e.target.closest('.mud-dock-tabs');
    if (tabs && !e.target.closest('.mud-dock-tab__close')) this.model.toggleMaximize(tabs.closest('[data-group-id]').dataset.groupId);
  }

  /** Arrow keys move between tabs (mirrored in RTL), Home / End jump, Delete closes. */
  _onTabKey(e) {
    const tab = e.target.closest?.('.mud-dock-tab');
    if (!tab) return;
    const groupId = tab.closest('[data-group-id]').dataset.groupId;
    const tabs = [...tab.parentElement.children];
    const i = tabs.indexOf(tab);
    const rtl = isRtl(this.el);
    let next = -1;
    if (e.key === 'ArrowRight') next = rtl ? i - 1 : i + 1;
    else if (e.key === 'ArrowLeft') next = rtl ? i + 1 : i - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else if (e.key === 'Delete') { e.preventDefault(); this.model.close(tab.dataset.panelId); return; }
    else return;
    e.preventDefault();
    next = (next + tabs.length) % tabs.length;
    const id = tabs[next].dataset.panelId;
    this.model.activate(groupId, id);
    this._groups.get(groupId)?.tabs.querySelector(`[data-panel-id="${CSS.escape(id)}"]`)?.focus();
  }

  // ───────────────────────── splitters & flyout width ─────────────────────────

  _onPointerDown(e) {
    if (e.button !== 0) return;
    const sp = e.target.closest('.mud-dock-splitter');
    if (sp) { this._dragSplitter(e, sp); return; }
    const rz = e.target.closest('.mud-dock-flyout__resizer');
    if (rz) { this._dragFlyout(e, rz); return; }
    // Fingers and pens get their own drag gesture: native HTML drag & drop only works with a mouse.
    const source = e.pointerType !== 'mouse' && !e.target.closest('button') && e.target.closest('[data-drag-type]');
    if (source && this.el.contains(source)) this._pointerDrag(e, source);
  }

  /** Touch / pen docking: same hit-testing and overlay as the mouse, plus a label that follows the finger. */
  _pointerDrag(e, source) {
    const groupEl = source.closest('[data-group-id]');
    const info = {
      type: source.dataset.dragType,
      id: source.dataset.dragId,
      groupId: groupEl?.dataset.groupId ?? null,
      count: groupEl ? groupEl.querySelectorAll('.mud-dock-tab').length : 0,
    };
    const label = info.type === 'tab'
      ? source.querySelector('.mud-dock-tab__title')?.textContent
      : t('dock.tabs', { count: info.count }, { one: '{count} tab', other: '{count} tabs' });
    const sx = e.clientX;
    const sy = e.clientY;
    let ghost = null;
    this._pointerPending = true;

    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return; // still a tap
        this._drag = info;
        ghost = div('mud-dock-ghost');
        ghost.textContent = label ?? '';
        document.body.appendChild(ghost);
        document.body.classList.add('mud-dock-dragging');
        (info.type === 'group' ? groupEl : source)?.classList.add('is-dragging');
      }
      ev.preventDefault();
      ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
      const t = this._resolveTarget({ clientX: ev.clientX, clientY: ev.clientY, target: document.elementFromPoint(ev.clientX, ev.clientY) });
      if (t) { this._target = t; this._showOverlay(t.rect); } else this._hideOverlay();
    };
    const end = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      this._pointerPending = false;
      if (!ghost) return; // a tap: the click handler activates the tab
      ghost.remove();
      const t = ev.type === 'pointerup' ? this._target : null;
      this._hideOverlay();
      this._endDrag();
      if (t) this.model.moveTo(info.type, info.id, t.targetId, t.zone, t.index);
    };
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  }

  _dragSplitter(e, sp) {
    const split = sp.parentElement;
    const prev = sp.previousElementSibling;
    const next = sp.nextElementSibling;
    if (!prev || !next) return;
    e.preventDefault();

    const row = split.dataset.dir === 'row';
    const flip = row && isRtl(this.el) ? -1 : 1; // in RTL the first pane of a row is on the right
    const size = (el) => (row ? el.getBoundingClientRect().width : el.getBoundingClientRect().height);
    const start = row ? e.clientX : e.clientY;
    const a0 = size(prev);
    const b0 = size(next);
    const wa0 = flexGrow(prev);
    const wb0 = flexGrow(next);
    const lo = Math.min(64, (a0 + b0) / 2); // smallest a pane may become (px)
    const cls = row ? 'mud-dock-resizing-row' : 'mud-dock-resizing-col';

    sp.setPointerCapture(e.pointerId);
    sp.classList.add('is-active');
    document.body.classList.add(cls);

    const move = (ev) => {
      const delta = ((row ? ev.clientX : ev.clientY) - start) * flip;
      const a = Math.min(Math.max(a0 + delta, lo), a0 + b0 - lo);
      const wa = ((wa0 + wb0) * a) / (a0 + b0);
      prev.style.flexGrow = wa; // live, without touching the model
      next.style.flexGrow = wa0 + wb0 - wa;
    };
    const up = () => {
      sp.removeEventListener('pointermove', move);
      sp.removeEventListener('pointerup', up);
      sp.removeEventListener('pointercancel', up);
      sp.classList.remove('is-active');
      document.body.classList.remove(cls);
      this._commitSplit(split); // the model learns the final sizes once
    };
    sp.addEventListener('pointermove', move);
    sp.addEventListener('pointerup', up);
    sp.addEventListener('pointercancel', up);
  }

  _commitSplit(split) {
    const weights = [...split.children].filter((c) => c.classList.contains('mud-dock-node')).map((c) => Math.round(flexGrow(c) * 10000) / 10000);
    this.model.resize(split.dataset.nodeId, weights);
  }

  _dragFlyout(e, rz) {
    const fly = rz.parentElement;
    // A start-side flyout grows towards the inline end: rightwards in LTR, leftwards in RTL.
    const grows = (rz.dataset.side === 'left') !== isRtl(this.el) ? 1 : -1;
    const start = e.clientX;
    const w0 = fly.getBoundingClientRect().width;
    const max = Math.max(240, this._main.getBoundingClientRect().width - 40);
    e.preventDefault();
    rz.setPointerCapture(e.pointerId); // keeps the flyout open even if the pointer leaves it
    rz.classList.add('is-active');
    document.body.classList.add('mud-dock-resizing-row');

    const move = (ev) => {
      fly.style.inlineSize = `${Math.min(Math.max(w0 + (ev.clientX - start) * grows, 180), max)}px`;
    };
    const up = () => {
      rz.removeEventListener('pointermove', move);
      rz.removeEventListener('pointerup', up);
      rz.removeEventListener('pointercancel', up);
      rz.classList.remove('is-active');
      document.body.classList.remove('mud-dock-resizing-row');
      this.model.setFlyoutWidth(fly.dataset.flyoutId, Math.round(fly.getBoundingClientRect().width));
    };
    rz.addEventListener('pointermove', move);
    rz.addEventListener('pointerup', up);
    rz.addEventListener('pointercancel', up);
  }

  // ───────────────────────── drag & drop docking ─────────────────────────

  _onDragStart(e) {
    const el = e.target.closest?.('[data-drag-type]');
    if (!el || !this.el.contains(el)) return;
    if (this._pointerPending) { e.preventDefault(); return; } // a touch long-press must not start a second, native drag
    const groupEl = el.closest('[data-group-id]');
    this._drag = {
      type: el.dataset.dragType,
      id: el.dataset.dragId,
      groupId: groupEl?.dataset.groupId ?? null,
      count: groupEl ? groupEl.querySelectorAll('.mud-dock-tab').length : 0,
    };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this._drag.id); // Firefox needs data to start a drag
    if (this._drag.type === 'group' && groupEl) {
      e.dataTransfer.setDragImage(groupEl.querySelector('.mud-dock-group__header'), 24, 14);
    }
    document.body.classList.add('mud-dock-dragging');
    requestAnimationFrame(() => {
      if (!this._drag) return;
      if (this._drag.type === 'group') groupEl?.classList.add('is-dragging');
      else el.classList.add('is-dragging');
    });
  }

  _onDragOver(e) {
    if (!this._drag) return;
    const t = this._resolveTarget(e);
    if (t) {
      e.preventDefault(); // marks this spot as a valid drop target
      e.dataTransfer.dropEffect = 'move';
      this._target = t;
      this._showOverlay(t.rect);
    } else {
      this._hideOverlay();
    }
  }

  _onDrop(e) {
    if (!this._drag || !this._target) return;
    e.preventDefault();
    const d = this._drag;
    const t = this._target;
    this._hideOverlay();
    this._endDrag();
    this.model.moveTo(d.type, d.id, t.targetId, t.zone, t.index);
  }

  _endDrag() {
    this._drag = null;
    document.body.classList.remove('mud-dock-dragging');
    this.el.querySelectorAll('.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
  }

  _showOverlay(r) {
    if (!this._overlay) {
      this._overlay = div('mud-dock-overlay');
      document.body.appendChild(this._overlay);
    }
    Object.assign(this._overlay.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  }

  _hideOverlay() {
    if (this._overlay) this._overlay.style.display = 'none';
    this._target = null;
  }

  /**
   * Where a drop at the pointer would land: the workspace edge, a tab strip slot, or the centre / an edge of a block.
   * Hit-testing is physical (screen sides); the model's Left / Right mean start / end, so they swap in RTL.
   */
  _resolveTarget(e) {
    const x = e.clientX;
    const y = e.clientY;
    const rtl = isRtl(this.el);
    const logical = (zone) => (rtl && zone === 'Left' ? DropZone.Right : rtl && zone === 'Right' ? DropZone.Left : zone);

    const main = this._main.getBoundingClientRect();
    if (x >= main.left && x <= main.right && y >= main.top && y <= main.bottom) {
      let edge = null;
      if (x - main.left < EDGE_PX) edge = 'Left';
      else if (main.right - x < EDGE_PX) edge = 'Right';
      else if (y - main.top < EDGE_TOP_PX) edge = 'Top';
      else if (main.bottom - y < EDGE_PX) edge = 'Bottom';
      if (edge) return { targetId: 'root', zone: logical(edge), index: -1, rect: part(rectOf(this._main), edge, 0.25) };
    }

    const groupEl = e.target.closest?.('.mud-dock__main [data-group-id]');
    if (!groupEl || !this.el.contains(groupEl)) return null;
    const gid = groupEl.dataset.groupId;
    if (this._drag.type === 'group' && this._drag.id === gid) return null; // a block onto itself

    // Over the tab strip: insert / re-order among the tabs.
    const header = groupEl.querySelector('.mud-dock-group__header');
    const hr = header.getBoundingClientRect();
    if (y >= hr.top && y <= hr.bottom) {
      const tabs = [...header.querySelectorAll('.mud-dock-tab')];
      let index = tabs.length;
      const last = tabs[tabs.length - 1]?.getBoundingClientRect();
      let barX = last ? (rtl ? last.left : last.right) : (rtl ? hr.right - 4 : hr.left + 4);
      for (let i = 0; i < tabs.length; i++) {
        const tr = tabs[i].getBoundingClientRect();
        const beforeThis = rtl ? x > tr.right - tr.width / 2 : x < tr.left + tr.width / 2;
        if (beforeThis) { index = i; barX = rtl ? tr.right : tr.left; break; }
      }
      return { targetId: gid, zone: DropZone.Tabs, index, rect: { left: barX - 2, top: hr.top + 3, width: 4, height: hr.height - 6 } };
    }

    // Over the content: the centre merges as tabs, an edge splits the block.
    const body = groupEl.querySelector('.mud-dock-group__body');
    const zone = edgeZone(x, y, rectOf(body), ZONE);
    const ownGroup = this._drag.type === 'tab' && this._drag.groupId === gid;
    if (ownGroup && (zone === 'Center' || this._drag.count === 1)) return null; // nothing sensible to do
    const full = rectOf(groupEl);
    return { targetId: gid, zone: logical(zone), index: -1, rect: zone === 'Center' ? full : part(full, zone, 0.5) };
  }

  // ───────────────────────── block menu ─────────────────────────

  _openMenu(groupId, x, y, returnFocus = null) {
    const m = this.model;
    const g = m.findGroup(groupId);
    if (!g) return;
    this._closeMenu();
    const folded = this._folded.get(groupId) ?? new Set();
    this._folded.set(groupId, folded);
    const isMax = m.maximizedId === groupId;

    const section = (id, title, items) => {
      const open = !folded.has(id);
      return `<button type="button" class="mud-dock-menu__fold" data-menu-fold="${id}" aria-expanded="${open}">
          <span class="mud-dock-menu__caret" aria-hidden="true"></span>${title}</button>
        ${open ? items : ''}`;
    };
    const item = (cmd, label, icon = '', extra = '') =>
      `<button type="button" role="menuitem" class="mud-dock-menu__item ${extra}" data-menu-cmd="${cmd}"><span class="mud-dock-menu__icon" aria-hidden="true">${icon}</span>${label}</button>`;

    const html = [
      section('add', esc(t('dock.menu.add', {}, 'Add to this block')), m.definitions.map((d) => item(`add:${esc(d.key)}`, `${esc(d.title)}${d.allowMultiple ? esc(t('dock.menu.new', {}, ' (new)')) : ''}`, d.icon)).join('')),
      '<div class="mud-dock-menu__sep" role="separator"></div>',
      section('new', esc(t('dock.menu.newBlock', {}, 'New block')),
        item('block:Left', esc(t('dock.menu.left', {}, 'Add to the left')), '◧') + item('block:Right', esc(t('dock.menu.right', {}, 'Add to the right')), '◨')
        + item('block:Top', esc(t('dock.menu.above', {}, 'Add above')), '⬒') + item('block:Bottom', esc(t('dock.menu.below', {}, 'Add below')), '⬓')),
      '<div class="mud-dock-menu__sep" role="separator"></div>',
      item('tabs', esc(g.tabsAtBottom ? t('dock.menu.tabsTop', {}, 'Tabs on top') : t('dock.menu.tabsBottom', {}, 'Tabs at the bottom')), '⇅'),
      m.canMaximize(g) ? item('max', esc(isMax ? t('dock.restore', {}, 'Restore') : t('dock.maximize', {}, 'Maximize')), isMax ? ICON.restore : ICON.maximize) : '',
      m.canAutoHide(g) ? item('autohide', esc(t('dock.autoHide', {}, 'Auto hide')), ICON.pin) : '',
      item('close', esc(t('dock.menu.close', {}, 'Close this block')), ICON.close, 'is-danger'),
    ].join('');

    const backdrop = div('mud-dock-menu-backdrop');
    const menu = div('mud-dock-menu', { role: 'menu' });
    menu.innerHTML = html;
    document.body.append(backdrop, menu);

    // Keep the menu on screen, opening towards the inline start of the button.
    const mr = menu.getBoundingClientRect();
    const left = isRtl(this.el) ? x - 24 : x - mr.width;
    menu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - mr.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - mr.height - 8))}px`;

    const run = (cmd) => {
      this._closeMenu();
      const [name, arg] = cmd.split(':');
      if (name === 'add') m.addPanel(arg, groupId);
      else if (name === 'block') m.addBlock(groupId, DropZone[arg]);
      else if (name === 'tabs') m.toggleTabsPosition(groupId);
      else if (name === 'max') m.toggleMaximize(groupId);
      else if (name === 'autohide') m.autoHide(groupId);
      else if (name === 'close') m.closeGroup(groupId);
    };
    menu.addEventListener('click', (e) => {
      const fold = e.target.closest('[data-menu-fold]');
      if (fold) {
        const id = fold.dataset.menuFold;
        if (!folded.delete(id)) folded.add(id);
        const r = menu.getBoundingClientRect();
        this._openMenu(groupId, isRtl(this.el) ? r.left + 24 : r.right, r.top, returnFocus);
        this._menu?.menu.querySelector(`[data-menu-fold="${id}"]`)?.focus();
        return;
      }
      const cmd = e.target.closest('[data-menu-cmd]');
      if (cmd) run(cmd.dataset.menuCmd);
    });
    menu.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = [...menu.querySelectorAll('button')];
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    });
    backdrop.addEventListener('click', () => this._closeMenu(true));
    backdrop.addEventListener('contextmenu', (e) => { e.preventDefault(); this._closeMenu(true); });

    this._menu = { menu, backdrop, returnFocus };
    menu.querySelector('button')?.focus({ preventScroll: true });
  }

  _closeMenu(restoreFocus = false) {
    if (!this._menu) return;
    const { menu, backdrop, returnFocus } = this._menu;
    menu.remove();
    backdrop.remove();
    this._menu = null;
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
}

// ───────────────────────── geometry helpers ─────────────────────────

function flexGrow(el) {
  return parseFloat(getComputedStyle(el).flexGrow) || 1;
}

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function part(r, zone, f) {
  switch (zone) {
    case 'Left': return { left: r.left, top: r.top, width: r.width * f, height: r.height };
    case 'Right': return { left: r.left + r.width * (1 - f), top: r.top, width: r.width * f, height: r.height };
    case 'Top': return { left: r.left, top: r.top, width: r.width, height: r.height * f };
    case 'Bottom': return { left: r.left, top: r.top + r.height * (1 - f), width: r.width, height: r.height * f };
    default: return r;
  }
}

/** Nearest edge if the pointer is within `threshold` of it, otherwise the centre. */
function edgeZone(x, y, r, threshold) {
  const fx = (x - r.left) / r.width;
  const fy = (y - r.top) / r.height;
  const d = { Left: fx, Right: 1 - fx, Top: fy, Bottom: 1 - fy };
  let best = 'Center';
  let min = threshold;
  for (const k of Object.keys(d)) if (d[k] < min) { min = d[k]; best = k; }
  return best;
}
