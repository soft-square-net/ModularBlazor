// MudTail plugins: extend MudTail with your own components, behaviours, icons, texts, styles and design tokens,
// written in vanilla JavaScript (GSAP and Tailwind welcome), usable from plain pages and from Blazor alike.
//
//   import { definePlugin, use } from 'mudtail';
//
//   export default definePlugin({
//     name: 'countdown',
//     version: '1.0.0',
//     requires: { mudtail: '^0.1.0' },
//     tokens: { 'countdown-digit': { light: '#1f2937', dark: '#f9fafb' } },   // --mud-countdown-digit (+ Tailwind)
//     styles: '.mud-countdown { color: var(--mud-countdown-digit); }',        // injected in @layer components
//     icons: { stopwatch: '<circle cx="12" cy="14" r="8"/><path d="M12 10v4"/>' },
//     messages: { ar: { 'countdown.days': 'أيام' } },
//     behaviors: { countdown: (el, ctx) => ({ dispose() {} }) },             // data-mud="countdown"
//     components: { countdown: (host, options, emit, ctx) => ({ dispose() {} }) }, // createComponent / Blazor create()
//     setup(ctx, options) { return { reset() {} }; },                          // → the plugin's API
//   });
//
//   use(countdown, { locale: 'ar' });           // or, at runtime (Blazor): await loadPlugin('./plugins/countdown.js')
//
// Everything a plugin registers is recorded and undone by removePlugin(name). A plugin loaded at runtime from a URL
// cannot import 'mudtail' (the browser has no bundler to resolve it), so the context hands it the whole API
// (ctx.mudtail) and GSAP (ctx.gsap): build plugins against the context and they run in both worlds.

import gsap from 'gsap';
import { registerBehavior, unregisterBehavior, getBehavior } from '../behaviors/autoInit.js';
import { registerIcons, unregisterIcons, hasIcon } from './icons.js';
import { addMessages, t } from './i18n.js';
import { PluginError, tokensCss, validatePlugin as validate } from './plugin-tokens.js';

export { PluginError, pluginTailwindCss, validatePlugin } from './plugin-tokens.js';

/** MudTail's version, checked against a plugin's requires.mudtail. Kept equal to package.json (a test checks). */
export const MUDTAIL_VERSION = '0.1.0';

const WINDOW_EVENTS = { theme: 'mud-theme-changed', locale: 'mud-locale-changed', direction: 'mud-direction-changed' };

const installed = new Map(); // name -> record
const components = new Map(); // component name -> { factory, plugin }
let api = null; // MudTail's public API (index.js registers itself)
let handleTracker = null; // the Blazor interop's track(): handles a plugin creates are disposed with the module too
let cssLayer = 'components';
const reserved = new Set(); // built-in component names (the Blazor interop's create()); plugins cannot take them

// ───────────── definition ─────────────

/**
 * Checks a plugin definition and returns it frozen. Optional (a plain object works too), but it reports mistakes
 * when the plugin is written, not when it is installed.
 */
export function definePlugin(definition) {
  validate(definition);
  return Object.freeze({ ...definition });
}

// ───────────── install / remove ─────────────

/**
 * Installs a plugin. Returns its record: { name, version, api, ready, options, dispose() }.
 * `api` is what setup() returned (undefined until `ready` resolves when setup is async).
 * Installing the same plugin twice returns the first record; another plugin with the same name needs { replace: true }.
 */
export function use(plugin, options = {}, { replace = false } = {}) {
  const def = validate(plugin?.default && !plugin.name ? plugin.default : plugin);
  const existing = installed.get(def.name);
  if (existing) {
    if (existing.definition === def) return existing;
    if (!replace) throw new PluginError(`another plugin with this name is installed (${existing.version}); pass { replace: true } to swap it`, def.name);
    removePlugin(def.name, { force: true });
  }
  checkRequirements(def);

  const cleanups = []; // run in reverse on removal
  const record = {
    name: def.name,
    version: def.version ?? '0.0.0',
    description: def.description ?? '',
    definition: def,
    options: options ?? {},
    api: undefined,
    ready: null,
    dispose: () => removePlugin(def.name),
  };
  const ctx = createContext(record, cleanups);
  record.context = ctx;
  installed.set(def.name, record);

  const rollback = (error) => {
    runCleanups(cleanups, def.name);
    installed.delete(def.name);
    return error instanceof PluginError ? error : wrap(error, def.name);
  };

  try {
    if (def.tokens) ctx.tokens(def.tokens);
    if (def.styles) ctx.styles(def.styles);
    if (def.icons) ctx.icons(def.icons);
    for (const [locale, messages] of Object.entries(def.messages ?? {})) ctx.messages(locale, messages);
    for (const [key, factory] of Object.entries(def.behaviors ?? {})) ctx.behavior(key, factory);
    for (const [key, factory] of Object.entries(def.components ?? {})) ctx.component(key, factory);
    const result = def.setup ? def.setup(ctx, record.options) : undefined;
    if (result && typeof result.then === 'function') {
      record.ready = Promise.resolve(result).then(
        (value) => { finish(record, value, cleanups); return record.api; },
        (error) => { throw rollback(error); },
      );
      return record;
    }
    finish(record, result, cleanups);
  } catch (error) {
    throw rollback(error);
  }
  record.ready = Promise.resolve(record.api);
  return record;
}

