# WebApi: runtime module prototype

Research prototype: **Minimal API + Carter** host that installs, activates and unloads modules **while running**,
from an uploaded `.dll`, `.zip` (build output) or `.nupkg`. No restart needed for install, activate or deactivate.

| Project | Role |
|---|---|
| `WebApi` | Host. `Modularity/` holds the runtime. |
| `WebApi.Contracts` | `IRuntimeModule` + `ModuleManifest`. Referenced by the host, so it is always shared. |
| `WebApi.Modules.Greeting` | Sample module, **not** referenced by the host. Zip its `bin/<Configuration>/net10.0` and upload it. |
| `Modules/Core/WebApi.Modules.Core.*` | Core modules: ship with every release and are seeded as `Active` on first start. See [Core modules](#core-modules). |

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

A module's endpoints are served under `/api/{RoutePrefix}` and get their own OpenAPI document while the module is routed.

## OpenAPI and Scalar

On in Development, or anywhere with `OpenApi:Enabled=true` (`OpenApi/ModularOpenApi.cs`).

| URL | Content |
|---|---|
| `/openapi/webapi.json` | The host's built-in endpoints: module admin, `/api/pool`, `/health` |
| `/openapi/modules/{id}.json` | One module's endpoints; **404** unless the module is routed on this replica |
| `/openapi` | The documents available right now: `[{name, title, url, isDefault}]` |
| `/scalar` (`/` redirects) | Scalar; its document switcher lists the same documents and is rebuilt on every page load |

- **Per-module documents:** modules arrive after the DI container is built, so they cannot be registered as named
  OpenAPI documents. The host registers two: `webapi`, which filters out every endpoint carrying
  `RuntimeModuleMetadata`, and an internal `modules` slot. `/openapi/modules/{id}.json` sets the requested module in an
  `AsyncLocal`, and the slot's `ShouldInclude` keeps only that module's endpoints. The document is generated on demand
  through `IOpenApiDocumentProvider` and is not cached.
- **Which modules are listed:** read from the live module endpoints, so a module drops out of Scalar as soon as it is
  deactivated or unloaded. Core modules are listed like any other.
- **Module services are not request bodies:** ApiExplorer asks the host container whether a parameter is a service, and
  the host does not know module services. `ModuleServiceParameterFilter` drops the inferred body of module endpoints
  whose request delegate declared none (no `IAcceptsMetadata`).
- **Behind the gateway:** documents are per replica, so they show what that pool routes. The gateway's
  `/pools/{pool}/**` routes send `X-Forwarded-Prefix: /pools/{pool}`; their default X-Forwarded prefix transform is off,
  because it would overwrite the header. The URLs in `/openapi` and each document's server URL are built from the
  header. It is used only for the docs; routing ignores it. Scalar resolves document URLs against its own page path by
  itself. So `/pools/sales/scalar` lists `greeting`, and "Try it" stays on `/pools/sales/...`. The gateway root `/scalar` reaches the core pool.

## Core modules

Core modules are ordinary runtime modules (same load context, overlay container, swap and broadcast) that the
**release** delivers instead of an admin upload. They are not compiled into the host, so they stay deactivatable,
unloadable and upgradeable.

| Module | Project (`src/WebApi/Modules/Core/`) | Routes |
|---|---|---|
| `identity` | `WebApi.Modules.Core.Identity` | `GET /api/identity/me`, `/users`, `/users/{userName}` (users from the module's settings) |
| `tenancy` | `WebApi.Modules.Core.Tenancy` | `GET /api/tenancy/tenants`, `/tenants/{id}`, `/current`; `POST /tenants` (provisions the tenant's database), `PATCH /tenants/{id}` (rename, hosts, suspend). See [Multi-tenancy](#multi-tenancy). |

- **Packaging:** `WebApi.csproj` builds every `Modules/Core/*/*.csproj` (a `ProjectReference` without the assembly)
  and copies each one's output to `CoreModules/<AssemblyName>/` in the build output, and on publish to the publish
  folder. Shared project setup lives in `Modules/Core/Directory.Build.props`. To add one: create
  `Modules/Core/WebApi.Modules.Core.<Name>/` with an `IRuntimeModule`, add it to the solution, enable it in a pool.
- **Seeding:** on startup, before the first sync, `ModuleRuntime.SeedCoreModulesAsync` registers each shipped package
  under the catalog lock (concurrent replicas seed once):
  - not in the catalog → installed as `Active`, with `Core: true` and the package hash;
  - different package hash and a shipped version ≥ the catalog's → upgraded in place; the admin's state and settings are kept;
  - the catalog holds a newer version (an older replica during a rolling release) → left alone, never downgraded.
  If anything changed, the replica publishes `core-seeded` so replicas that are already running re-sync.
- **Admin rules:** activate, deactivate, unload and settings work as for any module, and the state survives restarts
  (seeding never resets it). `DELETE` returns **409**, and so does uploading a package with a core module's id:
  core modules are upgraded only by a release. The admin API itself stays compiled into the host.
- **Pools:** no special case. A core module is in the shared catalog for every pool, and a pool applies it only if
  `Modules:Enabled` lists it (or the list is empty).
- `Modules:CorePath` (default `CoreModules`, relative to the app base directory) points elsewhere if needed.
- **Dev note:** a rebuild changes the package hash, so a restarted replica re-seeds (swap) the module even at the
  same version. In a lab that runs replicas from different builds of the same version they would keep re-seeding;
  bump the version for real releases.

## Multi-tenancy

The host resolves the tenant of every request on every replica of every pool; the `tenancy` core module owns the
admin side (writing the tenant store, provisioning). Pools that don't load `tenancy` (sales, worker) still know every
tenant, because they read the tenant store themselves.

```
request ─► host middleware (Tenancy/): X-Tenant header, then host name (X-Forwarded-Host), then the token's "tenant" claim
              │                         └─ tenant directory: TenantStore (schema "platform"), in memory per replica,
              │                            reloaded on startup, every 5 min and on the broker fanout "tenants.changed"
              ├─► ITenantContext (scoped, host) ─► any module service injects it (the module scope falls back to the host)
              └─► module endpoint ─► waits until the module is initialized for this tenant (migrations), then runs
```

| Piece | Where | What |
|---|---|---|
| `ITenantContext`, `TenantInfo`, `ITenantDirectory`, `ITenantInitializer`, `IModuleActivation`, `.TenantOptional()`, `CreateTenantScope(...)`, `TenancyNames` | `WebApi.Contracts/Tenancy` | Everything a module sees. Host-shipped, so one type identity and nothing that pins a module. |
| `TenantDbContext`, `ITenantOwned`, `AddTenantDbContext<T>()`, `TenantStoreDbContext`, `TenantRegistry`, `TenantDatabases` | `WebApi.Data` (new, host-shipped: EF Core 10 + Npgsql) | The data layer modules share. Modules import `WebApi.Data/SharedData.props`: compile against it, never ship it. |
| Middleware, directory cache, `tenants.changed` bus, per-tenant module initialization | `WebApi/Tenancy` | `builder.AddPlatformTenancy("broker")`, `app.UseRouting(); app.UseTenancy();` in `Program.cs`. |
| Directory admin, provisioning, seeding (acme, globex) | `tenancy` core module | Writes the tenant store, then `ITenantDirectory.NotifyChangedAsync`. |

- **Resolution rules:**
  - The `X-Tenant` header wins. If the host name names a different tenant, the request gets 400.
  - Once tokens exist, the `tenant` claim must match the request's tenant (403), or is the tenant when the request names none.
  - An unknown tenant gets 404, a suspended one 403.
  - Module endpoints need a tenant (400 without one) unless they are `.TenantOptional()`. Host endpoints never need one.
  - `greeting`, `identity` and `tenancy` are tenant-optional for now.
- **Database per tenant.** A tenant row names a server (a connection string name, e.g. `tenant-data`) and a database; no secrets in the store.
  - A module's `TenantDbContext` connects to the current tenant's database, inside the module's own schema, with its own `__EFMigrationsHistory`.
  - `ITenantOwned` rows are stamped with the tenant, filtered by it (global query filter), and refused for another tenant on save. That is defence in depth now, and keeps the shared-database option open.
- **Migrations on activation.** `AddTenantDbContext<T>()` registers an `ITenantInitializer` that migrates the module's schema:
  - for every active tenant when the module loads on a replica;
  - for a tenant when it is created or re-activated.
  It runs behind a Postgres advisory lock per (tenant database, context), so replicas migrate once at a time. A module request waits up to 30 s for its tenant's initialization; a failure gives 503 and is retried on the next request.
- **Unload safety with EF Core.** Each module gets its own EF internal service provider (`TenantEfServices`, disposed with the module), so EF's model and query caches, which are keyed by the module's types, never enter EF's process-wide provider cache. Lifecycle hook: `IModuleLifecycleObserver` (`Loaded` / `ReleasingAsync`, called by `ModuleRuntime`); the initializer cancels and awaits its work and drops the module before the container is disposed.
- **Work outside a request** (worker pool, consumers, jobs): `moduleServices.CreateTenantScope(tenantId)` gives a module scope bound to that tenant. Messages carry the tenant in the `tenant` header (`TenancyNames.MessageHeader`); platform jobs loop over `ITenantDirectory.All`. Module consumers and hosted services themselves are not supported by the runtime yet.
- **Elsa (future workflow module):** Elsa's tenant id is the platform tenant id. An Elsa `ITenantResolver` reads `ITenantContext`, an `ITenantsProvider` reads `ITenantDirectory`, and the module refreshes Elsa's tenants on `tenants.changed`, so the tenant store stays the only source. Elsa keeps its own shared database with `TenantId` columns, not `TenantDbContext`. It must run on the host's EF Core version.
- **No Finbuckle:** the in-house layer is small, and Finbuckle's startup-registered stores, per-tenant options and shared-database focus fit this runtime poorly. Modules only see `ITenantContext`, so it could be swapped in later.
- **Without a tenant store** (a single local instance, no `ConnectionStrings:TenantStore`), the directory reads `Tenancy:Tenants` from the host configuration and the tenancy write endpoints return 503.

**Adding tenant data to a module:** see `Modules/WebApi.Modules.Inventory` (the sample).
1. Import `SharedData.props`.
2. Derive from `TenantDbContext` (set `Schema`, configure in `ConfigureModel`).
3. Call `services.AddTenantDbContext<T>()`.
4. Add an `IDesignTimeDbContextFactory` with `TenantDbDesignTime`.
5. Add migrations. dotnet-ef needs the shared assemblies next to the module only at design time, so set `EfDesignAssets=all` for the command and build again without it before packaging:

```bash
EfDesignAssets=all dotnet ef migrations add <Name> --project src/WebApi/Modules/WebApi.Modules.Inventory --output-dir Migrations
```

## How each problem is solved

| Problem | Solution (`Modularity/`) |
|---|---|
| Route table is built at startup | `ModuleEndpointDataSource`: an `EndpointDataSource` added once; a change token rebuilds routing. |
| Carter's `MapCarter()` scans at startup only | `ICarterModule.AddRoutes()` is called against a private `ModuleRouteBuilder`, under a group `/api/{prefix}`. |
| DI container is frozen after startup | `ModuleContainer`: an overlay container per module. Module services are built there; everything else comes from the host (`ILogger`, options, scoped request services). |
| Type identity (`IRuntimeModule`, `ICarterModule`) | `ModuleLoadContext`: any assembly the host ships comes from the default context; private dependencies (e.g. Humanizer) load into the module's collectible context, from bytes, so files are never locked. |
| Module services per request | Each module endpoint runs with `HttpContext.RequestServices` set to a module scope layered over the request scope. |
| OpenAPI | `IActionDescriptorChangeProvider` plus a subscribed `EndpointDataSource`, so docs add and drop module routes; one document per routed module (see [OpenAPI and Scalar](#openapi-and-scalar)). |

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
| `ReflectTypeDescriptionProvider._typeData` (per-type data of TypeDescriptor's default provider, behind `TypeDescriptor.s_providerTable`) | Evicted by walking the provider chain (`FrameworkCaches.EvictTypeDescriptionProviders`), plus that type's static Type-keyed Hashtables |
| EF Core's static internal service provider cache (model cache keyed by the module's DbContext type) | Avoided: each module has its own EF internal provider (`TenantEfServices` in `WebApi.Data`), disposed with the module |
| OpenTelemetry `LogRecordSharedPool` (2048 slots): idle records keep their last exception, state and attributes. Found with gcroot after EF logged a `DbUpdateException` (→ change tracker → module DbContext) | Idle records' data cleared on unload (`FrameworkCaches.ClearIdleLogRecords`) |

**Result (sample module):**

- **Without OpenAPI generation:** activate, serve requests and unload all collect in 4 GC passes, repeatedly.
- **After `/openapi/v1.json` was generated** while the module was active: the context is reported under `/unloading`. The last heap dump shows no remaining managed roots, but it is not collected within the test window. (Since fixed; see below.)

**Re-measured 2026-11-11 (Greeting, fresh process per run, two runs each).** The table compares a baseline build with the
old single `v1.json`, the per-module documents, and the per-module documents plus the TypeDescriptor fix below:

| Generated while the module was active | Old (`v1.json`) | Per-module documents | + TypeDescriptor fix |
|---|---|---|---|
| Nothing | collected by +5 s | collected by +5 s | collected by +5 s |
| The host document only | not collected after 20 s | not collected after 20 s | **collected by +5 s** |
| The module's own document | (same document) | not collected after 20 s | **collected by +5 s** |

**Root cause of the OpenAPI pin, found by bisecting:**

1. Calling ApiExplorer's `EndpointMetadataApiDescriptionProvider` once, without any OpenAPI code and without its cache,
   was enough to pin the module.
2. Inside it, `TypeDescriptor.GetConverter(moduleType)` alone pinned it. `ModelMetadata.IsComplexType` makes that call
   for every parameter and response type.
3. The holder is the default `ReflectTypeDescriptionProvider`'s instance dictionary `_typeData`, reached through
   `TypeDescriptor.s_providerTable` → node → provider. The hot-reload `ClearCache` hook does not clear it.
4. `dotnet-dump gcroot` never reported this path: it showed only weak handles, which is why the earlier heap dump showed
   "no remaining managed roots". A reflection walk of the statics found it.

`FrameworkCaches` now evicts the module's types along that chain. Unload, re-activate, regenerate the document and
unload again works repeatedly.

The unload's own 20 GC passes (about 1 s) are still not enough in any case: the module is listed under `/unloading`
first and collected by the next check (2–5 s later), as in the baseline.

The cache fixes touch framework internals: re-verify after every .NET upgrade. The unload result reports success
honestly.

**Recommendation:**

- Install, activate and deactivate: treat as fully hot.
- Unload and upgrade: treat as "routes gone now, memory reclaimed best-effort". Schedule a rolling restart for guaranteed reclamation, which is normal in the replicated deployment anyway.

## Not covered yet

- **Database:** a real modules schema (DB table) instead of `modules.json`.
- **Security:** authorization on the admin API; package signing and verification.
- **Tenancy:** token validation (the `tenant` claim check is in place but no JwtBearer yet), membership checks, per-tenant module enablement (plans), per-tenant module settings, dropping a module's schema on uninstall.
- **Workers:** module consumers and hosted services (the tenant scope primitive exists).
- **DI:** keyed services inside modules.
- **Packages:** `.nupkg` dependency restore. Ship dependencies in the `.zip` form instead.
- **In-flight requests:** draining requests during unload.

## Try it

```bash
dotnet build src/WebApi/Modules/WebApi.Modules.Greeting
```

Zip the *contents* of `src/WebApi/Modules/WebApi.Modules.Greeting/bin/Debug/net10.0`, run the host
(`dotnet run --project src/WebApi/WebApi --launch-profile http`), then use `WebApi.http`.
