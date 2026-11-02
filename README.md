# Modular Blazor WebAssembly client

A standalone Blazor WebAssembly app that loads its features as **modules** (`.dll` or `.nupkg`) at runtime,
with pluggable **layouts** that are modules too.

| Phase | When | What happens |
|---|---|---|
| 1. Startup | before first render | `modules/core.json` is read; every module with `loadOnStartup` is downloaded (default layout, login page + auth layout). |
| 2. After login | `AuthService.LoginAsync` | The user's module **metadata** is fetched (`modules/user-modules.{role}.json`, replace with your API). No module code is downloaded yet; the menu is built from the metadata. |
| 3. On navigation | `Router.OnNavigateAsync` | The URL is matched against each module's `routePrefixes`. If the module isn't loaded, it (and its `dependencies`) is downloaded, its assemblies are added to `Router.AdditionalAssemblies`, and routing continues. |

## Run it

```bash
./build-modules.sh            # or .\build-modules.ps1  - builds modules into src/ModularBlazor.Client/wwwroot/modules
dotnet run --project src/ModularBlazor.Client
```

Sign in with any user/password. User name `admin` gets the admin modules (and the lazily loaded admin layout);
anything else gets Dashboard + Reports. The Home page shows each module's state as you navigate.

Target framework is set once in `Directory.Build.props` (net10.0). If you use another version, change it there,
the `10.0.*` package versions in `src/ModularBlazor.Client/*.csproj` and `modules/client/Directory.Build.props`.

## Layout

```
src/ModularBlazor.Abstractions   contracts: ModuleDescriptor, [LayoutKey], [UseLayout], IAuthService, IModuleNavigation
src/ModularBlazor.Client         host: ModuleManager, NuPkgReader, App.razor (Router), ModuleRouteView
src/Aspire/Host                  Aspire AppHost: runs API, client, Postgres and Redis in containers
src/api/ModularBlazor.Host       minimal API: login + module catalog, documented with NSwag, ReDoc and Scalar
src/api/_Framework/Core          shared kernel (BaseEntity, IAggregateRoot, IRepository, IDbInitializer, DatabaseProvider); carries the MediatR, FluentValidation and Ardalis.Specification packages
src/api/_Framework/Infrastructure  multi-tenancy, EF Core providers, ModuleDbContext, Ardalis repository, MediatR/validation wiring (AddHostModules)
modules/host/Auth, Catalog       API host modules, each as Domain / Application / Infrastructure projects (see below)
modules/client/Layouts.Default          dll, startup   - sidebar layout            [LayoutKey("default")]
modules/client/Layouts.Admin            dll, lazy      - top-bar layout (dependency of Module.Admin) [LayoutKey("admin")]
modules/client/Module.Auth              dll, startup   - /login + auth layout      [LayoutKey("auth")]
modules/client/Module.Dashboard         dll, lazy      - /dashboard
modules/client/Module.Reports           nupkg, lazy    - /reports, /reports/{id}, ships reports.css
modules/client/Module.Admin             dll, lazy      - /admin, /admin/users (role: admin)
```

## Module descriptor (JSON)

```json
{
  "id": "Module.Reports", "name": "Reports", "version": "1.0.0",
  "kind": "nupkg",                       // "dll" | "nupkg"
  "url": "modules/Module.Reports.1.0.0.nupkg",
  "sha256": "optional hex digest of the downloaded file",
  "loadOnStartup": false,
  "requiresAuth": true, "requiredRole": "admin",
  "routePrefixes": ["reports"],          // base-relative, no leading slash
  "layout": "default",                   // key of a layout registered with [LayoutKey]
  "dependencies": ["Layouts.Admin"],     // loaded first
  "extraAssemblies": [],                 // dll only: private dependency dlls
  "styles": ["reports.css"],             // dll: urls; nupkg: paths under the package's staticwebassets/
  "hidden": false,
  "nav": [{ "title": "Reports", "href": "reports", "order": 20 }]
}
```

## Writing a module

A module is a Razor class library that references `ModularBlazor.Abstractions`. Pages use `@page` as usual.