function finish(record, result, cleanups) {
  if (typeof result === 'function') cleanups.push(result);
  else if (result && typeof result === 'object') {
    record.api = result;
    if (typeof result.dispose === 'function') cleanups.push(() => result.dispose());
  }
  announce('mud-plugin-installed', record);
}

/** Installs several plugins in order: [plugin, [plugin, options], …]. Returns the records. */
export function usePlugins(list) {
  return (list ?? []).map((entry) => (Array.isArray(entry) ? use(entry[0], entry[1]) : use(entry)));
}

/**
 * Loads a plugin module (an ES module whose default export, or `plugin` export, is the definition) and installs it.
 * `source` is a URL (resolved against the page, not against MudTail's own file), a module, or a definition.
 * Resolves to the record once async setup has finished.
 */
export async function loadPlugin(source, options = {}, flags = {}) {
  let module = source;
  if (typeof source === 'string' || source instanceof URL) {
    const base = typeof document !== 'undefined' ? document.baseURI : undefined;
    const url = base ? new URL(String(source), base).href : String(source);
    module = await import(/* @vite-ignore */ url);
  }
  const def = module?.default ?? module?.plugin ?? module;
  const record = use(def, options, flags);
  await record.ready;
  return record;
}

/**
 * Removes a plugin and undoes everything it registered (behaviours, components and their live instances, icons,
 * styles, tokens, listeners). Plugins that require it must go first, or pass { force: true } to remove them too.
 * Messages stay: other code may already show them. Returns true when the plugin was installed.
 */
export function removePlugin(name, { force = false } = {}) {
  const record = installed.get(name);
  if (!record) return false;
  const dependants = [...installed.values()].filter((r) => requiredPlugins(r.definition).some(([dep]) => dep === name));
  if (dependants.length) {
    if (!force) throw new PluginError(`${dependants.map((d) => `"${d.name}"`).join(', ')} require${dependants.length === 1 ? 's' : ''} it; remove ${dependants.length === 1 ? 'it' : 'them'} first or pass { force: true }`, name);
    for (const d of dependants) removePlugin(d.name, { force: true });
  }
  installed.delete(name);
  runCleanups(record.context._cleanups, name);
  announce('mud-plugin-removed', record);
  return true;
}

/** The API a plugin's setup() returned, or undefined (also while an async setup is still running). */
export function getPlugin(name) {
  return installed.get(name)?.api;
}

export function hasPlugin(name) {
  return installed.has(name);
}

/** The installed plugins: [{ name, version, description, components, behaviors }]. */
export function listPlugins() {
  return [...installed.values()].map((r) => ({
    name: r.name,
    version: r.version,
    description: r.description,
    components: [...components].filter(([, c]) => c.plugin === r.name).map(([key]) => key),
    behaviors: [...r.context._behaviors],
  }));
}

// ───────────── components (shared by vanilla JS and the Blazor interop) ─────────────

/**
 * Adds a component that createComponent() and the Blazor interop's create() can build.
 * factory(host, options, emit, ctx) returns a handle with dispose() (and any methods); emit(name, payload) raises
 * an event (OnMudEvent in .NET). Returns a function that unregisters it. Plugins use ctx.component() instead.
 */
export function registerComponent(name, factory, { plugin = null, context = null } = {}) {
  if (typeof factory !== 'function') throw new PluginError(`component "${name}" needs a factory function`, plugin);
  if (reserved.has(name)) throw new PluginError(`component "${name}" is a built-in MudTail component; pick another name`, plugin);
  const taken = components.get(name);
  if (taken && taken.plugin !== plugin) throw new PluginError(`component "${name}" is already registered${taken.plugin ? ` by "${taken.plugin}"` : ''}`, plugin);
  const entry = { factory, plugin, context, instances: new Set() };
  components.set(name, entry);
  return () => {
    if (components.get(name) !== entry) return;
    for (const instance of [...entry.instances]) safe(() => instance.dispose?.(), plugin);
    components.delete(name);
  };
}

/** Whether a registered (plugin) component of this name exists. */
export function hasComponent(name) {
  return components.has(name);
}

/** Names of the registered (plugin) components. */
export function componentNames() {
  return [...components.keys()];
}

/**
 * Builds a registered component in plain JavaScript.
 * onEvent: (name, payload) => void, or { eventName: handler }. Returns the handle (its dispose() is idempotent).
 */
