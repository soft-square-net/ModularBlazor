---
title: Runtime modules API
description: Admin endpoints, pool configuration, manifest fields and packaging rules for modules loaded while the API runs.
sidebar:
  order: 3
---

The runtime module prototype lives in `src/WebApi/WebApi`. How it works: [Runtime modules](/backend/runtime-modules/).

## Admin endpoints

A lifecycle call can reach any replica. It changes the module's desired state in the shared catalog, applies it on
that replica, and broadcasts the change so every replica of every pool converges. **The response describes the
replica that answered.**

Every admin call needs the `platform.modules.manage` permission (the `platform-admin` role has it): **401** without a
token, **403** without the permission. See [Authentication: implementation](/backend/auth-implementation/).

| Method and path | Does |
| --- | --- |
| `GET /api/admin/modules` | Lists registered modules as this replica sees them |
| `POST /api/admin/modules` | **Install**: multipart form field `package` with a `.dll`, `.zip` or `.nupkg`. Re-installing an existing id is an upgrade: it keeps the state and swaps every replica to the new version |
| `POST /api/admin/modules/{id}/activate` | Desired state `Active`: load, build services, map routes (routes only in `Api` pools) |
| `POST /api/admin/modules/{id}/deactivate` | Desired state `Inactive`: remove routes; loaded modules stay loaded |
| `POST /api/admin/modules/{id}/unload` | Desired state `Installed`: remove routes, stop hosted services, dispose services, unload assemblies everywhere. `HotUnload = false`: `409` unless `?deferred=true` |
| `PUT /api/admin/modules/{id}/settings` | Replace settings (JSON object); replicas that have the module loaded swap to a reconfigured copy (`HotUnload = false`: applied at the next restart) |
| `DELETE /api/admin/modules/{id}` | Unload everywhere, delete the package, remove the registration. `409` for a core module; `HotUnload = false`: `409` unless `?deferred=true` |
| `GET /api/admin/modules/unloading` | Unloaded or swapped-out copies on this replica whose memory is not freed yet |

Errors are problem details: `400` for an invalid package or manifest, or when activation finds an undeclared
permission, a module-defined authorization requirement or a named policy; `404` for an unknown module; `409` when the
route prefix is used by another module, for deleting or uploading over a core module, or for unloading or
uninstalling a `HotUnload = false` module without `?deferred=true`; `500` when a package's files are missing.

Module endpoints are served under `/api/{RoutePrefix}`.

### Status response

`GET /api/admin/modules`, activate and deactivate return `ModuleStatus`:

| Field | Meaning |
| --- | --- |
| `module` | The catalog record: id, name, version, route prefix, entry assembly, settings, `desiredState`, `installedAt` |
| `pool` | `Modules:Pool` of the replica that answered |
| `instance` | `machine:process` of that replica |
| `enabledInPool` | Whether that pool applies this module (`Modules:Enabled`) |
| `loaded` | Whether the module is loaded on that replica |
| `routes` | Its live routes on that replica, e.g. `GET /api/greeting/{name}` |
| `loadedVersion` | Version of the copy loaded on that replica; differs from `module.version` while a restart is pending |
| `restartRequired` | `HotUnload = false` and the catalog asks for a change this replica applies only on its next restart |
| `hostedServices` | The loaded copy's hosted services: `{ service, state, error }` |

Unload and uninstall return `{ id, unloaded, gcPasses, note }` for the answering replica.

## Other host endpoints

| Path | Does |
| --- | --- |
| `GET /api/pool` | Pool, role, enabled modules and instance of the replica that answered, plus the names (never the values) of its connection strings |
| `GET /health` | Health check used by the gateway and the orchestrator (anonymous) |
| `GET /openapi/webapi.json` | OpenAPI document of the host's built-in endpoints (admin, `/api/pool`, `/health`) |
| `GET /openapi/modules/{id}.json` | OpenAPI document of one module; `404` unless it is routed on this replica |
| `GET /openapi` | The documents available right now: `[{name, title, url, isDefault}]` |
| `GET /scalar` (`/` redirects there) | Scalar API reference, with a switcher for the same documents |

