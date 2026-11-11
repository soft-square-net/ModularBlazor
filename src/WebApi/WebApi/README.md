# WebApi: runtime module prototype

Research prototype: **Minimal API + Carter** host that installs, activates and unloads modules **while running**,
from an uploaded `.dll`, `.zip` (build output) or `.nupkg`. No restart needed for install, activate or deactivate.

| Project | Role |
|---|---|
| `WebApi` | Host. `Modularity/` holds the runtime. |
| `WebApi.Contracts` | `IRuntimeModule` + `ModuleManifest`. Referenced by the host, so it is always shared. |
| `WebApi.Modules.Greeting` | Sample module, **not** referenced by the host. Zip its `bin/<Configuration>/net10.0` and upload it. |

## Lifecycle

```
upload ─► Install ─► Activate ─────────► Deactivate ─► Unload ─► Uninstall
          │          │                    │             │
          │          ├ load assembly      ├ routes 404  ├ dispose module services
          │          ├ build services     │             ├ evict framework caches
          │          └ map routes (hot)   │             └ unload AssemblyLoadContext
          └ read manifest in a throw-away load context, register it (modules.json)
```

The desired state is persisted in the catalog (`modules.json` plus packages, under a cross-process lock). Every replica
converges on it in `ModuleRuntime.SyncAsync`:

- on startup
- after each of its own lifecycle calls
- when another replica publishes `ModuleStateChanged`

The broadcast runs over the RabbitMQ fanout exchange `modules.state`, enabled when `ConnectionStrings:broker` is set (`ModuleStateBus.cs`).

Pool configuration:

- `Modules:Pool`: the pool name.
- `Modules:Role`: `Api` maps routes; `Worker` only loads modules.
- `Modules:Enabled`: which modules this pool applies.

A re-install or a settings change swaps to a fresh copy without a 404 window. See `src/Aspire/Hybird` for the multi-pool lab.

| Endpoint | |
|---|---|
| `GET /api/admin/modules` | Registered modules: state, loaded, live routes |
| `POST /api/admin/modules` (form field `package`) | Install |
| `POST /api/admin/modules/{id}/activate` | Load if needed, then map routes |
| `POST /api/admin/modules/{id}/deactivate` | Remove routes; stays loaded |
| `POST /api/admin/modules/{id}/unload` | Remove routes, dispose, unload assemblies |
| `PUT /api/admin/modules/{id}/settings` | Replace settings; applied on the next load |
| `DELETE /api/admin/modules/{id}` | Unload, delete files, unregister |
| `GET /api/admin/modules/unloading` | Unloaded contexts not yet collected |

A module's endpoints are served under `/api/{RoutePrefix}` and appear in `/openapi/v1.json` while the module is active.

## How each problem is solved

| Problem | Solution (`Modularity/`) |
|---|---|
| Route table is built at startup | `ModuleEndpointDataSource`: an `EndpointDataSource` added once; a change token rebuilds routing. |
| Carter's `MapCarter()` scans at startup only | `ICarterModule.AddRoutes()` is called against a private `ModuleRouteBuilder`, under a group `/api/{prefix}`. |
| DI container is frozen after startup | `ModuleContainer`: an overlay container per module. Module services are built there; everything else comes from the host (`ILogger`, options, scoped request services). |
| Type identity (`IRuntimeModule`, `ICarterModule`) | `ModuleLoadContext`: any assembly the host ships comes from the default context; private dependencies (e.g. Humanizer) load into the module's collectible context, from bytes, so files are never locked. |
| Module services per request | Each module endpoint runs with `HttpContext.RequestServices` set to a module scope layered over the request scope. |
| OpenAPI | `IActionDescriptorChangeProvider` plus a subscribed `EndpointDataSource`, so docs add and drop module routes. |

## Unloading (measured with heap dumps)

Physical unload means the assemblies' memory is actually freed. It needed fixes for framework caches that hold
module types forever (found with `dotnet-dump gcroot`):

| Holder | Fix |
|---|---|
| Host `JsonOptions.SerializerOptions` caches JSON metadata of module DTOs | Each module gets its **own** `JsonOptions`, configured by the host's own configure actions |
| Host DI caches every type it is asked about | Types that mention a module type are never resolved by the host |
| `ParameterBindingMethodCache` (static; one copy each in Http.Extensions, ApiExplorer, OpenApi) | Entries evicted by reflection (`FrameworkCaches`) |
| `TypeDescriptor` caches | Hot-reload `[MetadataUpdateHandler]` `ClearCache` hooks plus eviction |
| DI `EndpointDataSource` never refreshed (stale list; also stale OpenAPI) | Subscribe once with `GetChangeToken()` |
| ApiExplorer / OpenAPI singletons cache descriptions and schema ids | Refresh ApiExplorer and clear OpenAPI singleton caches on unload |

**Result (sample module):**

- **Without OpenAPI generation:** activate, serve requests and unload all collect in 4 GC passes, repeatedly.
- **After `/openapi/v1.json` was generated** while the module was active: the context is reported under `/unloading`. The last heap dump shows no remaining managed roots, but it is not collected within the test window.

The cache fixes touch framework internals: re-verify after every .NET upgrade. The unload result reports success
honestly.

**Recommendation:**

- Install, activate and deactivate: treat as fully hot.
- Unload and upgrade: treat as "routes gone now, memory reclaimed best-effort". Schedule a rolling restart for guaranteed reclamation, which is normal in the replicated deployment anyway.

## Not covered yet

- **Database:** a real modules schema (DB table) instead of `modules.json`.
- **Security:** authorization on the admin API; package signing and verification.
- **Migrations:** per-module EF Core migrations on activation (once, behind a lock).
- **DI:** keyed services inside modules.
- **Packages:** `.nupkg` dependency restore. Ship dependencies in the `.zip` form instead.
- **In-flight requests:** draining requests during unload.

## Try it

```bash
dotnet build src/WebApi.Modules.Greeting
```

Zip the *contents* of `src/WebApi.Modules.Greeting/bin/Debug/net10.0`, run the host
(`dotnet run --project src/WebApi --launch-profile http`), then use `WebApi.http`.