export function createComponent(name, host, options = {}, onEvent = null) {
  const emit = toEmitter(onEvent);
  return buildComponent(name, host, options, emit);
}

/** @internal the Blazor interop's create() calls this with its OnMudEvent emitter. */
export function buildComponent(name, host, options, emit) {
  const entry = components.get(name);
  if (!entry) throw new PluginError(`unknown component "${name}". Registered: ${componentNames().join(', ') || 'none'}`);
  const handle = entry.factory(host ?? null, options ?? {}, emit, entry.context) ?? {};
  const inner = typeof handle.dispose === 'function' ? handle.dispose.bind(handle) : () => {};
  let disposed = false;
  handle.dispose = () => {
    if (disposed) return;
    disposed = true;
    entry.instances.delete(handle);
    inner();
  };
  entry.instances.add(handle);
  return handle;
}

// ───────────── the context a plugin gets ─────────────

function createContext(record, cleanups) {
  const name = record.name;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const behaviors = new Set();
  const track = (cleanup) => {
    if (typeof cleanup === 'function') cleanups.push(cleanup);
    else if (cleanup && typeof cleanup.dispose === 'function') cleanups.push(() => cleanup.dispose());
    return cleanup;
  };
  cleanups.push(() => controller?.abort());

  const ctx = {
    name,
    get version() { return record.version; },
    get options() { return record.options; },
    /** MudTail's whole public API, for plugins loaded at runtime (they cannot import 'mudtail'). */
    get mudtail() { return api; },
    /** The GSAP instance MudTail uses (bundled into mudtail.blazor.js). */
    gsap,
    /** Aborted when the plugin is removed: addEventListener(type, fn, { signal: ctx.signal }). */
    signal: controller?.signal,
    t,

    /** Adds a data-mud="<key>" behaviour: factory(element, ctx) → { dispose } or null. */
    behavior(key, factory) {
      const previous = getBehavior(key);
      registerBehavior(key, (el) => factory(el, ctx));
      behaviors.add(key);
      cleanups.push(() => { unregisterBehavior(key, previous); behaviors.delete(key); });
    },

    /** Adds a component: factory(host, options, emit, ctx) → handle. Built with createComponent() or Blazor create(). */
    component(key, factory) {
      cleanups.push(registerComponent(key, factory, { plugin: name, context: ctx }));
    },

    /** Adds icons for getIconSvg(): { name: lucideIconNode | '<path …/>' }. */
    icons(map) {
      const previous = {};
      for (const key of Object.keys(map ?? {})) if (hasIcon(key)) previous[key] = true;
      if (Object.keys(previous).length) console.warn(`[MudTail] plugin "${name}" replaces icon(s): ${Object.keys(previous).join(', ')}`);
      const names = registerIcons(map);
      cleanups.push(() => unregisterIcons(names));
    },

    /** Adds texts for t(): messages('ar', { 'countdown.days': 'أيام' }). Prefix keys with the plugin's name. */
    messages(locale, messages) {
      addMessages(locale, messages);
    },

    /** Injects CSS (inside @layer components, so Tailwind utilities still override it). Returns a remover. */
    styles(css, { layer = cssLayer } = {}) {
      return injectStyle(name, layer ? `@layer ${layer} {\n${css}\n}` : css, cleanups);
    },

    /** Sets design tokens: { key: value | { light, dark, tailwind? } } → --mud-<key> on :root (and dark theme). */
    tokens(tokens) {
      return injectStyle(name, tokensCss(tokens), cleanups);
    },

    /** Listens to 'theme', 'locale', 'direction' (MudTail's events) or any window event; removed with the plugin. */
    on(event, handler) {
      const type = WINDOW_EVENTS[event] ?? event;
      const listener = (e) => handler(e.detail, e);
      if (typeof window === 'undefined') return () => {};
      window.addEventListener(type, listener);
      const off = () => window.removeEventListener(type, listener);
      cleanups.push(off);
      return off;
    },

    /** Raises a window event "mud-plugin:<name>:<event>" (detail = payload) for pages and other plugins. */
    emit(event, detail = null) {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(`mud-plugin:${name}:${event}`, { detail }));
    },

    /** Another plugin's API (list it in requires.plugins so it is installed first). */
    plugin(other) {
      return getPlugin(other);
    },

    /**
     * Turns a callback target into emit(name, payload): a .NET DotNetObjectReference (→ OnMudEvent), a function,
     * or { eventName: handler }. For plugin API methods called from Blazor with a DotNetObjectReference.
     */
    emitter: toEmitter,

    /** Runs cleanup (a function or { dispose }) when the plugin is removed. Returns its argument. */
    track,

    /**
     * Makes `obj` a handle: dispose() becomes idempotent, it is disposed with the plugin, and, under Blazor, with the
     * interop module (and counted by activeCount()). Return handles from API methods called from .NET.
     */
    handle(obj) {
      if (!obj || typeof obj.dispose !== 'function') return obj;
      const inner = obj.dispose.bind(obj);
      let disposed = false;
      const remove = () => { const i = cleanups.indexOf(disposeIt); if (i >= 0) cleanups.splice(i, 1); };
      const disposeIt = () => { if (disposed) return; disposed = true; remove(); inner(); };
      obj.dispose = disposeIt;
      cleanups.push(disposeIt);
      handleTracker?.(obj);
      return obj;
    },

    _cleanups: cleanups,
    _behaviors: behaviors,
  };
  return ctx;
}