Module documents are also the source of each module's typed client: `src/WebApi/scripts/Export-ModuleOpenApi.ps1`
saves one to `<Module>/openapi/<id>.json` without the lab, and NSwag generates the client from it
([Typed clients for the module](/backend/create-a-module/#typed-clients-for-the-module)). The host document works the
same way (`-HostDocument`, saved to `src/WebApi/openapi/webapi.json`): `src/WebApi/WebApi.Client` has `ModulesClient`
for every admin endpoint above, `PoolClient` and `HealthClient`
([The host's own client](/backend/create-a-module/#the-hosts-own-client-module-management)).

The OpenAPI and Scalar endpoints are anonymous and exist in Development, or when `OpenApi:Enabled=true`. Behind the gateway's
`/pools/{pool}/` routes, document URLs carry that prefix (from `X-Forwarded-Prefix`). How it works:
[OpenAPI and Scalar](/backend/runtime-modules/#openapi-and-scalar).

## Core module endpoints

| Module | Endpoints | Permission |
| --- | --- | --- |
| `identity` | `GET /api/identity/me` (anonymous; with the caller's permissions when signed in), `/users`, `/users/{userName}` | signed in |
| `identity` | `GET /api/identity/permissions` (catalog), `GET`/`POST /api/identity/grants`, `DELETE /api/identity/grants/{id}` | `access.grants.manage` |
| `tenancy` | `GET /api/tenancy/tenants`, `/tenants/{id}`, `/current` | signed in |
| `tenancy` | `POST /api/tenancy/tenants`, `PATCH /api/tenancy/tenants/{id}`, `POST /api/tenancy/tenants/{id}/activate`, `/suspend`, `/provision` | `platform.tenants.manage` |
| `tenancy` | `GET /api/tenancy/subscriptions` (report), `GET`/`POST /api/tenancy/tenants/{id}/subscriptions`, `POST …/subscriptions/{subscriptionId}/extend`, `/cancel` | `platform.tenants.manage` |

Subscriptions are informational: an ended one never suspends a tenant
([Tenant subscriptions](/backend/tenancy-data/#tenant-subscriptions)). The core modules' typed clients:
`WebApi.Modules.Core.Tenancy.Client` (`TenancyClient`), generated from
`Modules/Core/WebApi.Modules.Core.Tenancy/openapi/tenancy.json` (`Export-ModuleOpenApi.ps1 -CoreModuleId tenancy`).

Tenant rules (headers, status codes) are in [Tenancy and tenant data](/backend/tenancy-data/#resolution-rules).

## States

| State | Meaning | On startup |
| --- | --- | --- |
| `Installed` | Package stored, manifest registered, nothing loaded | Stays unloaded |
| `Active` | Loaded, services built, routes live in `Api` pools | Loaded and routed again |
| `Inactive` | Routes removed; stays loaded where it was loaded | Not loaded |

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `Modules:Path` | `App_Data/modules` | Catalog folder (`modules.json`, lock file, packages). Every replica of every pool must point to the same folder |
| `Modules:RoutePrefix` | `/api` | Base route for module endpoints |
| `Modules:Pool` | `all` | Pool name |
| `Modules:Role` | `Api` | `Api` maps routes; `Worker` loads modules without routes |
| `Modules:Enabled` | empty (all) | Module ids this pool applies, e.g. `Modules__Enabled__0=sales` |
| `ConnectionStrings:broker` | none | RabbitMQ connection; when set, lifecycle changes are broadcast on the `modules.state` fanout exchange |
| `OpenApi:Enabled` | `false` (on in Development) | Serves the OpenAPI documents and Scalar outside Development |
| `Modules:CorePath` | `CoreModules` | Folder of the core-module packages shipped with the release |
| `Auth:Authority` | none | Identity service (OIDC discovery, JWKS). Without it, `Authentication:Schemes:Bearer` applies (`dotnet user-jwts`) |
| `Auth:Audience` | `modular-webapi` | Expected token audience |
| `Access:Roles:{role}:N` | `platform-admin` → all platform permissions | Extra role-to-permission mappings |
| `Access:Grants:N:{Tenant,UserId,Permission,Scope}` | none | Seed grants when there is no tenant store |
| `ConnectionStrings:TenantStore` | none | Tenant store (tenant directory and grants). Without it, tenants come from `Tenancy:Tenants` and grants live in memory |
| `ConnectionStrings:<server>`, `DatabaseServers:<server>:Provider` | provider `PostgreSql` | Database servers that tenant rows name; providers `PostgreSql`, `SqlServer`, `MySql`, `Oracle` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | none | When set, traces, metrics and logs are exported over OTLP (the Aspire dashboard sets it) |

## Contract

```csharp
public interface IRuntimeModule
{
    ModuleManifest Manifest { get; }
    void ConfigureServices(IServiceCollection services, IConfiguration settings);
}

public sealed record ModuleManifest(string Id, string Name, string Version, string RoutePrefix)
{
    public string? Description { get; init; }
    public IReadOnlyDictionary<string, string?> DefaultSettings { get; init; }
    public IReadOnlyList<PermissionDefinition> Permissions { get; init; } = [];
    public bool HotUnload { get; init; } = true;
}

// Optional, on the same class: a private ASP.NET Core pipeline behind /api/{RoutePrefix}/{**path}.
public interface IModulePipeline
{
    void ConfigurePipeline(IApplicationBuilder app);
    void ConfigureEndpoint(IEndpointConventionBuilder endpoint) { }
}
```

| Field | Rule |
| --- | --- |
| `Id` | Lowercase `a-z`, `0-9`, `.`, `-`; stable across versions |
| `Version` | Letters, digits, `.`, `+`, `-` |
| `RoutePrefix` | Same rule as `Id`; unique among installed modules |
| `DefaultSettings` | Flat configuration keys (`Section:Key`); copied into the catalog on install. Never secrets |
| `Permissions` | Every permission its endpoints use with `RequirePermission`; activation fails on an undeclared one |
| `HotUnload` | `false` for a module whose libraries pin their assemblies: unload and uninstall need `?deferred=true`, upgrades and settings apply at the next restart |

A package contains **exactly one** public, non-abstract `IRuntimeModule` with a parameterless constructor.
Endpoints come from its `ICarterModule` classes, and from its private pipeline if it implements `IModulePipeline`.
`IHostedService`s registered in `ConfigureServices` are started and stopped with the module
([Hosted services](/backend/runtime-modules/#hosted-services)). Keyed services are not supported yet.

A full walkthrough, from an empty folder to a module running in a pool: [Create a module, A to Z](/backend/create-a-module/).

## Packaging a module

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <!-- Copies private dependencies to the output and writes the .deps.json the loader uses. -->
    <EnableDynamicLoading>true</EnableDynamicLoading>
  </PropertyGroup>
  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <!-- Shared with the host: compile against them, never ship them. -->
    <PackageReference Include="Carter" Version="10.0.0" ExcludeAssets="runtime" />
    <ProjectReference Include="..\..\..\WebApi.Contracts\WebApi.Contracts.csproj" Private="false" ExcludeAssets="runtime" />
    <!-- Private dependency: loads into the module's own load context. -->
    <PackageReference Include="Humanizer.Core" Version="2.14.1" />
  </ItemGroup>
</Project>
```

Custom modules live in `src/WebApi/Modules/Custom/<Module>/`; the contracts are in `src/WebApi/WebApi.Contracts/`, which
is why the reference goes up three folders. `Modules/Custom/Directory.Build.props` applies to every custom module.
Layered modules (`<Name>.Domain`, `.Application`, `.Infrastructure`, like `Custom/Inventory`) get their references
from `Modules/Directory.Build.props` by project-name suffix, so their project files stay almost empty. Core modules
live in `Modules/Core/` and ship with the WebApi release instead; see
[Core and custom modules](/backend/runtime-modules/#core-and-custom-modules).

| Package form | Contents |
| --- | --- |
| `.zip` (recommended) | The **contents** of `bin/<Configuration>/net10.0`: module dll, `.deps.json`, private dependencies |
| `.dll` | The module assembly alone; only for modules without private dependencies |
| `.nupkg` | `lib/<highest netX.Y>/` is used; package dependencies are **not** restored |

If the host already ships an assembly with the same name, the host's copy is used, whatever version the module
was built against.

## Try it

**Single instance:**

```bash
dotnet build src/WebApi/Modules/Custom/WebApi.Modules.Greeting
dotnet run --project src/WebApi/WebApi --launch-profile http
```

Zip the contents of `src/WebApi/Modules/Custom/WebApi.Modules.Greeting/bin/Debug/net10.0` as `greeting.zip`, then:

```bash
curl -F "package=@greeting.zip" http://localhost:5298/api/admin/modules
curl -X POST http://localhost:5298/api/admin/modules/greeting/activate
curl http://localhost:5298/api/greeting/john_doe
```

`src/WebApi/WebApi/WebApi.http` has every request.

**Pools and replicas:** run the [Hybrid architecture lab](/backend/hybrid-lab/) and send the same requests to the
gateway, `http://localhost:5080`.
