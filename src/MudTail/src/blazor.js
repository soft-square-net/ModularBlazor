// MudTail interop surface for Blazor (IJSRuntime / IJSObjectReference).
//
//   var mud = await JS.InvokeAsync<IJSObjectReference>("import", "./_content/<Assembly>/js/mudtail.blazor.js");
//   await mud.InvokeVoidAsync("init", new { primary = "#594ae2", isDark = false });
//   var tabs = await mud.InvokeAsync<IJSObjectReference>("create", "tabs", hostElement, options, dotNetRef);
//   await tabs.InvokeVoidAsync("setActive", "scores");
//   await tabs.InvokeVoidAsync("dispose");   // from the component's DisposeAsync
//
// Lifecycle contract:
//   init(options)                     once per app: theme (+ optional dir, lang, autoInit)
//   create / behavior / ripple / tooltip / lightbox / autoInit / observeTheme / observeDirection
//                                     → a handle; C# calls its methods and finally handle.dispose()
//   dispose()                         disposes every handle still alive (module teardown); activeCount() checks leaks
// Every handle's dispose() is idempotent. Component events are forwarded to the .NET object as
// OnMudEvent(string name, object? payload), so the C# side needs:
//   [JSInvokable] public Task OnMudEvent(string name, JsonElement payload)

import {
  initTheme,
  getTheme,
  updateTheme,
  showToast,
  createRipple,
  attachTooltip,
  createMudButton,
  createAutocomplete,
  MudTabs,
  MudAccordion,
  MudDrawer,
  MudDialog,
  MudDock,
  DockModel,
  MudDataTable,
  toPaginationFilter,
  setDirection,
  attachBehavior,
  openLightbox,
  autoInit as libAutoInit,
  setLocale,
} from './index.js';

export * from './index.js';

const EVENT_METHOD = 'OnMudEvent';

/** Calls back into .NET; a disposed DotNetObjectReference must not break the UI. */
function emitter(dotNetRef) {
  return (name, payload = null) => {
    if (!dotNetRef) return;
    dotNetRef.invokeMethodAsync(EVENT_METHOD, name, payload).catch(() => {});
  };
}

/** Appends `el` into a Blazor-rendered host. The host must be an element Blazor renders empty. */
function mountInto(host, el) {
  if (host instanceof Element) host.appendChild(el);
  return el;
}

// ───────────── lifecycle: every handle handed to .NET is tracked until it is disposed ─────────────

const live = new Set();

/** Registers a handle so the module-level dispose() can clean it up; its own dispose() becomes idempotent. */
function track(handle) {
  if (!handle || typeof handle.dispose !== 'function') return handle;
  const inner = handle.dispose.bind(handle);
  let disposed = false;
  handle.dispose = () => {
    if (disposed) return;
    disposed = true;
    live.delete(handle);
    inner();
  };
  live.add(handle);
  return handle;
}

/** Disposes everything created through this module (components, behaviours, observers). Returns how many. */
export function dispose() {
  const handles = [...live];
  for (const h of handles) {
    try { h.dispose(); } catch (e) { console.error('[MudTail] dispose failed', e); }
  }
  return handles.length;
}

/** How many handles are still alive: a quick leak check from .NET. */
export function activeCount() {
  return live.size;
}

// ───────────── setup ─────────────

const THEME_KEYS = ['primary', 'secondary', 'borderRadius', 'isDark', 'numerals'];

/**
 * Applies the saved theme, then any overrides, and optionally the direction and behaviours.
 * options: { primary?, secondary?, borderRadius?, isDark?, numerals?: 'auto'|'latn'|'arab'|'arabext', locale?: 'ar', persistLocale?,
 *            dir?: 'ltr'|'rtl', lang?, autoInit?: boolean }
 * numerals picks the digits (Western 1 2 3 or Arabic-Indic ١ ٢ ٣); it is saved with the theme.
 * locale sets <html lang> and the direction (RTL for Arabic, Hebrew, …) and switches MudTail's own texts.
 * Only these keys are used, so calling it as a module entry point (moduleHost passes { moduleId }) is harmless.
 * Returns the theme.
 */
