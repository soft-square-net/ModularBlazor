# WebApi: runtime module prototype

Research prototype: **Minimal API + Carter** host that installs, activates and unloads modules **while running**,
from an uploaded `.dll`, `.zip` (build output) or `.nupkg`. No restart needed for install, activate or deactivate.

| Project | Role |
|---|---|
| `WebApi` | Host. `Modularity/` holds the runtime. |
| `WebApi.Contracts` | `IRuntimeModule` + `ModuleManifest`. Referenced by the host, so it is always shared. |
| `WebApi.Modules.Greeting` | Sample module, **not** referenced by the host. Zip its `bin/<Configuration>/net10.0` and upload it. |
| `Modules/Core/WebApi.Modules.Core.*` | Core modules: ship with every release and are seeded as `Active` on first start. See [Core modules](#core-modules). |
| `WebApi.Modules.Pulse` | Sample for [module hosted services and pipelines](#module-hosted-services-pipelines-and-hotunload): a `BackgroundService` and a private pipeline. |
| `Modules/Custom/Shifts`, `Modules/Custom/Content` | Newsroom modules (uploaded like any custom module). See [Newsroom modules](#newsroom-modules-shifts-and-content). |

## Lifecycle

```
upload ─► Install ─► Activate ─────────► Deactivate ─► Unload ─► Uninstall
          │          │                    │             │
          │          ├ load assembly      ├ routes 404  ├ stop hosted services (awaited)
          │          ├ build services     │             ├ dispose module services
          │          ├ start hosted svcs  │             ├ evict framework caches
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
| `GET /api/admin/modules` | Registered modules: state, loaded (`loadedVersion`), live routes, `hostedServices`, `restartRequired` |
| `POST /api/admin/modules` (form field `package`) | Install |
| `POST /api/admin/modules/{id}/activate` | Load if needed, then map routes |
| `POST /api/admin/modules/{id}/deactivate` | Remove routes; stays loaded |
| `POST /api/admin/modules/{id}/unload` | Remove routes, stop hosted services, dispose, unload assemblies. `HotUnload = false`: 409 unless `?deferred=true` |
| `PUT /api/admin/modules/{id}/settings` | Replace settings; applied on the next load |
| `DELETE /api/admin/modules/{id}` | Unload, delete files, unregister. `HotUnload = false`: 409 unless `?deferred=true` |
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
| `TenantDbContext`, `AddTenantDbContext<T>()`, `EfRepository<T>`, `TenantStoreDbContext`, `TenantRegistry`, `TenantDatabases`, `DatabaseProviderAdapter`, `ProviderMigrationsAssembly` | `WebApi.Data` (host-shipped: EF Core 10 with the PostgreSQL, SQL Server, MySQL and Oracle providers, Ardalis.Specification.EntityFrameworkCore) | The data layer modules share. Modules import `WebApi.Data/SharedData.props`: compile against it, never ship it. See [Database engines](#database-engines-and-per-engine-migrations). |
| `ITenantOwned`, entity bases, `IRepository<T>` / `IReadRepository<T>` | `WebApi.SharedKernel` (host-shipped, no EF) | See [Layered modules](#layered-modules-specifications-and-repositories). |
| Middleware, directory cache, `tenants.changed` bus, per-tenant module initialization | `WebApi/Tenancy` | `builder.AddPlatformTenancy("broker")`, `app.UseRouting(); app.UseTenancy();` in `Program.cs`. |
| Directory admin, provisioning, seeding (acme, globex) | `tenancy` core module | Writes the tenant store, then `ITenantDirectory.NotifyChangedAsync`. |

- **Resolution rules:**
  - The `X-Tenant` header wins. If the host name names a different tenant, the request gets 400.
  - With a token, the `tenant` claim must match the request's tenant (403), or is the tenant when the request names none. See [Authentication and authorization](#authentication-and-authorization).
  - An unknown tenant gets 404, a suspended one 403.
  - Module endpoints need a tenant (400 without one) unless they are `.TenantOptional()`. Host endpoints never need one.
  - `greeting`, `identity` and `tenancy` are tenant-optional for now.
- **Database per tenant.** A tenant row names a server (a connection string name, e.g. `tenant-data`) and a database; no secrets in the store. The server's engine can be PostgreSQL, SQL Server, MySQL or Oracle (see below).
  - A module's `TenantDbContext` connects to the current tenant's database. The module's tables are kept apart in it (its own schema, or a table prefix on MySQL and Oracle), with their own migrations history table.
  - `ITenantOwned` rows are stamped with the tenant, filtered by it (global query filter), and refused for another tenant on save. That is defence in depth now, and keeps the shared-database option open.
- **Migrations on activation.** `AddTenantDbContext<T>()` registers an `ITenantInitializer` that migrates the module's schema:
  - for every active tenant when the module loads on a replica;
  - for a tenant when it is created or re-activated.
  It runs behind the engine's own lock per (tenant database, context), so replicas migrate once at a time. A module request waits up to 30 s for its tenant's initialization; a failure gives 503 and is retried on the next request.
- **Unload safety with EF Core.** Each module gets its own EF internal service provider (`TenantEfServices`, disposed with the module), so EF's model and query caches, which are keyed by the module's types, never enter EF's process-wide provider cache. Lifecycle hook: `IModuleLifecycleObserver` (`Loaded` / `ReleasingAsync`, called by `ModuleRuntime`); the initializer cancels and awaits its work and drops the module before the container is disposed.
- **Work outside a request** (worker pool, consumers, jobs): `moduleServices.CreateTenantScope(tenantId)` gives a module scope bound to that tenant. Messages carry the tenant in the `tenant` header (`TenancyNames.MessageHeader`); platform jobs loop over `ITenantDirectory.All`. A module's own `IHostedService`s run on every pool that loads it (see [Module hosted services](#module-hosted-services-pipelines-and-hotunload)); they are not tenant-bound, so they loop over tenants or read the message header themselves.
- **Elsa (future workflow module):** Elsa's tenant id is the platform tenant id. An Elsa `ITenantResolver` reads `ITenantContext`, an `ITenantsProvider` reads `ITenantDirectory`, and the module refreshes Elsa's tenants on `tenants.changed`, so the tenant store stays the only source. Elsa keeps its own shared database with `TenantId` columns, not `TenantDbContext`. It must run on the host's EF Core version.
- **No Finbuckle:** the in-house layer is small, and Finbuckle's startup-registered stores, per-tenant options and shared-database focus fit this runtime poorly. Modules only see `ITenantContext`, so it could be swapped in later.
- **Without a tenant store** (a single local instance, no `ConnectionStrings:TenantStore`), the directory reads `Tenancy:Tenants` from the host configuration and the tenancy write endpoints return 503.

**Adding tenant data to a module:** see `Modules/Custom/Inventory` (the sample).
1. Import `SharedData.props`, or name the project `*.Infrastructure` (see below).
2. Derive from `TenantDbContext` (set `Schema`, configure in `ConfigureModel`).
3. Call `services.AddTenantDbContext<T>()`. That also registers `IRepository<T>` and `IReadRepository<T>`.
4. Add an `IDesignTimeDbContextFactory` that returns `new MyContext(TenantDbDesignTime.Options<MyContext>(args), TenantDbDesignTime.Tenant)`.
5. Add migrations, one set per engine, with the script (see below):

```powershell
./src/WebApi/scripts/Add-Migration.ps1 -Project src/WebApi/Modules/Custom/Inventory/WebApi.Modules.Inventory.Infrastructure -Name <Name>
```

## Database engines and per-engine migrations

Tenant databases, and the tenant store, can live on any of four engines, each with an EF Core 10 provider shipped by the host:

| Engine | Provider (version) | A tenant's database | A module's tables | Migration lock |
|---|---|---|---|---|
| PostgreSQL | `Npgsql.EntityFrameworkCore.PostgreSQL` 10.0.3 | a database | schema `<module>` | `pg_advisory_lock` |
| SQL Server | `Microsoft.EntityFrameworkCore.SqlServer` 10.0.14 | a database | schema `<module>` | `sp_getapplock` (session) |
| MySQL | `MySql.EntityFrameworkCore` 10.0.12 (Oracle's) | a database | prefix `<module>_` | `GET_LOCK` |
| Oracle | `Oracle.EntityFrameworkCore` 10.23.26400 | a schema-only user (`NO AUTHENTICATION`), signed in through the server account (proxy authentication: `User Id=<TENANT>; Proxy User Id=<server account>`) | prefix `<module>_` | `DBMS_LOCK` (on the server account) |

- **Oracle and proxy authentication:**
  - The first design selected the tenant schema with `ALTER SESSION SET CURRENT_SCHEMA`. It broke in the lab: EF's Oracle provider checks for its history table in `USER_TABLES`, which lists the *signed-in* user's tables.
  - The second replica therefore saw no history table, tried to create it again and failed with ORA-00955. It kept failing on every retry.
  - Signing in as the tenant user (through the server account) makes the session's own schema the tenant's.
  - Provisioning creates the user, grants `CREATE SESSION`, `CREATE TABLE`, `SEQUENCE`, `VIEW`, `PROCEDURE` and `TRIGGER`, and `GRANT CONNECT THROUGH <server account>`.
  - Provisioning is idempotent: `POST /api/tenancy/tenants/{id}/provision` re-runs it as a repair step. Modules whose initialization failed retry on their next request.

- **Why these packages:** Pomelo's MySQL provider stops at EF Core 9 (9.0.0), so MySQL uses Oracle's `MySql.EntityFrameworkCore`, as the old host did. `System.Security.Cryptography.Pkcs` (from the MySQL and Oracle clients) is pinned to 10.0.15 because the transitive 9.0.11 has known vulnerabilities.
- **Servers are configuration:** `ConnectionStrings:<server>` plus `DatabaseServers:<server>:Provider` (`PostgreSql` when not set). The tenant store uses `DatabaseServers:TenantStore:Provider`.
  - A tenant names a server, so tenants of one deployment can sit on different engines. A dedicated customer deployment can use its own SQL Server or Oracle for everything.
  - `POST /api/tenancy/tenants {"id":"contoso","databaseServer":"tenant-sql"}` provisions the tenant on that server: it creates the database (on Oracle, the schema user) and every active module then migrates into it. An unknown server gets 400.
- **Engine differences live in one place:** `DatabaseProviderAdapter` handles connection strings, EF registration, creating the database, the lock and module isolation. `ModuleIsolation` applies the schema or prefix and the history table name (`<module>.__EFMigrationsHistory`, or `__EFMigrationsHistory_<module>`).
- **Migrations ship inside the module assembly, one set per engine:** `Migrations/<Provider>/` with the namespace `….Migrations.<Provider>`.
  - `ProviderMigrationsAssembly` replaces EF's `IMigrationsAssembly` and keeps only the set (and model snapshot) of the engine the tenant's database runs on.
  - They apply on activation: when the module loads on a replica (for every active tenant), and when a tenant is created or re-activated.
  - Installing a module only stores the package; nothing runs until it is activated.
  - An assembly without per-engine namespaces works as before, with a single set.
- **EF internal providers:** each module gets one per engine it is used with (`TenantEfServices.For(provider)`), so each engine has its own model cache. All are disposed with the module.
- **Adding a migration:** `scripts/Add-Migration.ps1` runs `dotnet ef migrations add` once per engine (`-- --provider <Provider>` selects the engine in the design-time factory). It handles two dotnet-ef behaviours that break several sets in one project:
  - dotnet-ef updates the snapshot it finds by file name anywhere in the project, so the other engines' snapshots are hidden while one engine is scaffolded;
  - a set's first snapshot is written to a folder derived from the namespace, so the script moves it into the set.
  The script also sets `EfDesignAssets=all` and rebuilds without it afterwards. Tenant store: `-Project src/WebApi/WebApi.Data -Context TenantStoreDbContext -MigrationsDir Migrations/TenantStore -Namespace soft.square.net.WebApi.Data.TenantStore.Migrations`.
- **Packages stay small:** module references to the host-shipped projects carry `ExcludeAssets="runtime;native"`. Otherwise the providers' client libraries (SqlClient, MySql.Data, ODP.NET, Azure.Identity and their native files) were copied into every module package. A module package is its own assemblies only.
- **Production notes:**
  - Oracle: the server account needs `CREATE USER`, `ALTER USER` (for `CONNECT THROUGH`), `GRANT ANY PRIVILEGE` and `EXECUTE` on `DBMS_LOCK`; the lab uses SYSTEM.
  - Verified at runtime: tenant databases on all four engines. The tenant store on SQL Server, MySQL and Oracle is only generated and model-checked; the lab keeps the store on PostgreSQL.
  - SQL Server provisioning needs `CREATE DATABASE`.
  - Run provisioning with a privileged account and serve tenants with a least-privilege one (not modelled yet).

## Layered modules, specifications and repositories

Business modules (content, shifts, sales) use clean-architecture layers. Small glue modules (`identity`, `tenancy`,
`greeting`) stay single projects: three projects there add build and packaging overhead without protecting any domain logic.

```
Modules/<Name>/
  WebApi.Modules.<Name>.Domain          aggregates, rules, DomainException      → WebApi.SharedKernel
  WebApi.Modules.<Name>.Application     use cases, specifications, DTOs         → Domain, WebApi.Contracts
  WebApi.Modules.<Name>.Infrastructure  IRuntimeModule, endpoints, DbContext,   → Application, WebApi.Data, Carter
                                        migrations (the entry assembly)
```

- **Build setup:** `Modules/Directory.Build.props` picks each layer's references by project-name suffix, so a layer project only references the layer below it.
  - Every host-shipped assembly (SharedKernel, Contracts, Data, EF Core, Ardalis, Carter) is compiled against and never shipped.
  - The package is the Infrastructure output: the module's three assemblies and nothing else.
  - Other project names are not affected.
- **Endpoints live in the entry assembly:** the runtime maps only the `ICarterModule` types of the assembly that holds `IRuntimeModule`.
- **`WebApi.SharedKernel`** (host-shipped, no EF): `IAggregateRoot`, `EntityBase<TId>`, `AggregateRoot<TId>`, `ITenantOwned`, `DomainException`, and `IRepository<T>` / `IReadRepository<T>` (Ardalis.Specification, aggregate roots only).
- **Repositories:** `AddTenantDbContext<T>()` registers `EfRepository<T>` as open generics in the module's container, over its first DbContext. A module with several contexts binds aggregates with `AddTenantRepository<TContext, T>()`.
  - Repositories read and write the current tenant's database.
  - `Add`, `Update` and `Delete` save immediately (Ardalis semantics).
- **Specifications:** reads go through `Specification<T>` / `Specification<T, TResult>`. Lists project to DTOs with `Select` and use `AsNoTracking`.
- **No MediatR:** application services instead. Mediator handler and pipeline caches are keyed by module types and would need the same unload work.
- **Versions:** Ardalis.Specification(.EntityFrameworkCore) 9.3.1 targets EF Core 9 and runs on the host's EF Core 10; this was verified in the lab.

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
| System.Linq.Expressions interpreter: `InstructionList.s_loadFields` (Dictionary by `FieldInfo`), filled when EF evaluates a closure sub-expression such as `Where(i => i.Sku == sku.Trim())`; it kept the specification's closure `FieldInfo`, hence the module. Related caches: `Expression.s_lambdaFactories` / `s_lambdaDelegateCache`, `CallInstruction.s_cache`, `DelegateHelpers._DelegateCache`. gcroot showed only the module's own handles; found by bisecting request kinds, then a reflection walk of every static from a throw-away diagnostic module | All cleared on unload, under their own locks where they have them (`FrameworkCaches.ClearExpressionCaches`) |
| EF Core's static `ConcurrentDictionary<Type, MethodInfo>` keyed by property CLR types that need snapshotting (the modules' enums), and Ardalis.Specification's `IncludeEvaluator` cache of compiled `Include` delegates keyed by (entity type, property type). Found with gcroot on the content and shifts modules: they stayed loaded for more than 3 minutes | Every static dictionary of EF Core and Ardalis.Specification is scanned once; keys that are, or hold, a module type are removed on unload (`FrameworkCaches.EvictLibraryStaticCaches`). Both modules were then collected about 2 s after unloading |

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

## Module hosted services, pipelines and HotUnload

Three runtime capabilities for modules that host more than Carter endpoints (the planned Elsa workflow module in the
`workflow` pool is the driver). Sample: `Modules/Custom/WebApi.Modules.Pulse`.

### Hosted services (`Modularity/ModuleHostedServices.cs`)

A module registers `IHostedService`s in its own `ConfigureServices` as usual (`services.AddHostedService<T>()`, a
`BackgroundService`). The generic host only runs services registered at startup, so the runtime runs these:

- **Start:** when the copy is loaded on a replica, on **Api and Worker pools** alike (consumers and schedulers run on
  worker pools too). Only the module's own registrations are started, never the host's. They start on a clean
  `ExecutionContext`, as under the generic host, so a `BackgroundService` does not keep the activation request's
  `AsyncLocal`s. `IHostedLifecycleService` hooks are called.
- **Stop:** in reverse order, awaited, before the copy's container is disposed:
  - on unload and uninstall;
  - on a swap (re-install, upgrade, settings change): the old copy stops before the new copy starts, so two copies
    never consume or schedule at the same time. Routes still swap without a 404 window;
  - on host shutdown (`ModuleReconciler.StopAsync` → `ModuleRuntime.StopAllAsync`).
- **Timeout:** `Modules:HostedServiceTimeout` (default 10 s) bounds each start, and all of a module's stops together.
- **Failures** never crash the host or the other services. A constructor or `StartAsync` exception, a start or stop
  timeout, or a faulted `BackgroundService.ExecuteTask` is logged and shown per service in `GET /api/admin/modules`:

  ```json
  "hostedServices": [
    { "service": "soft.square.net.WebApi.Modules.Pulse.PulseWorker",  "state": "Running",     "error": null },
    { "service": "soft.square.net.WebApi.Modules.Pulse.StartupProbe", "state": "StartFailed", "error": "Pulse:FailOnStart is true." }
  ]
  ```

  States: `Starting`, `Running`, `Completed`, `Faulted`, `StartFailed`, `StartTimedOut`, `Stopping`, `Stopped`,
  `StopFailed`, `StopTimedOut`. The report keeps names and messages only, never types, so it cannot pin the module.
  A stop timeout is also added to the unload result's `note`: a service still running keeps the module loaded.
- **Deactivate** removes routes only; hosted services keep running while the copy is loaded. Unload to stop them.
- Hosted services are not tenant-bound: they loop over `ITenantDirectory.All` or read the message's tenant header,
  and use `CreateTenantScope(...)`.

### Module pipeline (`IModulePipeline`, `Modularity/ModulePipelines.cs`)

**Contract:** an optional interface in `WebApi.Contracts`, implemented by the module's `IRuntimeModule` class:

```csharp
public interface IModulePipeline
{
    void ConfigurePipeline(IApplicationBuilder app);                     // middleware + endpoints, the normal way
    void ConfigureEndpoint(IEndpointConventionBuilder endpoint) { }       // conventions for the host-side catch-all route
}
```

- The runtime maps one catch-all endpoint, `/api/{RoutePrefix}/{**path}`, in the module's route group. It runs a
  private pipeline built once per loaded copy through `ModuleRouteBuilder.CreateApplicationBuilder()`, so
  `app.ApplicationServices` is the module's container. A library that wires itself with `app.UseXyz()`,
  `UseRouting` / `UseEndpoints` or `UseMiddleware<T>` runs unchanged.
- **Semantics of `app.Map(prefix, ...)`:** inside the pipeline `Request.PathBase` is `/api/{prefix}` and
  `Request.Path` is the rest, so routes are relative (`/whoami` serves `/api/pulse/whoami`). The endpoint and route
  values the host matched are cleared, so the pipeline's own `UseRouting` matches again. Everything is restored afterwards.
- **Same `HttpContext`:** the host's middleware has already run for the catch-all route: authentication
  (`HttpContext.User` from JwtBearer), tenant resolution and authorization. `RequestServices` is a module scope.
  **Authorization is decided on the catch-all**, so its metadata belongs in `ConfigureEndpoint`: `RequirePermission(...)`,
  `AllowAnonymous()`, `TenantOptional()`. Without any, the fallback policy requires a signed-in caller.
  `ModuleAuthorization.Validate` checks the catch-all like any module endpoint. Finer checks inside the pipeline are
  the library's own (`UseAuthorization` there uses the host's handlers).
- **The module's Carter routes win:** they are more specific than the catch-all, so a module can mix both.
- **Stays unloadable:** routing inside the pipeline is kept module-local. `UseEndpoints` registers its data sources in
  `IOptions<RouteOptions>`; in the host's options they would join the host's route table forever, so the module gets its
  own `RouteOptions`. The host's `DfaMatcherFactory` resolves the matcher's disposable `DataSourceDependentMatcher.Lifetime`
  from the host root, which keeps it until the host is disposed, so the module gets its own factory and lifetime
  registration. Both are internal types reached by reflection (a warning is logged if they change); re-verify after a
  .NET upgrade.
- Not covered: the host's `LinkGenerator` does not see pipeline endpoints; there is one pipeline per module, at its prefix.

### `ModuleManifest.HotUnload` (default `true`)

For modules (or hosted libraries) with process-wide state that pins their assemblies. When `false`:

| Action | Result |
|---|---|
| `POST …/{id}/unload`, `DELETE …/{id}` | **409** `"cannot be unloaded while the host runs (HotUnload is false)"` |
| … with `?deferred=true` | 200: the catalog changes now and routes go now; the loaded copies keep running until the next restart (`restartRequired: true`) |
| Re-install, upgrade, settings change | No swap: the replica keeps serving the old copy and reports `restartRequired: true`, with `loadedVersion` ≠ `module.version`. The next restart loads the new one. |
| Deactivate / activate | Work as usual (routes off and on; the copy and its hosted services stay) |
| Host shutdown | Hosted services are stopped and services disposed, as for any module |

The value is stored in the catalog (`hotUnload`), so the 409 applies on every replica. In sync, the loaded copy's own
value decides, so an upgrade to a hot-unloadable version still waits for the restart.

### Verified (2026-11-12, standalone host, `dotnet user-jwts` admin token)

- **Hosted services:** after activate, `PulseWorker` runs and `/api/pulse/status` counts beats. A settings change swapped
  the copy: the log shows the old worker stopping and its services stopped (28 ms) before the new worker started. With
  `Pulse:FailOnStart=true`, `StartupProbe` is reported `StartFailed` with its message and the module keeps serving.
- **Pipeline:** `/api/pulse/whoami` returned 401 without a token. With the token it returned 200 with
  `{"authenticated":true,"name":"admin","roles":["platform-admin"],"pathBase":"/api/pulse","path":"/whoami","endpoint":"HTTP: GET /whoami"}`
  and the module middleware's `X-Pulse-Beats` header. Also verified:
  - the inline middleware's `/ping` short-circuit;
  - a `POST /echo/{word}` minimal API with a JSON body;
  - 404 for unknown paths;
  - the Carter route `/api/pulse/status` next to the catch-all, anonymous.
- **HotUnload = false** (`-p:PulseHotUnload=false`):
  - unload and DELETE gave 409;
  - re-installing 1.0.1 gave `version 1.0.1`, `loadedVersion 1.0.0`, `restartRequired: true`, and the old copy kept serving;
  - deactivate gave 404 and activate 200 again;
  - `unload?deferred=true` removed the routes and kept the copy;
  - after a restart, 1.0.1 loaded.
- **Unload measurement** (fresh process per run, two runs each; requests served, then unload; `/unloading` polled):

  | Module | Requests before unload | Unload's own 20 GC passes | +5 s | +10 s | +20 s | +40 s |
  |---|---|---|---|---|---|---|
  | Greeting (baseline, this build) | 6 | not collected | listed | **collected** | collected | collected |
  | Pulse (running `BackgroundService` + pipeline with `UseRouting`/`UseEndpoints`) | 12 | not collected | listed | **collected** | collected | collected |

  Pulse with a running hosted service and a private routing pipeline unloads exactly like the baseline in both runs.
  The baseline itself now collects by +10 s rather than +5 s, as in the earlier measurement. The difference is a host
  difference (after the auth merge) and was not investigated. One copy released by a *swap* during a live session was
  collected only between +20 s and +30 s (single observation, not repeated).
- **Not verified on a running host:** stopping module hosted services on host shutdown. Graceful shutdown could not be
  triggered from the test shell on Windows (no console Ctrl+C); the path (`ModuleReconciler.StopAsync`) is code-reviewed only.

## Authentication and authorization

Foundation of the agreed auth design (docs site: Backend → Authentication and authorization). Every replica checks
tokens and has the final say; permissions are looked up on the server, never carried in the token.

```
request ─► UseRouting ─► UseAuthentication (JwtBearer) ─► UseTenancy (tenant + claim check) ─► UseAuthorization ─► endpoint
                                                                                                 │
              PermissionRequirement ─► IAccessScopes ─► GrantCache (per tenant+user, 5 min, cleared via "access.grants.changed")
                                                            └─► platform.access_grants (tenant store) │ in memory without a store
```

| Piece | Where | What |
|---|---|---|
| `RequirePermission(...)`, `PermissionRequirement`, `PlatformClaims`, `PlatformRoles`, `PlatformPermissions`, `AccessScope`, `GrantSources`, `IAccessScopes`, `IGrantStore`, `IPermissionCatalog`, `ModuleManifest.Permissions` | `WebApi.Contracts/Security`, `IRuntimeModule.cs` | Everything a module sees. Host types only: nothing in the authorization pipeline can pin a module. |
| JwtBearer, fallback policy, permission handler, grant cache and store, broker invalidation | `WebApi/Security` | `builder.AddPlatformSecurity("broker")`, `app.UseRouting(); app.UsePlatformSecurity();` |
| Activation checks | `Modularity/ModuleAuthorization.cs` | Fails activation (400) on an undeclared permission, a requirement type defined by the module, or a named policy. |
| Grant admin, permission catalog, `/me` with permissions | `identity` core module 1.1.0 | `GET/POST /api/identity/grants`, `DELETE /grants/{id}` (`access.grants.manage`), `GET /permissions`. |

- **Tokens:**
  - `Auth:Authority` points at the identity service (OIDC discovery and JWKS); `Auth:Audience` defaults to `modular-webapi`.
  - Inbound claim mapping is off, so the host reads `sub`, `tenant` and `role` exactly as issued.
  - Without an authority, the standard `Authentication:Schemes:Bearer` section applies. That is what `dotnet user-jwts` writes for development; the signing key sits in the project's user secrets.
- **Secure by default:** every endpoint needs a signed-in caller unless it calls `AllowAnonymous()`. Anonymous today: `/health`, the OpenAPI documents and Scalar (where enabled), and `/api/identity/me`.
- **Permissions:**
  - The endpoint check is coarse: the caller holds the permission in some scope of the request's tenant, or through a platform role.
  - Per-resource checks are module code: `IAccessScopes.HasPermissionAsync(permission, [AccessScope.Press(p), AccessScope.Category(c)])`.
  - List filters use `ScopesAsync(permission)`.
  - The rights of another user (an assignee, say) come from `UserHasPermissionAsync`.
- **Grants:**
  - A grant is a tenant × user × permission × scope (`tenant`, `press:{id}`, `category:{id}`) with an optional `validFrom`/`validTo` (UTC) and a source (`standing`, `shift:{id}`).
  - Windows are evaluated at check time, so a shift grant starts and ends on the clock without any cache event.
  - `IGrantStore.ReplaceSourceAsync` publishes a rota in one transaction; `EndAsync` ends a user's grants of a source early (check-out).
  - Platform permissions can't be granted (400). `access.grants.manage` is the exception, because tenant admins need it.
- **Platform roles:** `platform-admin` holds every platform permission (`platform.modules.manage`, `platform.tenants.manage`, `access.grants.manage`) in any tenant and without one. Other mappings come from `Access:Roles:{role}:N`.
- **Protected host and core endpoints:**
  - `/api/admin/modules` needs `platform.modules.manage`.
  - Tenant create and update need `platform.tenants.manage`.
  - The grant API needs `access.grants.manage`.
- **Without a tenant store**, grants are in memory, seeded from `Access:Grants:N:{Tenant,UserId,Permission,Scope}`.

**Development tokens:**

```bash
dotnet user-jwts create --project src/WebApi/WebApi --name admin --role platform-admin
dotnet user-jwts create --project src/WebApi/WebApi --name editor1 --claim tenant=acme
```

`user-jwts` tokens have `aud` set to the launch-profile URLs (`http://localhost:5298`, `https://localhost:7276`).
Replicas on other ports need `--audience` or `Authentication:Schemes:Bearer:ValidAudiences`. The Hybird lab gets real
tokens once the identity service exists.

**Verified** (standalone host on :5298; grants both in memory and in Postgres):
- **Protection:** the admin API returns 401 anonymous, 403 for an editor and 200 for `platform-admin`. Tenant writes return 403 for an editor.
- **Tenant match:** a token for `acme` with `X-Tenant: globex` gets 403.
- **Grants:**
  - Added and revoked grants take effect on the next request.
  - A grant whose `validFrom` is in the future is not yet effective.
  - Granting a platform permission returns 400.
- **Activation checks:** a test module was refused (400) for an undeclared permission, and again for its own requirement type. The declared version served 403, then 200 after the grant.
- **Unload:** that module unloaded, but only after the synchronous 20-pass check. `/unloading` was empty a little later. The variants that never served requests behaved the same, so the delay isn't specific to authorization.
- **Postgres:** the `AddAccessGrants` migration ran there (migrations exist for all four engines; SQL Server, MySQL and Oracle weren't run).

## Newsroom modules (shifts and content)

Two custom modules implement the newsroom scenario of the auth design. They never reference each other: they meet
only through grants. A published rota becomes grants via `IGrantStore`; the content module checks them via `IAccessScopes`.

```
shifts:  section (categories) + shift (UTC window) + rota (Manager, Desk, Editor) ─publish─► IGrantStore.ReplaceSourceAsync("shift:{id}")
                                                                                              │  valid from start to the member's end
content: article workflow ─► IAccessScopes.HasPermissionAsync(permission, [press:{p}, category:{c}]) ◄┘  (evaluated per request)
```

| Module | Projects | Schema | Routes (`/api/...`) |
|---|---|---|---|
| `shifts` 0.1.0 | `Modules/Custom/Shifts/WebApi.Modules.Shifts.{Domain,Application,Infrastructure}` | `shifts` | `sections`, `sections/{id}/settings`, `shifts`, `shifts/{id}/publish`, `shifts/{id}/check-out`, `shifts/{id}/members/{user}/check-out`, `mine`, `overdue` |
| `content` 0.1.0 (starter) | `Modules/Custom/Content/WebApi.Modules.Content.{Domain,Application,Infrastructure}` | `content` | `presses`, `categories`, `articles` (`?view=Mine\|Queue\|Review\|Desk`), `articles/{id}` and `/submit`, `/accept`, `/assign`, `/approve`, `/return`, `/transfer`, `/schedule`, `/publish`, `articles/publish-due` |

- **Rota roles:**

  | Role | Grants (on the section's categories, during the shift only) |
  |---|---|
  | Manager | `content.accept`, `content.assign`, `content.transfer`, `content.return` |
  | Desk | `content.publish`, `content.return` |
  | Editor | `content.review` |

  - Standing grants come from admins: `content.author` (press or category), `content.editor`, `content.manage`, `shifts.view`, `shifts.manage`.
  - A member's grants end at the scheduled end, or earlier when they or the whole shift check out.
  - Changing the rota, the times, or the section's categories rewrites the grants.
- **Workflow:**
  - **States:** Draft → Submitted → Accepted → InReview → Approved → Scheduled → Published. Returned, and AwaitingDeskReapproval after an edit while approved or scheduled.
  - **Owner edits:** in Draft or Returned, or within `Content:OwnerEditWindow` (24 h) after submitting, until a manager accepts or assigns the article.
  - **Assigning:** the assignee must hold `content.review` on the article right now.
  - **Publishing your own work:** a Desk user who wrote or reviewed the article also needs a standing `content.editor` grant on its category.
  - **Scheduled publishing:** a schedule is tied to the version it was made for; `publish-due` publishes only unchanged articles.
  - **History:** every change is recorded in the article's history (who, what, the resulting state).
- **Concurrency:** every change sends the article's `version`, which is also an EF concurrency token. A stale version gets 409, and of two racing assignments the second gets 409.
- **Settings:** `Shifts:AutoAssignDelay` (5 min) and `Shifts:CheckoutGrace` (15 min) can be overridden per section (`sections/{id}/settings`). They are consumed by the coming Elsa module, which will auto-assign and auto-check-out via `overdue`.
- **Categories:** category ids are unique within the tenant (e.g. `ahram-sports`), so `category:{id}` identifies one category even when a section spans presses.
- **Engines:** migrations exist for all four engines. `TenantDbContext` now stores every `DateTimeOffset` as UTC on MySQL.

**Verified** (test host on a throwaway PostgreSQL, tenant `nr` provisioned through `tenancy`, user-jwts tokens):
- **Setup:** both modules installed and activated. Publishing the rota gave the manager the shift permissions; before publishing there were none.
- **Authoring:** create needs `content.author`. Edits work in Draft and within the window; a stale version gets 409, and the owner is locked out after accept (409).
- **Scope:** the manager's queue shows only the section's category. An article in another category returns 404 to them.
- **Assignment:** assigning someone not on shift gets 409. 4 parallel assigns gave one 200 and three 409.
- **Review and publishing:** reviewer edit and approval, Desk schedule, Desk edit → AwaitingDeskReapproval, then publish. History records every step.
- **Check-out:** checking a member out ends their access (their edit gets 403). Transfer sets `transferredFromShift`, and Desk can return an article to its author.
- **Self-publish:** allowed with a standing `content.editor` grant on the category, refused (403) without it.
- **Time windows:** a future shift's grants are not yet effective. A whole-shift check-out empties the manager's permissions and queue.
- **Unload:** both modules unload and are collected (see the EF Core / Ardalis row under Unloading).
- **Not run:** the SQL Server, MySQL and Oracle migrations.

## Not covered yet

- **Database:** a real modules schema (DB table) instead of `modules.json`.
- **Security:** package signing and verification.
- **Auth:**
  - The identity service (OpenIddict) is not built yet.
  - Membership checks per request: revocation over the broker from the identity service.
  - Gateway token checks.
  - Grant templates for the shifts module and Elsa.
- **Tenancy:** per-tenant module enablement (plans), per-tenant module settings, dropping a module's schema on uninstall.
- **Workers:** a broker consumer abstraction for modules (hosted services run; a module brings its own client today).
- **Pipelines:** host `LinkGenerator` does not know endpoints inside a module pipeline; only one pipeline per module, at its prefix.
- **DI:** keyed services inside modules.
- **Packages:** `.nupkg` dependency restore. Ship dependencies in the `.zip` form instead.
- **In-flight requests:** draining requests during unload.

## Try it

```bash
dotnet build src/WebApi/Modules/Custom/WebApi.Modules.Greeting
```

Zip the *contents* of `src/WebApi/Modules/Custom/WebApi.Modules.Greeting/bin/Debug/net10.0`, run the host
(`dotnet run --project src/WebApi/WebApi --launch-profile http`), then use `WebApi.http`.

Pulse (hosted services and pipeline) works the same way: build `src/WebApi/Modules/Custom/WebApi.Modules.Pulse`, zip
its output, then install and activate it as `pulse`. For the HotUnload case, build with
`-p:PulseHotUnload=false -p:PulseVersion=1.0.1`. Don't use `-p:Version`: it is a global property and re-versions
`WebApi.Contracts` too.
