# Modular Blazor WebAssembly client

A standalone Blazor WebAssembly app that loads its features as **modules** (`.dll` or `.nupkg`) at runtime,
with pluggable **layouts** that are modules too.

| Phase | When | What happens |
|---|---|---|
| 1. Startup | before first render | the core manifest comes from the API's Catalog (`GET /api/modules/core`, public; `modules/core.json` is only the offline fallback); every module with `loadOnStartup` is downloaded (default layout, login page + auth layout). |
| 2. After login (and after a page reload while signed in) | `JwtAuthenticationService.LoginAsync`, then the login page | The user's module **metadata** is fetched from the Catalog (`GET /api/me/modules`; the `role` claims in the token pick the modules). No module code is downloaded yet; the menu is built from the metadata. |
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
  "styles": ["css/reports.css"],         // path under the module's wwwroot (packaged in the module), or a url
  "scripts": ["js/module.js"],           // optional; defaults to js/module.js when the module has one
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
  and everything under `staticwebassets/`.
* **Static files (css/js):** every file under a module's `wwwroot` is embedded in its assembly
  (`modules/client/Directory.Build.targets`), so a `.dll` module needs nothing else. Reference them in the
  descriptor relative to `wwwroot` (`css/a.css`, `js/module.js`; `wwwroot/` and `_content/<asm>/` prefixes are ignored).
* **Module script:** an ES module whose `default` export (or `init`) runs on activation with `{ moduleId }`, and
  whose `dispose()` (on the module or on the object it returns) runs on deactivation. `Layouts.Admin/node-app`
  builds one with vite (`dotnet build -p:BuildNodeApp=true`). `*.lib.module.js` initializers never run for modules
  loaded at runtime; the host runs `js/module.js` itself.

## Things to know

* **Trimming is disabled** in the host (`PublishTrimmed=false`). Modules are unknown at publish time and may use any
  framework API; a trimmed host would throw `MissingMethodException`. Keep it off.
* **Load once, activate per page.** `ModuleManager` loads a module's code once. `ActiveModuleService` follows
  navigation: startup modules (layouts, login) stay active, the current route's module (plus its `dependencies`)
  gets its styles/scripts applied before the page renders, and they are removed when you leave. Scripts re-run
  on every activation, so write them to be disposed.
* **Unloading.** `ModuleManager.Unload(id)` removes a module's routes, layouts, assets, styles and scripts, and
  `ReloadAsync(id)` swaps in a new file. Each module has its own load context; the assembly *memory* is only freed
  when the runtime supports collectible contexts (`ModuleOptions.CollectibleLoadContexts`, off by default and
  experimental on WebAssembly). Logging out removes the user's metadata and menu, and `ModuleRouteView`
  re-checks auth and `requiredRole` on every page render.
* **NuGet dependencies are not resolved.** Only the assemblies inside the package are loaded. Bundle private
  dependencies in the package's `lib/<tfm>/` folder; anything already loaded in the host is skipped.
* **Version alignment.** Modules compile against the host's framework version; keep them on the same major.
* **Security.** Loading code is code execution. Serve modules from a trusted origin, set `sha256` in descriptors that
  come from your API, and enforce authorization on the server too: client-side checks are UX, not protection.
* **Hosting `.dll` files.** Some static hosts (IIS, some CDNs) refuse to serve `.dll`. Rename the files and change
  `url` in the descriptor; the loader reads the assembly name from the file's metadata, not from the file name.
* **Sub-path hosting.** Set `<base href>` in `wwwroot/index.html`; all module URLs and routes are base-relative.

## API (`src/api/ModularBlazor.Host`)

