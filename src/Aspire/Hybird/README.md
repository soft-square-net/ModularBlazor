# Hybird: hybrid architecture lab (Aspire)

A runnable model of the research **combined target architecture**. One image (`src/WebApi/WebApi`) is deployed as several
**module pools**, each configured by `Modules__Pool`, `Modules__Role` and `Modules__Enabled__N`. The pools sit behind a
**YARP gateway** and share **RabbitMQ**, **Redis** and **PostgreSQL** (tenant store plus per-tenant databases). Every
replica exports OpenTelemetry to the Aspire dashboard.

```bash
dotnet run --project src/Aspire/Hybird --launch-profile http
```

Tenant database servers on the other engines are opt-in, because their images are large and Oracle is slow to start:

```bash
dotnet run --project src/Aspire/Hybird --launch-profile http -- --Lab:Engines=sqlserver,mysql,oracle
```

On the first run Aspire can give up on these large images while they are still downloading: the resource shows
"Failed to start" with "context deadline exceeded". Pull them once, then start the resources from the dashboard (or
restart the lab):

```bash
docker pull mcr.microsoft.com/mssql/server:2022-latest
```

```bash
docker pull docker.io/library/mysql:9.7
```

```bash
docker pull container-registry.oracle.com/database/free:23.26.1.0
```

**Stopping the lab:** use Ctrl+C in its terminal, which removes the containers. Killing the AppHost process leaves them
running; they then keep the data volumes in use, and the next run needs them stopped first.

