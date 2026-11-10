// Declarative behaviours for server- or Blazor-rendered markup.
//
//   <div class="mud-ticker" data-mud="ticker">…</div>      (several: data-mud="lightbox reveal-stagger")
//   <section data-mud-reveal="fade-up">…</section>
//
// autoInit(root) attaches the behaviour named in each data-mud attribute, and keeps watching root: elements
// Blazor adds later are attached, and elements it removes are disposed. Behaviours never add or remove
// children of the elements they are given (Blazor owns those); they only set styles, attributes they own
// (aria-expanded, data-open, data-state) and append their own overlays to <body>.

import { createReveal } from './reveal.js';
import { ticker } from './ticker.js';
import { scoreStrip } from './scoreStrip.js';
import { lightbox } from './lightbox.js';
import { megaNav } from './megaNav.js';
import { readingProgress } from './readingProgress.js';
import { themeToggle } from './themeToggle.js';
import { passwordToggle } from './passwordToggle.js';

const registry = new Map([
  ['ticker', ticker],
  ['score-strip', scoreStrip],
  ['lightbox', lightbox],
  ['mega-nav', megaNav],
  ['reading-progress', readingProgress],
  ['theme-toggle', themeToggle],
  ['password-toggle', passwordToggle],
]);

/**
 * Adds a behaviour that autoInit attaches to elements with data-mud="<name>".
 * factory(element) returns an object with dispose(), or null when the markup does not fit.
 */
export function registerBehavior(name, factory) {
  registry.set(name, factory);
}

/** Names of the registered behaviours. */
export function behaviorNames() {
  return [...registry.keys()];
}

/**
 * Attaches one behaviour to one element, outside autoInit: for code that owns the element's lifecycle
 * (e.g. a Blazor component: attach in OnAfterRenderAsync, dispose in DisposeAsync).
 * Returns the behaviour's instance (always with dispose()), or null when the markup does not fit.
 */
export function attachBehavior(name, element) {
  const factory = registry.get(name);
  if (!factory) throw new Error(`MudTail: unknown behaviour "${name}". Known: ${behaviorNames().join(', ')}`);
  if (!element) return null;
  return factory(element) ?? null;
}

const controllers = new WeakMap();

/** Attaches behaviours under `root` (default: document.body) and keeps them in sync. Returns { refresh, dispose }. */
export function autoInit(root = document.body) {
  if (!root) throw new Error('MudTail.autoInit: no root element');
  if (controllers.has(root)) return controllers.get(root);

  const instances = new Map(); // element -> Map(name -> instance)
  const reveal = createReveal();

  const attach = (el) => {
    const names = (el.getAttribute('data-mud') || '').split(/\s+/).filter(Boolean);
    let byName = instances.get(el);
    for (const name of names) {
      if (byName?.has(name)) continue;
      const factory = registry.get(name);
      if (!factory) continue;
      try {
        const instance = factory(el);
        if (!instance) continue;
        if (!byName) instances.set(el, (byName = new Map()));
        byName.set(name, instance);
      } catch (e) {
        console.error(`[MudTail] behaviour "${name}" failed`, e);
      }
    }
  };

  const scan = (node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.hasAttribute('data-mud')) attach(node);
    node.querySelectorAll('[data-mud]').forEach(attach);
    reveal.scan(node);
  };

  const sweep = () => {
    for (const [el, byName] of instances) {
      if (el.isConnected) continue;
      for (const instance of byName.values()) safeDispose(instance);
      instances.delete(el);
    }
  };

  let sweepQueued = false;
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes') {
        scan(m.target);
        continue;
      }
      m.addedNodes.forEach(scan);
      if (m.removedNodes.length && !sweepQueued) {
        sweepQueued = true;
        queueMicrotask(() => { sweepQueued = false; sweep(); });
      }
    }
  });

  scan(root);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-mud', 'data-mud-reveal'] });

  const controller = {
    /** Re-scans root, e.g. after markup was inserted outside MutationObserver's reach. */
    refresh() { scan(root); },
    dispose() {
      observer.disconnect();
      for (const byName of instances.values()) for (const instance of byName.values()) safeDispose(instance);
      instances.clear();
      reveal.dispose();
      controllers.delete(root);
    },
  };
  controllers.set(root, controller);
  return controller;
}

function safeDispose(instance) {
  try { instance?.dispose?.(); } catch (e) { console.error('[MudTail] dispose failed', e); }
}