* **Layout module:** a `LayoutComponentBase` with `@attribute [LayoutKey("my-layout")]`. Any module can ship one; a
  module's pages choose it via `"layout"` in the descriptor, or a page can pick with `@attribute [UseLayout("my-layout")]`.
  Layout precedence: page `@layout` > `[UseLayout]` > descriptor `layout` > `default`.
* **Services:** inject `IAuthService` / `IModuleNavigation` (provided by the host). Don't reference the host project.
* **.dll:** build and publish just `Module.X.dll`. **.nupkg:** `dotnet pack`; the loader takes `lib/<best tfm>/*.dll`
  and `.css` under `staticwebassets/`.

## Things to know

* **Trimming is disabled** in the host (`PublishTrimmed=false`). Modules are unknown at publish time and may use any
  framework API; a trimmed host would throw `MissingMethodException`. Keep it off.
* **No unloading.** WebAssembly can't unload assemblies. Logging out removes the user's metadata and menu, and
  `ModuleRouteView` re-checks auth and `requiredRole` on every page render, so cached modules stay protected.
* **NuGet dependencies are not resolved.** Only the assemblies inside the package are loaded. Bundle private
  dependencies in the package's `lib/<tfm>/` folder; anything already loaded in the host is skipped.
* **Version alignment.** Modules compile against the host's framework version; keep them on the same major.
* **Security.** Loading code is code execution. Serve modules from a trusted origin, set `sha256` in descriptors that
  come from your API, and enforce authorization on the server too: client-side checks are UX, not protection.
* **Hosting `.dll` files.** Some static hosts (IIS, some CDNs) refuse to serve `.dll`. Rename the files and change
  `url` in the descriptor; the loader reads the assembly name from the file's metadata, not from the file name.
* **Sub-path hosting.** Set `<base href>` in `wwwroot/index.html`; all module URLs and routes are base-relative.

## API (`src/api/ModularBlazor.Host`)

