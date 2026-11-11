---
title: Runtime modules
description: How the WebApi prototype installs, activates and serves a module uploaded while the API runs, without a restart.
sidebar:
  order: 7
---

The prototype in `src/WebApi` shows that a module can be uploaded, activated and served **while the API runs**.
It is research code: it proves the mechanism and measures its limits.

| Project | Role |
| --- | --- |
| `WebApi` | The host. `Modularity/` holds the runtime. |
| `WebApi.Contracts` | `IRuntimeModule` and `ModuleManifest`. The host references it, so it is always shared. |
| `WebApi.Modules.Greeting` | A sample module. The host does **not** reference it: its build output is zipped and uploaded. |

## Lifecycle

```text
upload ─► Install ─► Activate ─────────► Deactivate ─► Unload ─► Uninstall
          │          │                    │             │
          │          ├ load assembly      ├ routes 404  ├ dispose module services
          │          ├ build services     │             ├ evict framework caches
          │          └ map routes (live)  │             └ unload the load context
          └ read the manifest in a throw-away load context, register it
```

- **Install** stores the package, reads the manifest from the assembly, and registers it with its default
  settings. Nothing stays loaded.
- **Activate** loads the assembly, builds the module's services and maps its routes. They answer immediately.
- **Deactivate** removes the routes (404) but keeps the module loaded, so activating again is instant.
- **Unload** also disposes the module's services and unloads its assemblies; see
  [Unloading runtime modules](/backend/runtime-module-unloading/).
- **The desired state is persisted.** On startup, every module marked `Active` is activated again.

The prototype stores registrations in `modules.json`; the real host keeps them in the modules schema.

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

## Four problems and how they are solved

### 1. The route table is built at startup

`ModuleEndpointDataSource` is an `EndpointDataSource` added to the app once, empty. On activation, the module's
`ICarterModule.AddRoutes()` runs against a private `ModuleRouteBuilder`, inside a route group
`/api/{prefix}`. The resulting endpoints go into the data source, which signals its change token, and routing
rebuilds without a restart. Deactivation removes them the same way.

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
- Assemblies load **from bytes**, so the package files are never locked and can be replaced.

### 4. OpenAPI must follow the routes

The data source is also registered as an `IActionDescriptorChangeProvider`, and the app's DI-level
`EndpointDataSource` is subscribed at startup. Without that subscription it keeps its first list of endpoints:
OpenAPI goes stale and the old endpoints stay in memory.

## Settings

Manifest defaults are copied into the registration at install time. The admin can replace them
(`PUT /api/admin/modules/{id}/settings`); they reach `ConfigureServices` on the next load. A reinstall keeps the
admin's values for keys the new version still has.

## Not covered yet

- A real modules table instead of `modules.json`.
- Authorization on the admin API; package signing and verification.
- Broadcasting state changes so every replica converges (a `ModuleStateChanged` event on the broker; replicas that
  start later read the desired state at boot).
- Running a module's EF Core migrations on activation, once, behind a distributed lock.
- Keyed services inside modules.
- Restoring `.nupkg` dependencies: ship dependencies in the `.zip` form instead.
- Draining in-flight requests during unload.

Endpoints and packaging rules: [runtime modules API reference](/reference/runtime-modules-api/).
