---
title: Tenancy and tenant data
description: How the WebApi host resolves the tenant of every request, keeps the tenant directory, gives each tenant its own database on PostgreSQL, SQL Server, MySQL or Oracle, and migrates module schemas on activation.
sidebar:
  order: 10
---

This page describes what is **implemented** in `src/WebApi`. The design behind it is in
[Multitenancy across pools](/backend/multitenancy/) and the [auth design note](/backend/auth-design/).

The host resolves the tenant of every request, on every replica of every pool. The `tenancy` core module owns the
admin side: writing the tenant store and provisioning databases. Pools that don't load `tenancy` (sales, worker) still
know every tenant, because they read the tenant store themselves.

```text
request ─► host middleware (Tenancy/): X-Tenant header, then host name (X-Forwarded-Host), then the token's "tenant" claim
              │                         └─ tenant directory: TenantStore (schema "platform"), in memory per replica,
              │                            reloaded on startup, every 5 min and on the broker fanout "tenants.changed"
              ├─► ITenantContext (scoped, host) ─► any module service injects it (the module scope falls back to the host)
              └─► module endpoint ─► waits until the module is initialized for this tenant (migrations), then runs
```

## Where the pieces live

| Piece | Where | What |
| --- | --- | --- |
| `ITenantContext`, `TenantInfo`, `ITenantDirectory`, `ITenantInitializer`, `IModuleActivation`, `.TenantOptional()`, `CreateTenantScope(...)`, `TenancyNames` | `WebApi.Contracts/Tenancy` | Everything a module sees. Host-shipped, so one type identity and nothing that pins a module |
| `TenantDbContext`, `AddTenantDbContext<T>()`, `EfRepository<T>`, `TenantStoreDbContext`, `TenantDatabases`, `DatabaseProviderAdapter`, `ProviderMigrationsAssembly` | `WebApi.Data` (host-shipped: EF Core 10 with four providers, Ardalis.Specification.EntityFrameworkCore) | The data layer modules share. Modules compile against it and never ship it |
| `ITenantOwned`, entity bases, `IRepository<T>` / `IReadRepository<T>` | `WebApi.SharedKernel` (host-shipped, no EF) | See [Layered modules](/backend/runtime-modules/#layered-modules) |
| Middleware, directory cache, `tenants.changed` bus, per-tenant module initialization | `WebApi/Tenancy` | `builder.AddPlatformTenancy("broker")`; `app.UseRouting(); app.UseTenancy();` |
| Directory admin, provisioning, seeding (acme, globex) | `tenancy` core module | Writes the tenant store, then `ITenantDirectory.NotifyChangedAsync` |

## Resolution rules

- The `X-Tenant` header wins. If the host name names a different tenant, the request gets **400**.
- With a token, the `tenant` claim must match the request's tenant (**403**), or is the tenant when the request names
  none.
- An unknown tenant gets **404**, a suspended one **403**.
- Module endpoints need a tenant (**400** without one) unless they are `.TenantOptional()`. Host endpoints never need
  one. `greeting`, `identity` and `tenancy` are tenant-optional for now.
- Without a tenant store (a single local instance, no `ConnectionStrings:TenantStore`), the directory reads
  `Tenancy:Tenants` from configuration, and the tenancy write endpoints return 503.

## Database per tenant, schema per module

- A tenant row names a **server** (a connection-string name, e.g. `tenant-data`) and a database; there are no secrets
  in the store.
- A module's `TenantDbContext` connects to the current tenant's database. The module's tables are kept apart in it
  (its own schema, or a table prefix on MySQL and Oracle), with their own migrations history table.
- `ITenantOwned` rows are stamped with the tenant, filtered by it (global query filter) and refused for another tenant
  on save: defence in depth now, and the shared-database option stays open.

### Migrations on activation

`AddTenantDbContext<T>()` registers an `ITenantInitializer` that migrates the module's schema:

- for every active tenant, when the module loads on a replica;
- for one tenant, when it is created or re-activated.

It runs behind the engine's own lock per (tenant database, context), so replicas migrate one at a time. A module
request waits up to 30 s for its tenant's initialization; a failure gives **503** and is retried on the next request.
Installing a module only stores the package: nothing runs until it is activated.

### Unload safety with EF Core

Each module gets its own EF internal service provider (`TenantEfServices`, one per engine, disposed with the module),
so EF's model and query caches, which are keyed by the module's types, never enter EF's process-wide cache. The
runtime calls `IModuleLifecycleObserver` (`Loaded` / `ReleasingAsync`); the initializer cancels and awaits its work
before the module's container is disposed. More in [Unloading runtime modules](/backend/runtime-module-unloading/).

## Four database engines

Tenant databases, and the tenant store, can live on any of four engines, each with an EF Core 10 provider shipped by
the host:

| Engine | Provider | A tenant's database | A module's tables | Migration lock |
| --- | --- | --- | --- | --- |
| PostgreSQL | `Npgsql.EntityFrameworkCore.PostgreSQL` 10.0.3 | a database | schema `<module>` | `pg_advisory_lock` |
| SQL Server | `Microsoft.EntityFrameworkCore.SqlServer` 10.0.14 | a database | schema `<module>` | `sp_getapplock` |
| MySQL | `MySql.EntityFrameworkCore` 10.0.12 (Oracle's) | a database | prefix `<module>_` | `GET_LOCK` |
| Oracle | `Oracle.EntityFrameworkCore` 10.23.26400 | a schema-only user, signed in through the server account (proxy authentication) | prefix `<module>_` | `DBMS_LOCK` |

- **Servers are configuration:** `ConnectionStrings:<server>` plus `DatabaseServers:<server>:Provider` (`PostgreSql`
  when not set). The tenant store uses `DatabaseServers:TenantStore:Provider`.
- **Tenants of one deployment can sit on different engines.** `POST /api/tenancy/tenants
  {"id":"contoso","databaseServer":"tenant-sql"}` creates the database (on Oracle, the schema user), and every active
  module then migrates into it. An unknown server gets 400.
- **Engine differences live in one place:** `DatabaseProviderAdapter` handles connection strings, EF registration,
  creating the database, the lock and module isolation.
- **Why these packages:** Pomelo's MySQL provider stops at EF Core 9, so MySQL uses Oracle's
  `MySql.EntityFrameworkCore`. `System.Security.Cryptography.Pkcs` is pinned to 10.0.15 because the transitive 9.0.11
  has known vulnerabilities.

### Oracle: proxy authentication

The first design selected the tenant schema with `ALTER SESSION SET CURRENT_SCHEMA`. It broke in the lab: EF's Oracle
provider looks for its history table in `USER_TABLES`, which lists the *signed-in* user's tables, so the second replica
saw no history table, tried to create it again and failed with ORA-00955 on every retry.

Signing in as the tenant user, through the server account (`User Id=<TENANT>; Proxy User Id=<server account>`), makes
the session's own schema the tenant's. Provisioning creates the user, grants `CREATE SESSION`, `TABLE`, `SEQUENCE`,
`VIEW`, `PROCEDURE` and `TRIGGER`, and `GRANT CONNECT THROUGH <server account>`. It is idempotent:
`POST /api/tenancy/tenants/{id}/provision` re-runs it as a repair step.

### One migration set per engine

- Migrations ship inside the module assembly, one set per engine: `Migrations/<Provider>/`, namespace
  `….Migrations.<Provider>`. `ProviderMigrationsAssembly` replaces EF's `IMigrationsAssembly` and keeps only the set
  (and model snapshot) of the engine the tenant's database runs on.
- `src/WebApi/scripts/Add-Migration.ps1` runs `dotnet ef migrations add` once per engine and works around two
  dotnet-ef behaviours that break several sets in one project (the snapshot it updates, and where a first snapshot is
  written):

```powershell
./src/WebApi/scripts/Add-Migration.ps1 -Project src/WebApi/Modules/Custom/Inventory/WebApi.Modules.Inventory.Infrastructure -Name <Name>
```

- **Packages stay small:** module references to host-shipped projects carry `ExcludeAssets="runtime;native"`, so the
  providers' client libraries are never copied into a module package.

### Production notes

- Oracle: the server account needs `CREATE USER`, `ALTER USER`, `GRANT ANY PRIVILEGE` and `EXECUTE` on `DBMS_LOCK`
  (the lab uses SYSTEM). SQL Server provisioning needs `CREATE DATABASE`.
- Verified at runtime: tenant databases on all four engines. The tenant store on SQL Server, MySQL and Oracle is only
  generated and model-checked; the lab keeps it on PostgreSQL.
- Provision with a privileged account and serve tenants with a least-privilege one (not modelled yet).

## Adding tenant data to a module

`Modules/Custom/Inventory` is the sample.

1. Name the entry project `*.Infrastructure` (or import `WebApi.Data/SharedData.props`).
2. Derive from `TenantDbContext`: set `Schema`, configure in `ConfigureModel`.
3. Call `services.AddTenantDbContext<T>()`. That also registers `IRepository<T>` and `IReadRepository<T>`.
4. Add an `IDesignTimeDbContextFactory` that returns
   `new MyContext(TenantDbDesignTime.Options<MyContext>(args), TenantDbDesignTime.Tenant)`.
5. Add migrations, one set per engine, with `Add-Migration.ps1`.

## Work outside a request

Worker pools, consumers and jobs call `moduleServices.CreateTenantScope(tenantId)` for a module scope bound to that
tenant. Messages carry the tenant in the `tenant` header (`TenancyNames.MessageHeader`); platform jobs loop over
`ITenantDirectory.All`. Module consumers and hosted services themselves are not supported by the runtime yet.

## Decisions

- **No Finbuckle.** The in-house layer is small, and Finbuckle's startup-registered stores, per-tenant options and
  shared-database focus fit a runtime that loads modules later poorly. Modules only see `ITenantContext`, so it could
  be swapped in later.
- **Elsa (future workflow module):** Elsa's tenant id is the platform tenant id. An Elsa `ITenantResolver` reads
  `ITenantContext`, an `ITenantsProvider` reads `ITenantDirectory`, and the module refreshes Elsa's tenants on
  `tenants.changed`. Elsa keeps its own shared database with `TenantId` columns and must run on the host's EF Core
  version.

## Not covered yet

Per-tenant module enablement (plans), per-tenant module settings, and dropping a module's schema on uninstall.
