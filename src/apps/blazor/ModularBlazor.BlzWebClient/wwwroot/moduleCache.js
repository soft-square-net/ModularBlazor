// Persistent module cache (Cache Storage): downloaded module files survive page reloads, so the next visit starts
// from the cache and only downloads what the catalog says has changed (the key contains the file's SHA-256).
// Every call is best effort: without Cache Storage (insecure context, private mode) it answers "not cached".
window.moduleCache = (() => {
  const NAME = 'modular-blazor-modules-v1';
  const open = () => ('caches' in window ? caches.open(NAME) : Promise.resolve(null));
  // The Cache API needs an http(s) request; the host name is never contacted.
  const toUrl = key => `https://module-cache.invalid/${encodeURIComponent(key)}`;
  const toKey = url => decodeURIComponent(new URL(url).pathname.slice(1));

  return {
    get: async key => {
      try {
        const cache = await open();
        const hit = cache && await cache.match(toUrl(key));
        return hit ? new Uint8Array(await hit.arrayBuffer()) : null;
      } catch { return null; }
    },
    put: async (key, bytes) => {
      try {
        const cache = await open();
        if (cache) await cache.put(toUrl(key), new Response(bytes));
      } catch { /* quota exceeded or storage blocked: the module simply is not cached */ }
    },
    // Removes every entry whose key starts with the prefix (older versions of a module).
    removePrefix: async prefix => {
      try {
        const cache = await open();
        if (!cache) return;
        for (const request of await cache.keys())
          if (toKey(request.url).startsWith(prefix)) await cache.delete(request);
      } catch { }
    },
  };
})();