A minimal API that serves the module catalog and a demo login. Run it with `dotnet run --project src/api/ModularBlazor.Host`
(http://localhost:5100).

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` | Demo sign-in, returns role + demo token |
| `GET /api/modules/core` | Startup modules (public) |
| `GET /api/me/modules` | Modules for the signed-in user (`Authorization: Bearer <token>`) |

API documentation (on in Development, or set `Documentation:Enabled=true`):

* **NSwag** generates the OpenAPI document at `/openapi/v1.json`
* **ReDoc** (NSwag) at `/redoc`
* **Scalar** at `/scalar` (the default landing page), reading the same document

To make the client use the API, set `ModuleOptions.CoreManifestUrl` / `UserModulesUrl` to the API URLs and send the
bearer token when fetching `/api/me/modules`. The login and token handling in the API are demo-only.

The API host references the framework `Infrastructure` and each host module's `Infrastructure` project.

### Host modules (`modules/host`, clean architecture)

Features of the API live in `modules/host/<Module>/`, each module being three projects:

| Project | Holds | References |
|---|---|---|
| `<Module>.Domain` | entities and aggregate roots (`BaseEntity<TId>`, `IAggregateRoot`) | Core |
| `<Module>.Application` | CQRS: MediatR commands/queries + handlers, FluentValidation validators, Ardalis specifications, ports such as `ITokenService` | Core, Domain |
| `<Module>.Infrastructure` | Carter endpoints, the module `DbContext` + entity configurations, `DbInitializer`, the `IHostModule` entry point | Application, Domain, framework `Infrastructure` |

```
modules/host/Auth/    Auth.Domain (User) | Auth.Application (LoginCommand) | Auth.Infrastructure (AuthDbContext, LoginEndpoint, AuthModule)
modules/host/Catalog/ Catalog.Domain (ModuleRegistration) | Catalog.Application (GetCoreModules/GetModulesForRole queries) | Catalog.Infrastructure
```

Request flow: Carter endpoint -> `ISender.Send(command)` -> validation behavior (FluentValidation, failures become a 400
problem response) -> handler -> `IRepository<T>` / `IReadRepository<T>` (Ardalis.Specification over the module's DbContext).

**Packages.** `Ardalis.Specification.EntityFrameworkCore` and `FluentValidation.DependencyInjectionExtensions` are in the framework
`Infrastructure`. MediatR, FluentValidation and `Ardalis.Specification` (abstractions only) are referenced by `Core`, because the
Application projects must compile against them without depending on Infrastructure; they reach Application through its Core
reference. MediatR is pinned to 12.x (Apache-2.0); 13+ requires a license key.

**Data.** Each module has its own `DbContext` deriving from `ModuleDbContext` (entity configurations in the assembly are applied
automatically), its own tables (`Auth_Users`, `Catalog_Modules`) and its own migrations history table
(`__EFMigrationsHistory_<Module>`). The context connects to the resolved tenant's database, or to the default database
(`ConnectionStrings:TenantStore`) when the request has no `X-Tenant`. With `Database:MigrateOnStartup=true` each module's
`IDbInitializer` migrates and seeds the default database (tenant databases are not touched). The module catalog is now stored
in `Catalog_Modules` and seeded with the demo modules; sign-in registers unknown users in `Auth_Users` on first login.

**Adding a module:** create the three projects under `modules/host/<Name>` (the folder's `Directory.Build.props` sets names and
references), implement `IHostModule` in the Infrastructure project (register the DbContext with `AddModuleDbContext`, repositories
with `AddModuleRepository`, the initializer as `IDbInitializer`), reference the Infrastructure project from
`ModularBlazor.Host.csproj` and the migrations projects, and add the module to `HostModules.cs`. Assembly names are
`soft.square.net.ModularBlazor.Host.Modules.<Module>.<Layer>`.

### Domain model, persistence and tenants (modelled on FullStackHero .NET v10, with Ardalis.Specification)

**Core (`src/api/_Framework/Core`)**: `BaseEntity<TId>` (with domain events), `AggregateRoot<TId>`, `AuditableAggregateRoot<TId>`
(audit fields + soft delete), `ValueObject`, `DomainEvent`, `IRepository<T>` / `IReadRepository<T>` (Ardalis),
`PaginationFilter` / `PagedResponse<T>`, and the specifications `EntitiesByBaseFilterSpec<T>`,
`EntitiesByPaginationFilterSpec<T>` and their projecting `<T, TResult>` versions (keyword search over text properties,
`OrderBy` like `["Name", "CreatedOnUtc desc"]`, skip/take; use `repository.PaginatedListAsync(spec, filter)`).

**Infrastructure**: `BaseDbContext` (soft-delete query filter, column conventions), `AuditingInterceptor` (CreatedOnUtc/By,
LastModifiedOnUtc/By, delete -> soft delete), `DomainEventsInterceptor` (publishes events through MediatR after a save),
`ModuleDbContext`, `EfRepository<TContext, T>`, `DbInitializer<TContext>`. Unlike FullStackHero's shared-database mode there is no
row-level `TenantId`: every tenant has its own database.

**Tenants**: `AppTenantInfo` (Id, Identifier, Name, Provider, ConnectionString, AdminEmail, IsActive, ValidUpto, Issuer) in the
tenant store (`TenantStoreDbContext`); `ITenantService` (create, get, search, activate, deactivate, renew) and
`ITenantDatabaseInitializer` (migrate + seed the tenant store, the root tenant `root`, platform data, then every tenant's
database). `UseTenantStatus()` answers 403 for a deactivated tenant or one whose `ValidUpto` has passed. The root tenant owns the
default database (`ConnectionStrings:TenantStore`), also used when a request has no `X-Tenant`.

**Multitenancy host module** (`modules/host/Multitenancy`, admin only: `Authorization: Bearer demo-admin`):

| Endpoint | Purpose |
|---|---|
| `POST /api/tenants` | create a tenant, then provision its database (migrate + seed); recorded in `TenantProvisioning` |
| `GET /api/tenants?keyword=&orderBy=&pageNumber=&pageSize=` | page through tenants |
| `GET /api/tenants/{id}` | one tenant |
| `POST /api/tenants/{id}/activate`, `/deactivate`, `/upgrade` (`{"months": 12}`) | status and subscription |
| `GET /api/tenants/provisioning`, `POST /api/tenants/{id}/provisioning/retry` | provisioning log and retry |

### Multi-tenancy and migrations

`src/migrations/{SqlServer,PostgreSql,MySql}` hold the migrations, one project per provider (`MySql` uses Oracle's `MySql.EntityFrameworkCore`)
(assemblies `ModularBlazor.Migrations.*`, selected by name in `DatabaseProviders`). Each provider project has a migration set per
context: `Migrations/App` (per-tenant `AppDbContext`), `Migrations/TenantStore`, `Migrations/Auth`, `Migrations/Catalog` and `Migrations/Multitenancy`.

```bash
dotnet tool install --global dotnet-ef
scripts/add-migration.sh AddNotes        # or .\scripts\add-migration.ps1 AddNotes
```

No migrations are generated yet; run the script once to create the initial ones. Set `MIGRATIONS_CONNECTION` to point
the tooling at a specific database (generation itself does not need one). Adding a tenant means inserting an
`AppTenantInfo` row (Id, Identifier, Name, Provider, ConnectionString) and applying the `App` migrations to its database.

### Run everything in containers (Aspire, `src/Aspire/Host`)

```bash
dotnet run --project src/Aspire/Host      # needs Docker running; dashboard at http://localhost:15888
```

| Resource | What it is | URL / port |
|---|---|---|
| `postgres` | standalone PostgreSQL server container, data in volume `modularblazor-postgres-data`, database `ModularBlazorTenants` | localhost:5432 |
| `redis` | standalone Redis container used as the cache server, data in volume `modularblazor-redis-data` | localhost:6379 |
| `host-api` | `ModularBlazor.Host`, built from `src/api/ModularBlazor.Host/Dockerfile` | http://localhost:5100 (`/scalar`, `/redoc`) |
| `client` | `ModularBlazor.Client`, built from `src/ModularBlazor.Client/Dockerfile` (modules built, then served by nginx) | http://localhost:5000 |

Aspire passes the API its connection strings as `ConnectionStrings__TenantStore` (Postgres, using the container's network
name) and `ConnectionStrings__redis`, and sets `TenantStore__Provider=PostgreSql` and `Database__MigrateOnStartup=true`.
The Postgres password is the `postgres-password` parameter in `src/Aspire/Host/appsettings.json` (dev default: `postgres`;
use user-secrets for anything real).

`ModularBlazor.Host/appsettings.json` points at the same containers for running the API outside Docker
(`Host=localhost;Port=5432;...`, `localhost:6379`). Generate the migrations (`scripts/add-migration.*`) before the first
run: `MigrateOnStartup` applies the tenant-store migrations from `ModularBlazor.Migrations.PostgreSql`.

The client is a static site and still reads its module manifests from its own `wwwroot/modules/*.json`; pointing it at the
API is a separate step.



> **EF Core:** all EF Core packages are on 10.x. MySQL uses Oracle's `MySql.EntityFrameworkCore`; the Pomelo provider had no
> EF Core 10 release yet (newest on nuget.org was 9.0.0, which requires EF Core 9). To switch to Pomelo later, replace the
> package and the `UseMySQL` call in `DatabaseProviders.cs` with `UseMySql(connectionString, serverVersion, ...)`.

### Naming

All assemblies, root namespaces and namespaces are prefixed with `soft.square.net` (e.g. `soft.square.net.ModularBlazor.Core`,
`soft.square.net.Module.Dashboard`). The prefix is the `SoftSquarePrefix` property in the root `Directory.Build.props`, which also sets
`AssemblyName` and `RootNamespace` for every project. Module **ids** in the manifests (`Module.Dashboard`, ...) stay short and
logical; only the served files carry the prefix (`modules/soft.square.net.Module.Dashboard.dll`,
`soft.square.net.Module.Reports.1.0.0.nupkg`).