export function init(options = null) {
  initTheme();
  const overrides = Object.fromEntries(THEME_KEYS.filter((k) => options?.[k] !== undefined && options?.[k] !== null).map((k) => [k, options[k]]));
  if (Object.keys(overrides).length) updateTheme(overrides);
  if (options?.locale) setLocale(options.locale, { dir: options.dir ?? null, persist: !!options.persistLocale });
  else if (options?.dir) setDirection(options.dir, options.lang);
  if (options?.autoInit) autoInit(document.body);
  return getTheme();
}

export function setTheme(updates) {
  return updateTheme(updates || {});
}

export function toggleDark() {
  return updateTheme({ isDark: !getTheme().isDark });
}

/** Raises OnMudEvent("theme", theme) on every theme change. Returns a handle with dispose(). */
export function observeTheme(dotNetRef) {
  const emit = emitter(dotNetRef);
  const handler = (e) => emit('theme', e.detail);
  window.addEventListener('mud-theme-changed', handler);
  return track({ dispose: () => window.removeEventListener('mud-theme-changed', handler) });
}

/** Raises OnMudEvent("locale", { locale, dir }) whenever setLocale() changes it. Returns a handle with dispose(). */
export function observeLocale(dotNetRef) {
  const emit = emitter(dotNetRef);
  const handler = (e) => emit("locale", e.detail);
  window.addEventListener("mud-locale-changed", handler);
  return track({ dispose: () => window.removeEventListener("mud-locale-changed", handler) });
}

/** Raises OnMudEvent("direction", "ltr" | "rtl") whenever setDirection() changes it. Returns a handle with dispose(). */
export function observeDirection(dotNetRef) {
  const emit = emitter(dotNetRef);
  const handler = (e) => emit('direction', e.detail);
  window.addEventListener('mud-direction-changed', handler);
  return track({ dispose: () => window.removeEventListener('mud-direction-changed', handler) });
}

export function toast(message, type = 'info') {
  showToast(message, type);
}

// ───────────── behaviours on Blazor-rendered markup ─────────────

/** Adds the Material ripple to an element Blazor rendered (e.g. a <button class="mud-button-root">). */
export function ripple(element) {
  const onClick = (e) => createRipple(e, element);
  element?.addEventListener('click', onClick);
  return track({ dispose: () => element?.removeEventListener('click', onClick) });
}

/** Attaches a tooltip to an element Blazor rendered. */
export function tooltip(element, text, position = 'top') {
  const detach = attachTooltip(element, text, position);
  return track({ dispose: detach });
}

/**
 * Starts the data-mud behaviours under `root` (default <body>) and keeps them in sync with what Blazor renders.
 * Returns { refresh, dispose }. Shadows the library's autoInit so module-level dispose() stops it too.
 */
export function autoInit(root = document.body) {
  return track(libAutoInit(root));
}

/**
 * One behaviour on one element, tied to the caller's lifecycle (OnAfterRenderAsync → DisposeAsync):
 * 'ticker' | 'score-strip' | 'lightbox' | 'mega-nav' | 'reading-progress' | 'theme-toggle' (or a registered one).
 * Returns its handle, or null when the element's markup does not fit the behaviour.
 */
export function behavior(name, element) {
  return track(attachBehavior(name, element));
}

/** Opens the lightbox on [{ src, caption, alt }] at `index`. Returns { next, prev, show, close, dispose }. */
export function lightbox(items, index = 0) {
  return track(openLightbox(items, index));
}

