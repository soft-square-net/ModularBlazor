// MudDataTable: a data table with global search, column filters, multi-column sorting, paging and selection,
// over data in the browser (client mode) or from an API (server mode).
//
//   new MudDataTable({ columns, data })                                   client mode
//   new MudDataTable({ columns, server: { url: '/api/v1/articles' } })    server mode: GET ?Keyword=…&Filters=…
//   new MudDataTable({ columns, server: { fetch: (query, signal) => … } })  server mode, your own request
//
// Both modes use the same query (see query.js). In server mode it is sent the way the .NET API binds
// [AsParameters] PaginationFilter, and the endpoint answers with PagedResponse<T> from an Ardalis specification
// (Query.SearchBy(filter) applies the keyword and the column filters, Query.PaginateBy(filter) orders and pages).

import {
  createQuery, applyQuery, toPaginationFilterParams, fromPagedResponse, getValue, OPERATORS, OPERATORS_BY_TYPE,
} from './query.js';
import { getIconSvg } from '../core/icons.js';
import { t, formatNumber, intlLocale } from '../core/i18n.js';

/** The translated name of a filter operator. */
const opLabel = (op) => t(`datatable.op.${op}`, {}, OPERATORS[op].label);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let uid = 0;

const PRESETS = {
  number: (v, l) => new Intl.NumberFormat(l).format(v),
  integer: (v, l) => new Intl.NumberFormat(l, { maximumFractionDigits: 0 }).format(v),
  percent: (v, l) => new Intl.NumberFormat(l, { style: 'percent', maximumFractionDigits: 1 }).format(v),
  date: (v, l) => new Intl.DateTimeFormat(l, { dateStyle: 'medium' }).format(new Date(v)),
  datetime: (v, l) => new Intl.DateTimeFormat(l, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)),
  boolean: (v) => (v === true || v === 'true' ? t('common.yes', {}, 'Yes') : t('common.no', {}, 'No')),
};

function normalizeColumn(c) {
  const type = c.type ?? 'string';
  const options = (c.options ?? []).map((o) => (typeof o === 'object' ? { value: String(o.value), label: o.label ?? String(o.value) } : { value: String(o), label: String(o) }));
  return {
    key: c.key,
    field: c.field ?? c.key, // the name sent to the server (its property name)
    title: c.title ?? c.key,
    type,
    sortable: c.sortable ?? true,
    filterable: c.filterable ?? true,
    searchable: c.searchable ?? type === 'string',
    align: c.align ?? (type === 'number' ? 'end' : 'start'),
    width: c.width ?? null,
    format: c.format ?? null,
    render: c.render ?? null,
    options,
  };
}

export class MudDataTable {
  /**
   * @param {object} o
   * @param {Array} o.columns  [{ key, title?, type?: 'string'|'number'|'date'|'boolean'|'enum', field?, sortable?, filterable?,
   *                            searchable?, align?, width?, format?: fn | 'number'|'integer'|'currency:EUR'|'percent'|'date'|'datetime'|'boolean',
   *                            render?: (value, row) => trusted HTML string | Node, options?: enum values }]
   * @param {Array} [o.data]   rows (client mode)
   * @param {object} [o.server] { url?, fetch?(query, signal) → Promise<{items,totalCount}|PagedResponse>, headers?, credentials?, mapResponse?, debounce? }
   */
  constructor(o = {}) {
    this.columns = (o.columns ?? []).map(normalizeColumn);
    this.server = o.server ?? null;
    this.rows = o.data ?? [];
    this.rowKey = o.rowKey ?? 'id';
    this.selection = o.selection ?? 'none'; // none | single | multiple
    this.pageSizes = o.pageSizes ?? [10, 25, 50, 100];
    this.caption = o.caption ?? t('datatable.caption', {}, 'Data');
    this.emptyText = o.emptyText ?? null; // null: the translated default
    this.onRowClick = o.onRowClick ?? null;
    this.onSelectionChange = o.onSelectionChange ?? null;
    this.onQuery = o.onQuery ?? null;
    this.query = createQuery({ pageSize: o.pageSize ?? this.pageSizes[0], ...(o.initialQuery ?? {}) });
    this.filterState = new Map(); // field -> { op, value }
    for (const f of this.query.filters) this.filterState.set(f.field, { op: f.op, value: f.value ?? '' });
    this.selected = new Map(); // key -> row
    this.state = { items: [], totalCount: 0, loading: false, error: null };
    this.id = `mud-dt-${++uid}`;
    this._requestId = 0;
    this._abort = null;
    this._timers = new Set();

    this._build(o);
    this.refresh();
  }

