// MudTail interop surface for Blazor (IJSRuntime / IJSObjectReference).
//
//   var mud = await JS.InvokeAsync<IJSObjectReference>("import", "./_content/<Assembly>/js/mudtail.blazor.js");
//   await mud.InvokeVoidAsync("init", new { primary = "#594ae2", isDark = false });
//   var tabs = await mud.InvokeAsync<IJSObjectReference>("create", "tabs", hostElement, options, dotNetRef);
//   await tabs.InvokeVoidAsync("setActive", "scores");
//   await tabs.InvokeVoidAsync("dispose");   // from the component's DisposeAsync
//
// Every create* call returns a handle whose methods C# can invoke, and every handle has dispose().
// Component events are forwarded to the .NET object as OnMudEvent(string name, object? payload),
// so the C# side needs:  [JSInvokable] public Task OnMudEvent(string name, JsonElement payload)

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

/** Applies the saved theme, then any overrides (primary, secondary, borderRadius, isDark). */
export function init(themeOverrides = null) {
  initTheme();
  if (themeOverrides) updateTheme(themeOverrides);
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
  return { dispose: () => window.removeEventListener('mud-theme-changed', handler) };
}

export function toast(message, type = 'info') {
  showToast(message, type);
}

/** Adds the Material ripple to an element Blazor rendered (e.g. a <button class="mud-button-root">). */
export function ripple(element) {
  const onClick = (e) => createRipple(e, element);
  element?.addEventListener('click', onClick);
  return { dispose: () => element?.removeEventListener('click', onClick) };
}

/** Attaches a tooltip to an element Blazor rendered. */
export function tooltip(element, text, position = 'top') {
  const detach = attachTooltip(element, text, position);
  return { dispose: detach };
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
};

/**
 * Creates a component and returns its handle.
 * @param {'button'|'autocomplete'|'tabs'|'accordion'|'drawer'|'dialog'} name
 * @param {Element|null} host   Blazor ElementReference to render into (ignored for drawer/dialog)
 * @param {object} options      The component's options (see the component's constructor)
 * @param {object|null} dotNetRef DotNetObjectReference that receives OnMudEvent(name, payload)
 */
export function create(name, host, options = {}, dotNetRef = null) {
  const factory = factories[name];
  if (!factory) throw new Error(`MudTail: unknown component "${name}". Known: ${Object.keys(factories).join(', ')}`);
  return factory(host, options || {}, emitter(dotNetRef));
}
