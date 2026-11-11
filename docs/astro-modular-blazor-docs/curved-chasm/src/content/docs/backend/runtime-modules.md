---
title: Runtime modules
description: How the WebApi prototype installs, activates and serves a module uploaded while the API runs, on every replica of every pool, without a restart.
sidebar:
  order: 8
---

The prototype in `src/WebApi` shows that a module can be uploaded, activated and served **while the API runs**, and
that every replica of every pool converges on the same module state. It is research code: it proves the mechanism
and measures its limits.

| Project | Role |
| --- | --- |
| `WebApi` | The host. `Modularity/` holds the runtime. The same image runs as every pool. |
| `WebApi.Contracts` | `IRuntimeModule` and `ModuleManifest`. The host references it, so it is always shared. |
| `WebApi.Modules.Greeting` | A sample module. The host does **not** reference it: its build output is zipped and uploaded. |
| `Aspire/Hybird` | A runnable lab: gateway, three pools, broker, Redis, PostgreSQL. See [Hybrid architecture lab](/backend/hybrid-lab/). |

## Lifecycle

```text
upload ─► Install ─► Activate ─────────► Deactivate ─► Unload ─► Uninstall
          │          │                    │             │
          │          ├ load assembly      ├ routes 404  ├ dispose module services
          │          ├ build services     │             ├ evict framework caches
          │          └ map routes (live)  │             └ unload the load context
          └ read the manifest in a throw-away load context, register it in the catalog
```

Each admin call writes a **desired state** to the shared catalog. Every replica then converges on it:

| Desired state | Set by | On every replica whose pool enables the module |
| --- | --- | --- |
| `Installed` | install (new module), unload | Not loaded |
| `Active` | activate | Loaded; routes mapped in `Api` pools |
| `Inactive` | deactivate | Routes removed; stays loaded if it was loaded |
| removed | uninstall | Unloaded, package deleted |

- **Install** stores the package, reads the manifest from the assembly, and registers it with its default settings.
  Re-installing an existing module is an **upgrade**: it keeps the module's state and swaps every replica to the new
  version.
- **Activate** loads the assembly, builds the module's services and maps its routes. They answer immediately.
- **Deactivate** removes the routes (404) but keeps the module loaded, so activating again is instant.
- **Unload** also disposes the module's services and unloads its assemblies; see
  [Unloading runtime modules](/backend/runtime-module-unloading/).
- **On startup** a replica converges on the catalog, so modules marked `Active` come back online.

The prototype's catalog is `modules.json` plus the packages, in one folder shared by every replica; the real host
keeps it in the modules schema.

## A module

```csharp
public sealed class GreetingModule : IRuntimeModule
{
    public ModuleManifest Manifest { get; } = new("greeting", "Greeting", "1.0.0", "greeting")
    {
        DefaultSettings = new Dictionary<string, string?> { ["Greeting:Prefix"] = "Hello" }
    };

    public void ConfigureServices(IServiceCollection services, IConfiguration settings)
    {
        services.Configure<GreetingOptions>(settings.GetSection("Greeting"));
        services.AddSingleton<GreetingCounter>();
        services.AddScoped<GreetingService>();
    }
}

public sealed class GreetingEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        app.MapGet("/{name}", (string name, GreetingService greetings) => greetings.Greet(name));
    }
}
```

Its endpoints are served under `/api/{RoutePrefix}` (here `/api/greeting/...`) and appear in `/openapi/v1.json`
while the module is active.

## Pools and replicas

The same image runs as every pool. Three settings decide what an instance does:

| Setting | Values | Effect |
| --- | --- | --- |
| `Modules:Pool` | a name (`core`, `sales`, `worker`) | Shown in status and logs; the origin of broadcast messages |
| `Modules:Role` | `Api` (default) or `Worker` | `Api` maps the routes of active modules; `Worker` loads them (services, consumers) without routes |
| `Modules:Enabled` | list of module ids; empty means all | The pool applies only these modules and ignores the rest of the catalog |

An admin call reaches **one** replica, through the gateway. Without help, the other replicas would never hear about
it: before the broadcast existed, activating `greeting` this way left `/api/greeting` answering 404 on three of the
four sales replicas. So module state is a **shared catalog plus a broadcast**:

```text
admin call ─► any replica ─► catalog (modules.json + packages, cross-process lock): desired state per module
                    │
                    ├─► SyncAsync here
                    └─► RabbitMQ fanout "modules.state" ─► every other replica ─► SyncAsync
```

- **The catalog is the source of truth.** Writes happen under a cross-process lock. The `ModuleStateChanged`
  message only says "something changed", so a lost message is repaired by the next one, or by the sync that runs on
  startup and right after subscribing.
- **`SyncAsync` is idempotent.** It unloads modules that are no longer wanted here, swaps modules whose package or
  settings changed, then brings every enabled module to its desired state.
- **Every replica binds its own exclusive queue** to the `modules.state` fanout exchange, so each one receives every
  change. A replica ignores its own messages: it has already applied the change.
- **The broadcast is optional.** It is enabled when `ConnectionStrings:broker` is set
  (`builder.AddRuntimeModuleBroadcast("broker")`); a single instance without a broker works the same, minus the
  broadcast.

### Swap without downtime

A re-install (newer `InstalledAt`) or a settings change makes each replica **swap**: it loads a fresh copy, replaces
the old copy's routes with the new ones in one data-source update, and only then releases the old copy. Requests
never see a 404 window: in the lab, an upgrade plus a settings change under load returned 300 of 300 requests
with 200. If the fresh copy fails to load, the replica keeps the running copy and reports the error.

## Four problems and how they are solved

### 1. The route table is built at startup

`ModuleEndpointDataSource` is an `EndpointDataSource` added to the app once, empty. On activation, the module's
`ICarterModule.AddRoutes()` runs against a private `ModuleRouteBuilder`, inside a route group
`/api/{prefix}`. The resulting endpoints go into the data source, which signals its change token, and routing
rebuilds without a restart. Deactivation removes them the same way; a swap replaces them in a single update.

### 2. The DI container is frozen after startup

A module installed later cannot add services to the host's container. `ModuleContainer` is an **overlay
container** per module:

- Module services (`GreetingService`, `GreetingCounter`, `IOptions<GreetingOptions>`) are built in the overlay.
- Everything else (`ILogger`, host options, scoped request services) comes from the host.
- Each module endpoint runs with `HttpContext.RequestServices` set to a module scope layered over the request
  scope, so module scoped services live exactly one request.
- **A type that mentions a module type is always built in the overlay**, even `ILogger<GreetingService>`. The host
  container caches every type it is asked about, and that cache would keep the module in memory forever.

### 3. Type identity across load contexts

Each module loads into its own **collectible `AssemblyLoadContext`** (`ModuleLoadContext`):

- Any assembly the host already ships (framework, Carter, `WebApi.Contracts`) resolves from the host. Otherwise
  the module's `IRuntimeModule` would be a different type from the host's and every cast would fail.
- The module's private dependencies (the sample uses Humanizer) load into its own context, using its
  `.deps.json`.
- Assemblies load **from bytes**, so the package files are never locked and can be replaced while a replica still
  runs the old version.

### 4. OpenAPI must follow the routes

The data source is also registered as an `IActionDescriptorChangeProvider`, and the app's DI-level
`EndpointDataSource` is subscribed at startup. Without that subscription it keeps its first list of endpoints:
OpenAPI goes stale and the old endpoints stay in memory.

## Settings

Manifest defaults are copied into the catalog at install time. The admin can replace them
(`PUT /api/admin/modules/{id}/settings`); every replica that has the module loaded **swaps** to a copy configured
with the new values, without downtime. A re-install keeps the admin's values for keys the new version still has.

## Not covered yet

- A real modules table instead of `modules.json` and a lock file.
- Authorization on the admin API; package signing and verification.
- Running a module's EF Core migrations on activation, once, behind a distributed lock.
- Keyed services inside modules.
- Restoring `.nupkg` dependencies: ship dependencies in the `.zip` form instead.
- Draining in-flight requests before an unload (a swap needs none: the old copy keeps serving until it is replaced).

Endpoints, settings and packaging rules: [runtime modules API reference](/reference/runtime-modules-api/).