  // ───────────────────────── public API ─────────────────────────

  getElement() { return this.el; }
  getQuery() { return createQuery(this.query); }
  getSelection() { return [...this.selected.keys()]; }
  getSelectedRows() { return [...this.selected.values()]; }

  /** Replaces the rows (client mode) and redraws. */
  setData(rows) {
    this.rows = rows ?? [];
    this.refresh();
  }

  /** Changes the query (keyword, filters, orderBy, pageNumber, pageSize) and reloads. */
  setQuery(partial) {
    this.query = createQuery({ ...this.query, ...partial });
    if (partial.filters) {
      this.filterState.clear();
      for (const f of this.query.filters) this.filterState.set(f.field, { op: f.op, value: f.value ?? '' });
    }
    this._syncControls();
    this.refresh();
  }

  /** Fetches (server) or re-evaluates (client) the current page. */
  reload() { this.refresh(); }

  clearSelection() {
    this.selected.clear();
    this._renderBody();
    this._emitSelection();
  }

  dispose() {
    this._abort?.abort();
    this._timers.forEach(clearTimeout);
    this._timers.clear();
    this.el.remove();
  }

  // ───────────────────────── data ─────────────────────────

  refresh() {
    this.onQuery?.(this.getQuery());
    if (!this.server) {
      const result = applyQuery(this.rows, this.columns, this.query);
      if (this._clampPage(result.totalCount)) return;
      this.state = { items: result.items, totalCount: result.totalCount, loading: false, error: null };
      this._render();
      return;
    }

    this._abort?.abort();
    const abort = (this._abort = new AbortController());
    const id = ++this._requestId;
    this.state = { ...this.state, loading: true, error: null };
    this._render();

    Promise.resolve()
      .then(() => this._fetch(this.getQuery(), abort.signal))
      .then((json) => {
        if (id !== this._requestId) return; // a newer request owns the table
        const { items, totalCount } = (this.server.mapResponse ?? fromPagedResponse)(json);
        if (this._clampPage(totalCount)) return;
        this.state = { items, totalCount, loading: false, error: null };
        this._render();
      })
      .catch((e) => {
        if (id !== this._requestId || e?.name === 'AbortError') return;
        this.state = { ...this.state, loading: false, error: e?.message || t('datatable.loadError', {}, 'The data could not be loaded.') };
        this._render();
      });
  }

