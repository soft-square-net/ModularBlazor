// Browser side of the module lifecycle. .NET (ActiveModuleService) calls activate/deactivate with one message per
// module; everything a module put on the page is recorded here so deactivate can take exactly that out again.
//
// A module script is an ES module. It may export:
//   default function(ctx)  or  init(ctx)   - runs on activation; may return an object (kept, see moduleHost.get)
//   dispose()                              - runs on deactivation (also looked up on the returned object)
// ctx = { moduleId }.
window.moduleHost = (() => {
  const registry = new Map(); // moduleId -> { styles: HTMLElement[], scripts: { mod, api }[] }
  const OWNER_ATTR = 'data-module';

  const safeDispose = (target, id) => {
    if (typeof target?.dispose !== 'function') return;
    try {
      Promise.resolve(target.dispose()).catch(e => console.error(`[module ${id}] dispose failed`, e));
    } catch (e) {
      console.error(`[module ${id}] dispose failed`, e);
    }
  };

  // spec = { styles: [{ id, css?, href? }], scripts: [{ id, code?, url? }] } -> string[] of per-script errors
  async function activate(moduleId, spec) {
    deactivate(moduleId); // activating twice must not leave two copies behind

    const entry = { styles: [], scripts: [] };
    registry.set(moduleId, entry);

    for (const s of spec?.styles ?? []) {
      let el;
      if (s.css != null) {
        el = document.createElement('style');
        el.textContent = s.css;
      } else if (s.href) {
        el = document.createElement('link');
        el.rel = 'stylesheet';
        el.href = s.href;
      } else continue;

      el.id = s.id;
      el.setAttribute(OWNER_ATTR, moduleId);
      document.head.appendChild(el);
      entry.styles.push(el);
    }

    const errors = [];
    for (const s of spec?.scripts ?? []) {
      let url = s.url;
      let blobUrl = null;
      if (s.code != null) {
        // sourceURL makes the script show up as a named file in the browser dev tools.
        const code = `${s.code}\n//# sourceURL=module://${moduleId}/${s.id}.js`;
        blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        url = blobUrl;
      }
      if (!url) continue;

      try {
        const mod = await import(/* @vite-ignore */ url);
        const ctx = { moduleId };
        const init = typeof mod.default === 'function' ? mod.default : mod.init;
        const api = typeof init === 'function' ? await init(ctx) : null;
        entry.scripts.push({ mod, api });
      } catch (e) {
        errors.push(`${s.id}: ${e?.message ?? e}`);
      } finally {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      }
    }

    return errors;
  }

  function deactivate(moduleId) {
    const entry = registry.get(moduleId);
    if (!entry) return;

    for (const s of entry.scripts.reverse()) {
      safeDispose(s.api, moduleId);
      if (s.api !== s.mod) safeDispose(s.mod, moduleId);
    }
    for (const el of entry.styles) el.remove();

    registry.delete(moduleId);
  }

  return {
    activate,
    deactivate,
    isActive: moduleId => registry.has(moduleId),
    // The object the module's script returned, for other scripts that need to talk to it.
    get: (moduleId, index = 0) => registry.get(moduleId)?.scripts[index]?.api ?? null,
  };
})();