function injectStyle(plugin, css, cleanups) {
  if (!css || typeof document === 'undefined') return () => {};
  const el = document.createElement('style');
  el.dataset.mudPlugin = plugin;
  el.textContent = css;
  document.head.appendChild(el);
  const remove = () => el.remove();
  cleanups.push(remove);
  return remove;
}

// ───────────── requirements and versions ─────────────

function requiredPlugins(def) {
  const req = def.requires?.plugins;
  if (!req) return [];
  return Array.isArray(req) ? req.map((n) => [n, '*']) : Object.entries(req);
}

function checkRequirements(def) {
  const range = def.requires?.mudtail;
  if (range && !satisfies(MUDTAIL_VERSION, range)) throw new PluginError(`needs MudTail ${range}; this is ${MUDTAIL_VERSION}`, def.name);
  for (const [dep, want] of requiredPlugins(def)) {
    const other = installed.get(dep);
    if (!other) throw new PluginError(`needs the plugin "${dep}"${want !== '*' ? ` ${want}` : ''}; install it first`, def.name);
    if (!satisfies(other.version, want)) throw new PluginError(`needs "${dep}" ${want}; ${other.version} is installed`, def.name);
  }
}

function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(v).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

/**
 * Whether a version satisfies a range: '*', '1.2.3', '>=1.2.0', '>1.0.0', '<2.0.0', '<=1.4.0', '^1.2.0', '~1.2.0',
 * several separated by spaces (all must hold) or by || (any).
 */
export function satisfies(version, range) {
  const v = parseVersion(version);
  if (!v) return false;
  return String(range).split('||').some((alt) => alt.trim().split(/\s+/).filter(Boolean).every((part) => test(v, part)));
}

function test(v, part) {
  if (part === '*' || part === 'x') return true;
  const m = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(part);
  const want = parseVersion(m[2]);
  if (!want) throw new PluginError(`"${part}" is not a version range`);
  const c = compare(v, want);
  switch (m[1]) {
    case '>=': return c >= 0;
    case '<=': return c <= 0;
    case '>': return c > 0;
    case '<': return c < 0;
    case '^': return c >= 0 && (want[0] > 0 ? v[0] === want[0] : want[1] > 0 ? v[0] === 0 && v[1] === want[1] : v[0] === 0 && v[1] === 0 && v[2] === want[2]);
    case '~': return c >= 0 && v[0] === want[0] && v[1] === want[1];
    default: return c === 0;
  }
}

// ───────────── helpers ─────────────

/** emit(name, payload) for a DotNetObjectReference (OnMudEvent), a function, or { eventName: handler }. */
export function toEmitter(target) {
  if (!target) return () => {};
  if (typeof target.invokeMethodAsync === 'function') {
    return (event, payload = null) => { target.invokeMethodAsync('OnMudEvent', event, payload ?? null).catch(() => {}); };
  }
  if (typeof target === 'function') return (event, payload = null) => target(event, payload);
  return (event, payload = null) => target[event]?.(payload);
}

function runCleanups(cleanups, plugin) {
  while (cleanups.length) safe(cleanups.pop(), plugin);
}

function safe(fn, plugin) {
  try { fn?.(); } catch (e) { console.error(`[MudTail] plugin "${plugin}" cleanup failed`, e); }
}

function wrap(error, plugin) {
  const e = new PluginError(error?.message ?? String(error), plugin);
  e.cause = error;
  return e;
}

function announce(type, record) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(type, { detail: { name: record.name, version: record.version } }));
}

/** @internal index.js hands over the public API, so runtime-loaded plugins get it as ctx.mudtail. */
export function setPluginHost(publicApi) {
  api = publicApi;
}

/** @internal the Blazor interop registers its track(), so plugin handles join its lifecycle. */
export function setHandleTracker(track) {
  handleTracker = track;
}

/** @internal names a plugin component may not use. */
export function reserveComponentNames(names) {
  for (const n of names) reserved.add(n);
}

/** Sets the cascade layer plugin styles go into ('components' by default; null for none). */
export function setPluginStyleLayer(layer) {
  cssLayer = layer || null;
}
