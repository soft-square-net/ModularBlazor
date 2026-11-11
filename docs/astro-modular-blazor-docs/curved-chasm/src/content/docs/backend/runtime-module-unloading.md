---
title: Unloading runtime modules
description: What keeps an unloaded module in memory, how each holder was found with heap dumps and fixed, and what is still open.
sidebar:
  order: 9
---

Removing a module's routes is easy. **Freeing its memory** means the runtime must collect its
`AssemblyLoadContext`, which only happens when nothing anywhere references any of its types. ASP.NET Core keeps
several process-wide caches that do exactly that.

## How the holders were found

1. Activate the sample module, optionally call it or generate OpenAPI, then unload it.
2. The unload checks a `WeakReference` to the load context after several garbage collections.
3. If it is still alive, take a heap dump and ask what keeps the module's `LoaderAllocator` alive:

```bash
dotnet-dump collect -p <pid> --type Heap -o module.dmp
dotnet-dump analyze module.dmp -c "dumpheap -type LoaderAllocator" -c "gcroot <address>"
```

4. Fix the holder, repeat.

## What held modules, and the fixes

| Holder | Fix |
| --- | --- |
| The host's `JsonOptions.SerializerOptions` caches JSON metadata for the module's request and response types, created when endpoints are built | Each module gets its **own** `JsonOptions`, configured by the host's own configure actions, so the cache dies with the module |
| The host DI container caches every type it is asked about | Types that mention a module type are never resolved by the host (see the [overlay container](/backend/runtime-modules/#2-the-di-container-is-frozen-after-startup)) |
| `ParameterBindingMethodCache`, a static cache of Minimal API parameter binding. It is shared source: Http.Extensions, ApiExplorer and OpenApi each compile their own copy | Module types evicted from every copy, by reflection |
| `TypeDescriptor` caches | The framework's hot-reload `[MetadataUpdateHandler]` `ClearCache` hooks, plus eviction of `s_defaultProviderInitialized` |
| The DI-level `EndpointDataSource` never refreshed, so it kept old endpoints (and served stale OpenAPI) | Subscribe to it once at startup with `GetChangeToken()` |
| ApiExplorer keeps the last computed descriptions | Recompute them right after the module's routes are removed |
| OpenAPI singletons cache schema ids by type and operation contexts by id | Their caches are cleared on unload; the next document request rebuilds them |

Collection also needs patience: the loader allocator is freed by finalizers, so the unload waits between
garbage-collection passes instead of spinning.

## Results with the sample module

| Scenario | Result |
| --- | --- |
| Activate, then unload | Collected after 4 passes |
| Activate, call GET and POST endpoints, unload | Collected after 4 passes |
| Repeated unload and activate cycles | Collected every time |
| `/openapi/v1.json` generated while the module was active, then unload | **Not collected** within the test window. The last heap dump shows no managed roots left, only the runtime's internal loader handles. The context is listed under `GET /api/admin/modules/unloading` |
| Upgrades and settings changes across 8 replicas ([lab](/backend/hybrid-lab/)) | Swapped-out copies often stay under `/unloading` for a while; later heap dumps showed only the active copy in each replica |

The unload result reports what really happened (`unloaded`, `gcPasses`), so the admin is never told memory was
freed when it was not.

## Caveats

- Most fixes reach into **framework internals** by reflection. Re-verify them after every .NET upgrade; the unload
  result and the `/unloading` list show at once when one breaks.
- A module with **static state, threads or timers** that it does not stop on dispose will never unload. Modules
  must release everything in `IDisposable` / `IAsyncDisposable` services.

## Recommendation

| Operation | Treat as |
| --- | --- |
| Install, activate, deactivate | Fully live: no restart |
| Upgrade, settings change | Live swap with no 404 window; the old copy's memory is reclaimed best-effort |
| Unload | Routes gone immediately; memory reclaimed best-effort |
| Guaranteed memory reclamation | A rolling restart, which the [replicated deployment](/backend/deployment-scenarios/) does anyway |