  async _fetch(query, signal) {
    if (typeof this.server.fetch === 'function') return this.server.fetch(query, signal);
    const url = `${this.server.url}${this.server.url.includes('?') ? '&' : '?'}${toPaginationFilterParams(query)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', ...(this.server.headers ?? {}) },
      credentials: this.server.credentials ?? 'same-origin',
      signal,
    });
    if (!res.ok) throw new Error(t('datatable.httpError', { status: res.status, text: res.statusText }, 'The server answered {status} {text}').trim());
    return res.json();
  }

  /** After filtering, a page past the end moves back to the last page. Returns true when it reloads. */
  _clampPage(total) {
    const last = Math.max(1, Math.ceil(total / this.query.pageSize));
    if (this.query.pageNumber <= last) return false;
    this.query.pageNumber = last;
    this.refresh();
    return true;
  }

  _later(key, ms, fn) {
    clearTimeout(this[key]);
    this._timers.delete(this[key]);
    this[key] = setTimeout(() => { this._timers.delete(this[key]); fn(); }, ms);
    this._timers.add(this[key]);
  }

  // ───────────────────────── building ─────────────────────────

  _build(o) {
    const el = document.createElement('div');
    el.className = `mud-datatable${o.dense ? ' mud-datatable--dense' : ''}${o.striped ? ' mud-datatable--striped' : ''}${o.stackOnMobile === false ? '' : ' mud-datatable--stack'}`;
    const filterable = this.columns.filter((c) => c.filterable);
    el.innerHTML = `
      <div class="mud-datatable__toolbar">
        <div class="mud-input-wrapper mud-input-wrapper--dense mud-datatable__search">
          <span class="mud-input-adornment-start" aria-hidden="true">${getIconSvg('search', 16)}</span>
          <input type="search" class="mud-input-slot" placeholder="${esc(o.searchPlaceholder ?? t('datatable.search', {}, 'Search…'))}" aria-label="${esc(t('datatable.searchLabel', { caption: this.caption }, 'Search {caption}'))}" aria-controls="${this.id}-table">
        </div>
        ${filterable.length ? `<button type="button" class="mud-button-root mud-button-outlined mud-button-surface mud-button-small mud-datatable__filters-btn" aria-expanded="false" aria-controls="${this.id}-filters">
          ${getIconSvg('sliders', 16)} ${esc(t('datatable.filters', {}, 'Filters'))} <span class="mud-datatable__count" hidden></span></button>` : ''}
      </div>
      <div class="mud-datatable__filters" id="${this.id}-filters" hidden>
        <div class="mud-datatable__filter-grid">${filterable.map((c) => this._filterField(c)).join('')}</div>
        <button type="button" class="mud-button-root mud-button-text mud-button-primary mud-button-small" data-dt="clear-filters">${esc(t('datatable.clearAll', {}, 'Clear all filters'))}</button>
      </div>
      <div class="mud-datatable__chips" role="list" aria-label="${esc(t('datatable.activeFilters', {}, 'Active filters'))}"></div>
      <div class="mud-datatable__scroll">
        <div class="mud-datatable__progress" aria-hidden="true"></div>
        <table class="mud-datatable__table" id="${this.id}-table">
          <caption class="mud-datatable__caption">${esc(this.caption)}</caption>
          <thead><tr>${this._headerCells()}</tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="mud-datatable__footer">
        <span class="mud-datatable__summary" role="status" aria-live="polite"></span>
        <label class="mud-datatable__size">${esc(t('datatable.rowsPerPage', {}, 'Rows per page'))}
          <span class="mud-input-wrapper mud-input-wrapper--select mud-input-wrapper--dense">
            <select class="mud-input-slot">${this.pageSizes.map((n) => `<option value="${n}" ${n === this.query.pageSize ? 'selected' : ''}>${n}</option>`).join('')}</select>
          </span>
        </label>
        <nav class="mud-datatable__pager" aria-label="${esc(t('datatable.pages', {}, 'Pages'))}"></nav>
      </div>`;
    this.el = el;
    this.$ = {
      search: el.querySelector('.mud-datatable__search input'),
      filtersBtn: el.querySelector('.mud-datatable__filters-btn'),
      count: el.querySelector('.mud-datatable__count'),
      filters: el.querySelector('.mud-datatable__filters'),
      chips: el.querySelector('.mud-datatable__chips'),
      table: el.querySelector('table'),
      thead: el.querySelector('thead tr'),
      tbody: el.querySelector('tbody'),
      summary: el.querySelector('.mud-datatable__summary'),
      size: el.querySelector('.mud-datatable__size select'),
      pager: el.querySelector('.mud-datatable__pager'),
    };
    this.$.search.value = this.query.keyword;
    this._syncControls();
    this._bind();
  }

  _headerCells() {
    let html = '';
    if (this.selection === 'multiple') html += '<th scope="col" class="mud-datatable__select"><input type="checkbox" data-dt="select-page" aria-label="' + esc(t('datatable.selectPage', {}, 'Select all rows on this page')) + '"></th>';
    else if (this.selection === 'single') html += '<th scope="col" class="mud-datatable__select"><span class="mud-sr-only">' + esc(t('datatable.select', {}, 'Select')) + '</span></th>';
    for (const c of this.columns) {
      const style = c.width ? ` style="inline-size:${esc(c.width)}"` : '';
      html += `<th scope="col" data-field="${esc(c.field)}" data-align="${c.align}"${style}>${c.sortable
        ? `<button type="button" class="mud-datatable__sort" data-dt="sort" data-field="${esc(c.field)}">${esc(c.title)}<span class="mud-datatable__sort-icon" aria-hidden="true"></span><span class="mud-datatable__sort-rank" aria-hidden="true"></span></button>`
        : esc(c.title)}</th>`;
    }
    return html;
  }

  _filterField(c) {
    const id = `${this.id}-f-${c.key}`;
    const label = `<label class="mud-input-label" for="${id}">${esc(c.title)}</label>`;
    if (c.type === 'boolean' || c.type === 'enum') {
      const opts = c.type === 'boolean' ? [{ value: 'true', label: t('common.yes', {}, 'Yes') }, { value: 'false', label: t('common.no', {}, 'No') }] : c.options;
      return `<div class="mud-datatable__filter" data-field="${esc(c.field)}">${label}
        <div class="mud-input-wrapper mud-input-wrapper--select mud-input-wrapper--dense">
          <select id="${id}" class="mud-input-slot" data-dt="filter-value"><option value="">${esc(t('datatable.any', {}, 'Any'))}</option>${opts.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>
        </div></div>`;
    }
    const ops = OPERATORS_BY_TYPE[c.type] ?? OPERATORS_BY_TYPE.string;
    const inputType = c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text';
    return `<div class="mud-datatable__filter" data-field="${esc(c.field)}">${label}
      <div class="mud-input-group">
        <span class="mud-input-wrapper mud-input-wrapper--select mud-input-wrapper--dense mud-datatable__op">
          <select class="mud-input-slot" data-dt="filter-op" aria-label="${esc(t('datatable.condition', { column: c.title }, '{column} condition'))}">${ops.map((op) => `<option value="${op}">${esc(opLabel(op))}</option>`).join('')}</select>
        </span>
        <span class="mud-input-wrapper mud-input-wrapper--dense"><input id="${id}" type="${inputType}" class="mud-input-slot" data-dt="filter-value" ${c.type === 'number' ? 'step="any"' : ''}></span>
      </div></div>`;
  }

  // ───────────────────────── events ─────────────────────────

  _bind() {
    const el = this.el;
    el.addEventListener('input', (e) => {
      if (e.target === this.$.search) {
        this._later('_searchTimer', this.server ? this.server.debounce ?? 300 : 150, () => {
          this.query.keyword = this.$.search.value;
          this.query.pageNumber = 1;
          this.refresh();
        });
      } else if (e.target.matches('input[data-dt="filter-value"]')) {
        this._later('_filterTimer', this.server ? this.server.debounce ?? 300 : 150, () => this._readFilter(e.target));
      }
    });

    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t === this.$.size) {
        this.query.pageSize = Number(t.value);
        this.query.pageNumber = 1;
        this.refresh();
      } else if (t.matches('select[data-dt="filter-value"], select[data-dt="filter-op"]')) {
        this._readFilter(t);
      } else if (t.matches('input[data-dt="filter-value"]')) {
        clearTimeout(this._filterTimer);
        this._readFilter(t);
      } else if (t.matches('[data-dt="select-row"]')) {
        this._toggleRow(t.closest('tr').dataset.key, t.checked);
      } else if (t.matches('[data-dt="select-page"]')) {
        this.state.items.forEach((row) => { const k = this._keyOf(row); if (t.checked) this.selected.set(k, row); else this.selected.delete(k); });
        this._renderBody();
        this._emitSelection();
      }
    });

    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-dt]');
      const action = t?.dataset.dt;
      if (action === 'sort') this._sort(t.dataset.field, e.shiftKey);
      else if (action === 'page') this._goTo(Number(t.dataset.page));
      else if (action === 'clear-filters') this._clearFilters();
      else if (action === 'remove-filter') this._removeFilter(t.dataset.field);
      else if (action === 'retry') this.refresh();
      else if (t === this.$.filtersBtn || e.target.closest('.mud-datatable__filters-btn')) this._toggleFilters();
      else if (this.onRowClick || this.selection === 'single') {
        const tr = e.target.closest('tbody tr[data-key]');
        if (tr && !e.target.closest('input, button, a, select, label')) this._activateRow(tr);
      }
    });

    el.addEventListener('keydown', (e) => {
      const tr = e.target.closest?.('tbody tr[data-key]');
      if (tr && e.target === tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this._activateRow(tr); }
    });
  }

  _keyOf(row) { return String(getValue(row, this.rowKey)); }

  _activateRow(tr) {
    const row = this.state.items.find((r) => this._keyOf(r) === tr.dataset.key);
    if (!row) return;
    if (this.selection === 'single') {
      const already = this.selected.has(tr.dataset.key);
      this.selected.clear();
      if (!already) this.selected.set(tr.dataset.key, row);
      this._renderBody();
      this._emitSelection();
    }
    this.onRowClick?.(row);
  }

  _toggleRow(key, on) {
    const row = this.state.items.find((r) => this._keyOf(r) === key);
    if (on && row) this.selected.set(key, row); else this.selected.delete(key);
    this._renderBody();
    this._emitSelection();
  }

  _emitSelection() {
    this._renderFooter(); // the summary shows how many rows are selected
    this.onSelectionChange?.(this.getSelection(), this.getSelectedRows());
  }

  _toggleFilters(force) {
    const open = force ?? this.$.filters.hidden;
    this.$.filters.hidden = !open;
    this.$.filtersBtn?.setAttribute('aria-expanded', String(open));
    if (open) this.$.filters.querySelector('select, input')?.focus();
  }

  /** Reads one column's filter controls into filterState and rebuilds query.filters. */
  _readFilter(control) {
    const box = control.closest('.mud-datatable__filter');
    const field = box.dataset.field;
    const value = box.querySelector('[data-dt="filter-value"]').value;
    const opEl = box.querySelector('[data-dt="filter-op"]');
    const op = opEl ? opEl.value : 'eq';
    const valueEl = box.querySelector('input[data-dt="filter-value"]');
    if (valueEl) valueEl.disabled = op === 'isnull' || op === 'notnull';
    if ((op === 'isnull' || op === 'notnull') || value !== '') this.filterState.set(field, { op, value: op.endsWith('null') ? '' : value });
    else this.filterState.delete(field);
    this._applyFilters();
  }

  _applyFilters() {
    this.query.filters = [...this.filterState].map(([field, f]) => ({ field, op: f.op, value: f.value }));
    this.query.pageNumber = 1;
    this.refresh();
  }

  _removeFilter(field) {
    this.filterState.delete(field);
    this._syncControls();
    this._applyFilters();
  }

  _clearFilters() {
    this.filterState.clear();
    this._syncControls();
    this._applyFilters();
  }

  /** Clicking a header: ascending → descending → off. With Shift it adds a secondary sort. */
  _sort(field, add) {
    const current = this.query.orderBy.map((o) => o.split(/\s+/));
    const i = current.findIndex(([f]) => f === field);
    const next = i < 0 ? 'asc' : current[i][1] === 'desc' ? null : 'desc';
    let orders = add ? current.filter(([f]) => f !== field) : [];
    if (next) {
      const clause = [field, next === 'desc' ? 'desc' : null].filter(Boolean);
      if (add && i >= 0) orders.splice(i, 0, clause); else orders.push(clause);
    }
    this.query.orderBy = orders.map((o) => o.join(' '));
    this.query.pageNumber = 1;
    this.refresh();
  }

  _goTo(page) {
    const last = Math.max(1, Math.ceil(this.state.totalCount / this.query.pageSize));
    const p = Math.min(Math.max(1, page), last);
    if (p === this.query.pageNumber) return;
    this.query.pageNumber = p;
    this.refresh();
  }

  /** Puts the search box and filter controls in line with the query (after setQuery / clear). */
  _syncControls() {
    if (!this.$) return;
    this.$.search.value = this.query.keyword;
    this.el.querySelectorAll('.mud-datatable__filter').forEach((box) => {
      const f = this.filterState.get(box.dataset.field);
      const opEl = box.querySelector('[data-dt="filter-op"]');
      const valueEl = box.querySelector('[data-dt="filter-value"]');
      if (opEl) opEl.value = f?.op ?? opEl.options[0].value;
      valueEl.value = f?.value ?? '';
      if (valueEl.tagName === 'INPUT') valueEl.disabled = !!f && f.op.endsWith('null');
    });
  }

  // ───────────────────────── rendering ─────────────────────────

  _render() {
    this.el.classList.toggle('is-loading', this.state.loading);
    this.$.table.setAttribute('aria-busy', String(this.state.loading));
    this._renderHeader();
    this._renderChips();
    this._renderBody();
    this._renderFooter();
  }

  _renderHeader() {
    const orders = this.query.orderBy.map((o) => o.split(/\s+/));
    this.$.thead.querySelectorAll('th[data-field]').forEach((th) => {
      const i = orders.findIndex(([f]) => f === th.dataset.field);
      const dir = i < 0 ? null : orders[i][1] === 'desc' ? 'descending' : 'ascending';
      if (dir) th.setAttribute('aria-sort', dir); else th.removeAttribute('aria-sort');
      const rank = th.querySelector('.mud-datatable__sort-rank');
      if (rank) rank.textContent = orders.length > 1 && i >= 0 ? formatNumber(i + 1) : '';
    });
  }

  _formatChip(f) {
    const col = this.columns.find((c) => c.field === f.field);
    const label = col?.title ?? f.field;
    if (f.op === 'isnull' || f.op === 'notnull') return `${label} ${opLabel(f.op)}`;
    const shown = col?.type === 'boolean' ? (f.value === 'true' ? t('common.yes', {}, 'Yes') : t('common.no', {}, 'No'))
      : col?.type === 'enum' ? (col.options.find((o) => o.value === f.value)?.label ?? f.value)
        : f.value;
    return `${label} ${OPERATORS[f.op] ? opLabel(f.op) : f.op} “${shown}”`;
  }

  _renderChips() {
    const filters = this.query.filters;
    this.$.chips.innerHTML = filters.map((f) => `
      <span class="mud-datatable__chip" role="listitem">${esc(this._formatChip(f))}
        <button type="button" data-dt="remove-filter" data-field="${esc(f.field)}" aria-label="${esc(t('datatable.removeFilter', { filter: this._formatChip(f) }, 'Remove filter: {filter}'))}">${getIconSvg('close', 12)}</button>
      </span>`).join('');
    this.$.chips.hidden = !filters.length;
    if (this.$.count) {
      this.$.count.hidden = !filters.length;
      this.$.count.textContent = filters.length ? formatNumber(filters.length) : '';
    }
  }

  _cell(c, row, nodes) {
    const value = getValue(row, c.key);
    if (c.render) {
      const out = c.render(value, row);
      if (out instanceof Node) { nodes.push(out); return `<span data-dt-node="${nodes.length - 1}"></span>`; }
      return out ?? ''; // trusted HTML from the column definition
    }
    if (value === null || value === undefined || value === '') return '<span class="mud-datatable__empty" aria-label="' + esc(t('datatable.emptyCell', {}, 'empty')) + '">—</span>';
    return esc(this._format(c, value));
  }

  _format(c, value) {
    const locale = intlLocale(); // the active locale with the chosen digits (setNumerals / theme numerals)
    if (typeof c.format === 'function') return c.format(value);
    try {
      if (typeof c.format === 'string') {
        const [name, arg] = c.format.split(':');
        if (name === 'currency') return new Intl.NumberFormat(locale, { style: 'currency', currency: arg || 'USD' }).format(value);
        if (PRESETS[name]) return PRESETS[name](value, locale);
      }
      if (c.type === 'enum') return c.options.find((o) => o.value === String(value))?.label ?? String(value);
      if (c.type === 'number') return PRESETS.number(value, locale);
      if (c.type === 'date') return PRESETS.date(value, locale);
      if (c.type === 'boolean') return PRESETS.boolean(value);
    } catch { /* fall back to the raw value */ }
    return String(value);
  }

  _renderBody() {
    const { items, error, loading } = this.state;
    const span = this.columns.length + (this.selection === 'none' ? 0 : 1);
    const active = this.query.keyword.trim() || this.query.filters.length;

    if (error) {
      this.$.tbody.innerHTML = `<tr class="mud-datatable__message"><td colspan="${span}">
        <span class="mud-datatable__error">${esc(error)}</span>
        <button type="button" class="mud-button-root mud-button-text mud-button-primary mud-button-small" data-dt="retry">${esc(t('common.retry', {}, 'Try again'))}</button></td></tr>`;
      return;
    }
    if (!items.length) {
      this.$.tbody.innerHTML = loading ? `<tr class="mud-datatable__message"><td colspan="${span}">${esc(t('common.loading', {}, 'Loading…'))}</td></tr>`
        : `<tr class="mud-datatable__message"><td colspan="${span}">${esc(active ? t('datatable.noMatches', {}, 'No rows match the search and filters.') : this.emptyText ?? t('datatable.empty', {}, 'No rows to show.'))}
          ${active ? '<button type="button" class="mud-button-root mud-button-text mud-button-primary mud-button-small" data-dt="clear-filters">' + esc(t('datatable.clearFilters', {}, 'Clear filters')) + '</button>' : ''}</td></tr>`;
      return;
    }

    const nodes = [];
    const clickable = !!this.onRowClick || this.selection === 'single';
    this.$.tbody.innerHTML = items.map((row) => {
      const key = this._keyOf(row);
      const on = this.selected.has(key);
      const select = this.selection === 'multiple'
        ? `<td class="mud-datatable__select"><input type="checkbox" data-dt="select-row" ${on ? 'checked' : ''} aria-label="${esc(t('datatable.selectRow', { key }, 'Select row {key}'))}"></td>`
        : this.selection === 'single' ? `<td class="mud-datatable__select"><span class="mud-datatable__radio${on ? ' is-on' : ''}" aria-hidden="true"></span></td>` : '';
      return `<tr data-key="${esc(key)}"${clickable ? ' tabindex="0"' : ''}${this.selection !== 'none' ? ` aria-selected="${on}"` : ''}>${select}${this.columns.map((c) =>
        `<td data-label="${esc(c.title)}" data-align="${c.align}">${this._cell(c, row, nodes)}</td>`).join('')}</tr>`;
    }).join('');
    if (nodes.length) this.$.tbody.querySelectorAll('[data-dt-node]').forEach((ph) => ph.replaceWith(nodes[Number(ph.dataset.dtNode)]));

    const pageBox = this.el.querySelector('[data-dt="select-page"]');
    if (pageBox) {
      const n = items.filter((r) => this.selected.has(this._keyOf(r))).length;
      pageBox.checked = n > 0 && n === items.length;
      pageBox.indeterminate = n > 0 && n < items.length;
    }
  }

  _renderFooter() {
    const { totalCount, loading } = this.state;
    const { pageNumber, pageSize } = this.query;
    const last = Math.max(1, Math.ceil(totalCount / pageSize));
    const from = totalCount ? (pageNumber - 1) * pageSize + 1 : 0;
    const to = Math.min(totalCount, pageNumber * pageSize);
    const fmt = (n) => formatNumber(n);
    const selected = this.selected.size ? t('datatable.selected', { count: this.selected.size, n: fmt(this.selected.size) }, ' · {n} selected') : '';
    this.$.summary.textContent = loading && !this.state.items.length ? t('common.loading', {}, 'Loading…')
      : totalCount ? t('datatable.range', { from: fmt(from), to: fmt(to), total: fmt(totalCount) }, '{from}–{to} of {total}') + selected : t('datatable.noRows', {}, 'No rows');

    // First, previous, a window of pages, next, last.
    const pages = new Set([1, last, pageNumber - 1, pageNumber, pageNumber + 1].filter((p) => p >= 1 && p <= last));
    const sorted = [...pages].sort((a, b) => a - b);
    const btn = (page, label, aria, disabled, current = false) =>
      `<button type="button" class="mud-datatable__page${current ? ' is-current' : ''}" data-dt="page" data-page="${page}" aria-label="${esc(aria)}"${current ? ' aria-current="page"' : ''}${disabled ? ' disabled' : ''}>${label}</button>`;
    let html = btn(pageNumber - 1, `<span class="mud-datatable__chev is-prev" aria-hidden="true">${getIconSvg('chevronRight', 16)}</span>`, t('datatable.previousPage', {}, 'Previous page'), pageNumber <= 1);
    sorted.forEach((p, i) => {
      if (i && p - sorted[i - 1] > 1) html += '<span class="mud-datatable__gap" aria-hidden="true">…</span>';
      html += btn(p, fmt(p), t('datatable.page', { n: fmt(p) }, 'Page {n}'), false, p === pageNumber);
    });
    html += btn(pageNumber + 1, `<span class="mud-datatable__chev" aria-hidden="true">${getIconSvg('chevronRight', 16)}</span>`, t('datatable.nextPage', {}, 'Next page'), pageNumber >= last);
    this.$.pager.innerHTML = html;
    this.$.size.value = String(pageSize);
  }
}