| Resource | What it is |
|---|---|
| `gateway` (http://localhost:5080) | YARP. `/api/sales/**` and `/api/greeting/**` go to the sales pool; everything else goes to core. `/pools/{core\|sales\|worker}/**` reaches one pool directly (lab only). |
| `identity` (http://localhost:5090) | Identity service (`src/WebApi/Identity/WebApi.Identity.Server`): OpenIddict + ASP.NET Core Identity, database `identity` on `tenant-data`. Issuer `http://localhost:5090/`, audience `modular-webapi`, JWKS `/.well-known/jwks`. Clients `blazor-client` (Code + PKCE) and `elsa-workflows` (client credentials). Not routed through the gateway. See its README for flows, claims and dev accounts. |
| `core-1..2` | Core pool, Role=Api, modules: identity, tenancy (both core modules, active by default), workflow, inventory |
| `sales-1..4` | Sales pool, Role=Api, modules: sales, greeting (the sample module stands in for Sales) |
| `worker-1..2` | Worker pool, Role=Worker: modules load (services, consumers) but get no routes, and there is no public route |
| `broker` | RabbitMQ with the management UI |
| `redis` | Cache, locks, Data Protection keys, rate-limit counters |
| `tenant-data` | PostgreSQL: `TenantStore` (HybirdTenants: the tenant registry, schema `platform`), `tenant-acme`, `tenant-globex` (one database per tenant; each module gets its own schema in it), plus pgAdmin. Replicas get `ConnectionStrings:TenantStore` and the server itself as `ConnectionStrings:tenant-data`, which tenant rows name and new tenants' databases are created on. |
| `tenant-sql`, `tenant-mysql`, `tenant-oracle` (`Lab:Engines`) | Optional SQL Server, MySQL and Oracle Database Free (pluggable database `FREEPDB1`) servers for tenants. Replicas get `ConnectionStrings:<server>` and `DatabaseServers:<server>:Provider`. Create a tenant on one with `POST /api/tenancy/tenants {"id":"contoso","databaseServer":"tenant-sql"}`. |

`GET /api/pool`, or `GET /pools/{pool}/api/pool`, shows which pool, role and replica answered, and which
connections it was wired to.

## Verified

- **Gateway balancing (L7):** the gateway balances **per request** across replicas. With 12 requests each: core 6/6, sales 3/3/3/3, worker 6/6.
- **Wiring:** every replica receives `broker`, `redis` and `TenantStore` connection strings.
- **Pool rules:** each pool applies only the modules it enables. Activating `greeting` through a core replica made all 4 sales replicas load it and map routes, made both workers load it without routes, and left core unloaded.
- **Broadcast convergence:** install, activate, deactivate, settings, unload and uninstall made through **one** replica converged on all 8 replicas. Every replica binds its own queue to `modules.state` (8 bindings).
- **Zero-downtime swap:** a re-install (upgrade) plus a settings change under load gave **300 of 300 requests 200**. The new settings were live on every replica afterwards.
- **Tenancy (2026-11-11):**
  - **Resolution through the gateway:** `X-Tenant: acme` → acme (header); `Host: acme.localhost` → acme (host, via the gateway's `X-Forwarded-Host`). A client-sent `X-Forwarded-Host` is overwritten by the gateway. An unknown tenant gets 404, and a tenant-required module route without a tenant gets 400.
  - **Seeding:** the `tenancy` module seeded acme and globex into the tenant store on first start.
  - **Database per tenant:** the `inventory` sample, uploaded to the core pool, migrated its `inventory` schema into `tenant-acme` and `tenant-globex` on activation. `GET /api/inventory/` reports the tenant's own database. Rows written for acme and globex stayed separate on both core replicas.
  - **Provisioning:** `POST /api/tenancy/tenants {"id":"initech","hosts":["initech.localhost"]}` created `tenant-initech`. Both core replicas migrated inventory into it and served `Host: initech.localhost` from it. All 4 sales replicas, which don't load `tenancy`, knew initech through `tenants.changed`.
  - **Lifecycle unchanged:** `greeting` install, activate (200 on all sales replicas), deactivate (404 everywhere), unload and uninstall all converged over `modules.state`. Greeting was collected on every sales replica.
  - **Unload with EF Core:** in the first run one core replica kept inventory, rooted by an OpenTelemetry pooled log record holding an EF `DbUpdateException` (from a duplicate-SKU 409). After `FrameworkCaches.ClearIdleLogRecords`, the same scenario on a fresh lab collected inventory on both core replicas within about 10 s, in two cycles. As with the other modules, the unload's own GC passes aren't enough, so it shows under `/unloading` first.
  - **Layered module with specifications and repositories:** inventory 1.1.1 (Domain / Application / Infrastructure, Ardalis on EF Core 10), uploaded to the core pool, picked up its existing schema and data without re-migrating. Create 201, duplicate SKU 409 (domain rule), issuing more than in stock 409, list with a spec 200, for acme and initech. Two full cycles (activate, requests, deactivate, unload) were collected on both core replicas within a few seconds, after the `s_loadFields` fix in `FrameworkCaches.ClearExpressionCaches`. Without the fix, every copy that ran the SKU specification stayed loaded.
  - **Suspend:** `PATCH /api/tenancy/tenants/initech {"status":"Suspended"}` gave 403 on both core and all 4 sales replicas, by header and by host name. `{"status":"Active"}` restored 200 everywhere.
  - **Restart:** tenants (including the provisioned initech) survived a lab restart (Postgres volume).

## Module state across replicas

Module state uses one shared catalog plus a broadcast:

```
admin call ─► any replica ─► catalog (modules.json + packages, cross-process lock): desired state per module
                    │
                    ├─► SyncAsync here
                    └─► RabbitMQ fanout "modules.state" ─► every other replica ─► SyncAsync
```

- **Desired state:**
  - `Active`: loaded, with routes in Api pools.
  - `Inactive`: loaded, no routes.
  - `Installed`: unloaded.
  - Removed: unloaded.
- **Only enabled modules:** a pool applies only the modules in `Modules__Enabled`.
- **Core modules come by default:** every replica seeds the core modules its release ships (`identity`, `tenancy`) into the catalog as `Active` on startup, once under the catalog lock, then broadcasts `core-seeded`. Only the core pool enables them here. See `src/WebApi/WebApi/README.md`, "Core modules".
- **Swap instead of restart:** a newer `InstalledAt` (re-install) or changed settings makes a replica load a fresh copy. The fresh copy's routes replace the old ones in one update, and only then is the old copy released, so there is no 404 window.
- **The catalog is the source of truth:** the message only says "something changed", so a lost message is repaired by the next one, or by the sync on startup and on subscribe.
- **Released copies collect late:** old copies often appear under `/api/admin/modules/unloading` for a while after the swap. Heap dumps later showed only the active copy in each replica.

The production version is the same shape, with the catalog in the modules table instead of `modules.json`.

## Design notes found while building it

- **Replicas are separate resources, not `WithReplicas`.**
  - Behind Aspire's replica proxy (like a Kubernetes ClusterIP service), YARP sees one address. Its pooled keep-alive connection then pinned **100 %** of traffic to a single replica, which was measured.
  - Aspire doesn't allow replicas without that proxy.
  - Addressing each replica directly is what the production setup should do as well: YARP or the mesh gets pod endpoints (a headless service or service discovery), not a connection-balanced VIP. This is the same rule as for gRPC.
- **Admin calls reach one replica, so state must be broadcast.**
  - Before the broadcast, an install or activate through the gateway reached one replica, and `/api/greeting` returned 404 on 3 of 4 sales replicas.
  - Hence the shared catalog plus `ModuleStateChanged` above.

## Not modelled locally

- **Client:** the CDN for the Blazor WASM `_framework` files, and the client itself (see `src/Aspire/Host`).
- **Edge:** TLS and the WAF.
- **Gateway:** JWT validation and rate limiting are described in the research but not configured yet. Tenant resolution runs in every replica (see `src/WebApi/WebApi/README.md`, "Multi-tenancy"); the gateway only forwards the host name.
- **Tenant hosts:** `acme.localhost` / `globex.localhost` resolve to 127.0.0.1 in most browsers; with curl send `-H "Host: acme.localhost"` to http://localhost:5080.
- **Scaling:** autoscaling (the sales HPA) and scaling the worker pool on queue lag (KEDA).