A minimal API that serves the module catalog, identity (users, roles, API keys) and tenant management. Run it with `dotnet run --project src/api/ModularBlazor.Host`
(http://localhost:5100).

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/identity/tokens` | Sign in (`userName`/`email` + `password`), returns access + refresh token |
| `GET /api/modules/core` | Startup modules (public) |
| `GET /api/me/modules` | Modules for the signed-in user (JWT or API key) |

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
automatically), its own schema (`Auth.Users`, `Catalog.Modules`, `Multitenancy.Provisionings`; MySQL has no schemas, so it gets prefixed tables `Auth_Users`) and its own migrations history table
(`__EFMigrationsHistory_<Module>`). The context connects to the resolved tenant's database, or to the default database
(`ConnectionStrings:TenantStore`) when the request has no `X-Tenant`. With `Database:MigrateOnStartup=true` each module's
`IDbInitializer` migrates and seeds the default database (tenant databases are not touched). The module catalog is now stored
in `Catalog_Modules` and seeded with the demo modules; sign-in registers unknown users in `Auth.Users` on first login.

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

**Infrastructure**: `DbContextTenantBase` (tenant column and filter, soft-delete query filter, column conventions), `AuditingInterceptor` (CreatedOnUtc/By,
LastModifiedOnUtc/By, delete -> soft delete), `DomainEventsInterceptor` (publishes events through MediatR after a save),
`ModuleDbContext`, `EfRepository<TContext, T>`, `DbInitializer<TContext>`. Unlike FullStackHero's shared-database mode there is no
row-level `TenantId`: every tenant has its own database.

**Tenants**: `AppTenantInfo` (Id, Identifier, Name, Provider, ConnectionString, AdminEmail, IsActive, ValidUpto, Issuer) in the
tenant store (`TenantStoreDbContext`); `ITenantService` (create, get, search, activate, deactivate, renew) and
`ITenantDatabaseInitializer` (migrate + seed the tenant store, the root tenant `root`, platform data, then every tenant's
database). `UseTenantStatus()` answers 403 for a deactivated tenant or one whose `ValidUpto` has passed. The root tenant owns the
default database (`ConnectionStrings:TenantStore`), also used when a request has no `X-Tenant`.

**Multitenancy host module** (`modules/host/Multitenancy`, needs the `Permissions.Multitenancy.Tenants.*` permissions):

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/tenants` | create a tenant, then provision its database (migrate + seed); recorded in `TenantProvisioning` |
| `GET /api/v1/tenants?keyword=&orderBy=&pageNumber=&pageSize=` | page through tenants |
| `GET /api/v1/tenants/{id}` | one tenant |
| `POST /api/v1/tenants/{id}/activate`, `/deactivate`, `/upgrade` (`{"months": 12}`) | status and subscription |
| `GET /api/v1/tenants/provisioning`, `POST /api/v1/tenants/{id}/provisioning/retry` | provisioning log and retry |

### Identity, JWT and API keys (Auth host module)

Modelled on FullStackHero .NET v10. Two schemes, chosen per request: `Authorization: Bearer <jwt>` or `X-API-Key: mbk_...`
(both documented as security schemes in Scalar/ReDoc/OpenAPI). A JWT is valid only for the tenant it was issued for
(send the same `X-Tenant`). Endpoints are protected by permissions (`Permissions.Identity.Users|Roles|ApiKeys.*`,
`Permissions.Multitenancy.Tenants.*`); roles are `admin` (all permissions, kept in sync at startup) and `basic`.

| Endpoint (`/api/v1/identity`) | Purpose |
|---|---|
| `POST /tokens`, `/tokens/refresh`, `/tokens/revoke` | sign in, rotate refresh token, revoke (anonymous) |
| `POST /users/register`, `GET /users`, `GET/PUT/DELETE /users/{id}` | manage users (soft delete) |
| `GET /users/me`, `POST /users/me/change-password` | current user |
| `POST /users/{id}/toggle-status`, `/reset-password`; `GET/POST /users/{id}/roles`; `GET /users/{id}/permissions` | status, password, roles |
| `GET/POST /roles`, `GET/PUT/DELETE /roles/{id}`, `GET/PUT /roles/{id}/permissions`, `GET /permissions` | manage roles |
| `POST/GET /api-keys`, `DELETE /api-keys/{id}` | API keys (the secret is shown once; only its hash is stored) |

The first admin is seeded from `Auth:Seed` (default `admin` / `admin@root.com` / `123Pa$$word!`). **`Jwt:SigningKey` and the seed
password in `appsettings.json` are development values: override them (user secrets / environment) elsewhere.** Role or
permission changes reach a user's JWT when the token is refreshed. The Auth context gained tables, so re-run
`scripts/add-migration` for Auth.

### ElsaHost (Elsa 3 workflow engine, `modules/host/ElsaHost`)

Elsa is hosted inside the API (following Elsa's "Hosting Elsa in an existing app" guide): workflow management and runtime
persisted with EF Core, the workflows REST API (`/elsa/api`, see `ElsaHost:ApiBasePath`) and HTTP activities. The module has
Application + Infrastructure projects only (Elsa owns the workflow entities, so there is no Domain project).

- **One tenant model.** Finbuckle's tenant store is the single source of truth. `FinbuckleTenantResolver` answers Elsa's "which
  tenant?" with the tenant Finbuckle resolved (`X-Tenant`, `root` when absent) and `FinbuckleTenantsProvider` answers "which
  tenants exist?" from the tenant store (active, non-expired). The Elsa tenant id is the Finbuckle tenant id.
- **Data.** Elsa's tables live in the default database in schema `Elsa`, tenants separated by Elsa's `TenantId` column (not one
  database per tenant). Elsa owns its migrations: `ElsaHost:RunMigrations=true` applies them at startup (development); in
  production disable it and run Elsa's EF migrations. SqlServer and PostgreSql only (Elsa's MySQL provider is Pomelo).
- **Security.** Elsa's API uses this host's JWT / API key. `ElsaApiPermissionMiddleware`: `GET` needs
  `Permissions.Workflows.View` or `Manage`, anything else `Manage` (the `admin` role has both). `GET /api/v1/elsa/info` shows the
  API path and current tenant.
- Modules can now add middleware through `IHostModule.Configure(WebApplication)`.

**API documentation of Elsa.** Elsa's endpoints are kept out of the main OpenAPI document (`v1`), which they could break, and
published as their own document `elsa` (`/openapi/elsa.json`, ReDoc `/redoc/elsa`). Scalar lists both in its document selector.
The Elsa document uses full-type-name schema ids to avoid Elsa's duplicate short names. See `OpenApiDocuments.cs`.

### Module store: upload, register, enable, download (Catalog module)

Modules (`.dll` / `.nupkg`) live in the Host project under `assets/modules/` (git-ignored), split by consumer:

```
assets/modules/
  client/<id>/<file>      files the Blazor client downloads
  host/<id>/<file>        files compiled into the API
  host/host-modules.props, host-modules.config.json, nuget/   generated build inputs
  modules.json            manifest (sha-256, size, enabled, target)
```

**Management page.** The admin layout has a *Modules* entry (`/admin/modules`, module `Module.Admin`) to upload client or host
modules, edit a client module's catalog entry, enable/disable, download the file, delete, and restart the API.
Needs `Permissions.Modules.View|Manage` (held by `admin`) and `ModuleStore:AllowUpload=true` (set in `appsettings.json`).

**Client modules** (what the Blazor app loads):

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/modules/registrations` | list catalog entries with their package info |
| `POST /api/v1/modules/registrations` (multipart: `File`, `Metadata` json) | upload an assembly and register it; an existing id gets a new file/version and keeps its metadata. New entries start disabled unless `enabled` is set |
| `PUT /api/v1/modules/registrations/{id}` | edit metadata (core/user, roles, routes, layout, nav, styles, scripts) |
| `PUT /api/v1/modules/registrations/{id}/enabled` | enable or disable; disabled modules vanish from the client manifests |
| `DELETE /api/v1/modules/registrations/{id}` | remove entry and file (409 while another module depends on it) |
| `GET /api/modules/{id}/file` | **download for the client**: core modules are public, user modules need sign-in and a matching role; ETag = SHA-256 |

**Loading in the client.** Core modules (`loadOnStartup`) download at startup; user modules download the first time one of their
routes is opened. Bytes are kept in the browser Cache Storage under `module/{id}/{sha256}`: an unchanged module is never downloaded
again, a new version replaces the old entry, and the core manifest is cached so the app can start while the API is unreachable
(`ModuleOptions.CacheModules`).

**Host modules** extend the API, so they are compiled in. Upload with `POST /api/v1/modules/packages` (`target=Host`), then
`PUT /packages/{id}/enabled`; every change regenerates `host/host-modules.props` (a `Reference` per enabled dll, a `PackageReference`
plus local feed per nupkg), which the Host project imports, and `host-modules.config.json`. `rebuildRequired` says when a change has not
reached the running app. Apply with `POST /api/v1/modules/restart` while running under `scripts/run-host.ps1` (or `.sh`). Other package
endpoints: `GET /packages`, `GET /packages/{id}/download`, `PUT /packages/{id}/configuration`, `DELETE /packages/{id}`. A dll module must
bring its own dependencies (use a nupkg). Docker/Aspire: rebuild the image after enabling a module.

**Security.** An enabled host module runs with full trust inside the API. Keep `Permissions.Modules.Manage` with few people; every
package's SHA-256 is recorded and the client verifies it after download.

### One tenant model in the data layer: DbContextTenantBase

Every DbContext that holds business data (the Host's `AppDbContext` and the Auth, Catalog and Multitenancy contexts, through
`ModuleDbContext`) derives from `DbContextTenantBase`. It does what Finbuckle's `MultiTenantDbContext` does, against
`ICurrentTenant`: a `TenantId` column on every entity, stamped on insert, a global query filter on it (together with the
soft-delete filter), and an error when a row of another tenant is changed or deleted. The tenant is the one Finbuckle resolved
from `X-Tenant`, or **root** when the header is absent; an `X-Tenant` that matches no tenant is a 404 (it no longer falls back to
root). While a tenant's database is provisioned, `ITenantDatabaseOverride.Use(connection, tenantId)` also sets the tenant.
The Multitenancy context (platform data shared by all tenants) opts out with `IsTenantScoped => false`; Finbuckle's own
tenant store keeps its own context.

**Tokens are per tenant.** `POST /api/v1/identity/tokens` signs the user in to the tenant of `X-Tenant` (root by default),
looks the user up in that tenant's data and issues a JWT with that `tenant` claim; the token is refused for any other tenant.
The OpenAPI documents show `X-Tenant` on every operation.

**Elsa** gets its tenant from the same place (`FinbuckleTenantResolver` uses `ICurrentTenant`) and lists the tenants of the
tenant store, root included, so Elsa's tenant id is always the Finbuckle tenant id.

### Multi-tenancy and migrations

`src/migrations/{SqlServer,PostgreSql,MySql}` hold the migrations, one project per provider (`MySql` uses Oracle's `MySql.EntityFrameworkCore`)
(assemblies `ModularBlazor.Migrations.*`, selected by name in `DatabaseProviders`). Each provider project has a migration set per
context: `Migrations/App` (per-tenant `AppDbContext`), `Migrations/TenantStore`, `Migrations/Auth`, `Migrations/Catalog` and `Migrations/Multitenancy`.

```bash
dotnet tool install --global dotnet-ef
scripts/add-migration.sh AddNotes        # or .\scripts\add-migration.ps1 AddNotes
.\scripts\add-migration.ps1 Initial -Providers PostgreSql   # only one provider (sh: add-migration.sh Initial PostgreSql)
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

### Client authentication (JWT)

* `ModularBlazor.Infrastructure` (`src/apps/blazor`): `JwtAuthenticationService` is the `AuthenticationStateProvider`,
  `IAuthenticationService` and `IAccessTokenProvider` in one singleton. Tokens live in local storage
  (`authToken`, `refreshToken`); the user, roles, tenant and permissions are the **claims of the access token**
  (`sub`, `name`, `role`, `tenant`, `permission`), so there is no extra permissions call after sign-in.
* Two API clients: `IApiClient` sends `Authorization: Bearer` and `X-Tenant` (the token's tenant); the keyed
  `ApiClientNames.Anonymous` client sends nothing (sign-in, refresh, the public core manifest). The token handler
  never redirects before a call; a 401 on a call that carried a token sends the user to `login`.
* The token is refreshed a minute before it expires. If the refresh token is rejected the session ends.
* Modules read the user through `ICurrentUserService` (`UserInfo`: name, roles, tenant), never the provider.
* An unkeyed `HttpClient` is the framework's: this site's origin. The API is only reachable through the clients above.