const factories = {
  button(host, options, emit) {
    const el = createMudButton({ ...options, onClick: () => emit('click') });
    mountInto(host, el);
    return { element: el, dispose: () => el.remove() };
  },

  autocomplete(host, options, emit) {
    const abort = new AbortController();
    const el = createAutocomplete({ ...options, signal: abort.signal, onSelect: (value) => emit('select', value) });
    mountInto(host, el);
    return {
      element: el,
      setValue: (value) => { el.querySelector('input').value = value ?? ''; },
      dispose: () => { abort.abort(); el.remove(); },
    };
  },

  tabs(host, options, emit) {
    const tabs = new MudTabs({ ...options, onChange: (id) => emit('change', id) });
    mountInto(host, tabs.getElement());
    return tabs;
  },

  accordion(host, options) {
    const accordion = new MudAccordion(options);
    mountInto(host, accordion.getElement());
    return accordion;
  },

  // Drawers and dialogs live on <body>, so `host` is ignored.
  drawer(_host, options, emit) {
    return new MudDrawer({ ...options, onOpen: () => emit('open'), onClose: () => emit('close') });
  },

  dialog(_host, options, emit) {
    // Actions coming from C# carry an id instead of a callback: { id, label, color, variant, keepOpen }.
    const actions = (options?.actions || []).map((a) => ({
      ...a,
      onClick: (_e, dialog) => {
        emit('action', a.id ?? a.label);
        if (!a.keepOpen) dialog.close();
      },
    }));
    return new MudDialog({ ...options, actions, onClose: () => emit('close') });
  },

  /**
   * Data table. options: { columns, data?, rowKey?, selection?, pageSize?, pageSizes?, caption?, dense?, striped?,
   *   initialQuery?, rowClick?: boolean, server?: { url, headers?, credentials?, debounce? }, serverSide?: boolean }
   * Columns come from C#, so format is a preset name ('number', 'currency:EUR', 'date', …), not a function.
   *
   * serverSide: true → for every page the table raises OnMudEvent("query", { requestId, query, filter }), where
   * filter is the PaginationFilter shape { keyword, searchFields, pageNumber, pageSize, orderBy, filters }.
   * Call the API with it (your authorised HttpClient / ApiClient) and answer with
   * setPage(requestId, items, totalCount), or failPage(requestId, message). Answers to stale requests are ignored.
   * server.url instead fetches the endpoint directly (GET with the PaginationFilter query string).
   * Other events: "rowclick" (row) when rowClick is true, "selection" (keys).
   */
  datatable(host, options, emit) {
    const pending = new Map();
    let seq = 0;
    let server = null;
    if (options.server?.url) {
      server = { url: options.server.url, headers: options.server.headers, credentials: options.server.credentials, debounce: options.server.debounce };
    } else if (options.serverSide) {
      server = {
        debounce: options.debounce,
        fetch: (query, signal) => new Promise((resolve, reject) => {
          const requestId = ++seq;
          pending.set(requestId, { resolve, reject });
          signal.addEventListener('abort', () => {
            pending.delete(requestId);
            reject(new DOMException('Superseded by a newer query', 'AbortError'));
          });
          emit('query', { requestId, query, filter: toPaginationFilter(query) });
        }),
      };
    }

    const table = new MudDataTable({
      ...options,
      server,
      data: options.data ?? [],
      onRowClick: options.rowClick ? (row) => emit('rowclick', row) : null,
      onSelectionChange: (keys) => emit('selection', keys),
    });
    mountInto(host, table.getElement());

    const settle = (requestId, fn) => {
      const p = pending.get(requestId);
      if (!p) return false; // stale or unknown: a newer query replaced it
      pending.delete(requestId);
      fn(p);
      return true;
    };

    return {
      setData: (rows) => table.setData(rows ?? []),
      setPage: (requestId, items, totalCount) => settle(requestId, (p) => p.resolve({ items: items ?? [], totalCount: totalCount ?? 0 })),
      failPage: (requestId, message) => settle(requestId, (p) => p.reject(new Error(message || 'The data could not be loaded.'))),
      reload: () => table.reload(),
      setQuery: (partial) => table.setQuery(partial ?? {}),
      getQuery: () => table.getQuery(),
      getSelection: () => table.getSelection(),
      clearSelection: () => table.clearSelection(),
      dispose: () => { pending.clear(); table.dispose(); },
    };
  },

  /**
   * IDE docking layout. Panel content is a Blazor component mounted with Blazor's JS root components, so Blazor
   * owns that DOM and the dock never moves Blazor-rendered markup. In Program.cs register each panel component:
   *   builder.RootComponents.RegisterForJavaScript<ExplorerPanel>("app-explorer");
   * and give it the parameters it receives:  [Parameter] public string PanelId / PanelKey / Title { get; set; }
   *
   * options: {
   *   storageKey?: string,                       save / restore in localStorage
   *   layout?: object | string,                  default arrangement, in the shape serialize() produces
   *   blockKey?: string,                         panel kind used by "add a block"
   *   definitions: [{ key, title, icon?, allowMultiple?, document?, component }]
   * }
   * Events: OnMudEvent("layout", json) after every change.
   */
  dock(host, options, emit) {
    const blazor = globalThis.Blazor;
    const definitions = (options.definitions ?? []).map(({ component, ...def }) => ({
      ...def,
      render(panel) {
        const element = document.createElement('div');
        element.className = 'mud-dock-blazor';
        if (!component || typeof blazor?.rootComponents?.add !== 'function') {
          element.textContent = component
            ? `Blazor root components are not available, so "${component}" cannot be shown.`
            : `No component is set for "${def.key}".`;
          return element;
        }
        let handle = null;
        let disposed = false;
        blazor.rootComponents.add(element, component, { panelId: panel.id, panelKey: panel.key, title: panel.title })
          .then((h) => { if (disposed) h.dispose(); else handle = h; })
          .catch((e) => {
            element.textContent = `"${component}" failed to load: ${e?.message ?? e}`;
            console.error('[MudTail] dock panel component failed', component, e);
          });
        return { element, dispose: () => { disposed = true; handle?.dispose(); } };
      },
    }));

    const dock = new MudDock({
      definitions,
      defaultLayout: options.layout ? DockModel.layoutFrom(options.layout) : null,
      blockKey: options.blockKey ?? 'note',
      storageKey: options.storageKey ?? null,
    });
    mountInto(host, dock.getElement());
    const m = dock.model;
    const off = m.on('change', () => emit('layout', m.serialize()));
    const firstGroup = () => m.groups[0]?.id ?? '';

    return {
      addPanel: (key, groupId = null, zone = 'Center') => m.addPanel(key, groupId || firstGroup(), zone),
      show: (key) => m.show(key),
      openDocument: (key, title, state = {}) => m.openDocument(key, title, state ?? {})?.id ?? null,
      close: (panelId) => m.close(panelId),
      activate: (panelId) => { const g = m.groupOf(panelId); if (g) m.activate(g.id, panelId); },
      getPanelState: (panelId) => ({ ...(m.findPanel(panelId)?.state ?? {}) }),
      setPanelState: (panelId, name, value) => {
        const p = m.findPanel(panelId);
        if (!p) return;
        p.state[name] = String(value);
        emit('layout', m.serialize());
      },
      resetLayout: () => m.resetLayout(),
      clearSaved: () => dock.clearSaved(),
      serialize: () => m.serialize(),
      load: (json) => m.load(json),
      dispose: () => { off(); dock.dispose(); },
    };
  },
};

/**
 * Creates a component and returns its handle.
 * @param {'button'|'autocomplete'|'tabs'|'accordion'|'drawer'|'dialog'|'dock'|'datatable'} name
 * @param {Element|null} host   Blazor ElementReference to render into (ignored for drawer/dialog)
 * @param {object} options      The component's options (see the component's constructor)
 * @param {object|null} dotNetRef DotNetObjectReference that receives OnMudEvent(name, payload)
 */
export function create(name, host, options = {}, dotNetRef = null) {
  const factory = factories[name];
  if (!factory) throw new Error(`MudTail: unknown component "${name}". Known: ${Object.keys(factories).join(', ')}`);
  return track(factory(host, options || {}, emitter(dotNetRef)));
}

/** Names create() accepts. */
export function componentNames() {
  return Object.keys(factories);
}
