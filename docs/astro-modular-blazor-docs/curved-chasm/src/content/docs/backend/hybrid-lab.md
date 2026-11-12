---
title: Hybrid architecture lab
description: The target architecture as a runnable .NET Aspire model — a YARP gateway, three module pools from one image, RabbitMQ, Redis and PostgreSQL — and what it measured.
sidebar:
  order: 5
---

`src/Aspire/Hybird` runs the [target architecture](/backend/target-architecture/) on one machine. One image
(`src/WebApi/WebApi`) is deployed as three **module pools** behind a **YARP gateway**, sharing **RabbitMQ**, **Redis** and
**PostgreSQL**. Every replica exports OpenTelemetry to the Aspire dashboard.

```bash
dotnet run --project src/Aspire/Hybird --launch-profile http
```

The dashboard opens at `http://localhost:17888`; the gateway listens on `http://localhost:5080`. Docker is needed
for the broker, Redis and PostgreSQL containers.

Tenant database servers on the other engines are opt-in, because their images are large (SQL Server 2022 2.2 GB,
MySQL 9.7 1.28 GB, Oracle Database Free 14.1 GB) and Oracle is slow to start:

```bash
dotnet run --project src/Aspire/Hybird --launch-profile http -- --Lab:Engines=sqlserver,mysql,oracle
```

## Resources

| Resource | What it is |
| --- | --- |
| `gateway` (port 5080) | YARP. `/api/sales/**` and `/api/greeting/**` go to the sales pool; everything else goes to core. `/pools/{core\|sales\|worker}/**` reaches one pool directly (lab only) |
| `core-1`, `core-2` | Core pool, `Role=Api`, modules: identity, tenancy (core modules, active by default), workflow, inventory |
| `sales-1` … `sales-4` | Sales pool, `Role=Api`, modules: sales, greeting (the sample module stands in for Sales) |
| `worker-1`, `worker-2` | Worker pool, `Role=Worker`: modules load (services, consumers) but get no routes, and no public route reaches it |
| `broker` | RabbitMQ with the management UI |
| `redis` | Cache, locks, Data Protection keys, rate-limit counters |
| `tenant-data` | PostgreSQL: `TenantStore` (HybirdTenants: the tenant registry and grants, schema `platform`), `tenant-acme`, `tenant-globex` (one database per tenant, a schema per module in it), plus pgAdmin. Replicas get `ConnectionStrings:TenantStore` and the server as `ConnectionStrings:tenant-data`, which tenant rows name |
| `tenant-sql`, `tenant-mysql`, `tenant-oracle` (`Lab:Engines`) | Optional SQL Server, MySQL and Oracle Database Free servers for tenants. Replicas get `ConnectionStrings:<server>` and `DatabaseServers:<server>:Provider` |
| `identity` (port 5090) | The OpenIddict identity service, with database `identity-db`. **On branch `claude/identity-service-da759e` only**; the pools aren't wired to it yet. See [Authentication: implementation](/backend/auth-implementation/#the-identity-service) |

A pool is N replicas of the same project; only configuration differs:

```text
Modules__Pool        core | sales | worker
Modules__Role        Api | Worker
Modules__Enabled__N  the modules this pool applies
Modules__Path        App_Data/modules-catalog   one catalog for every pool
ConnectionStrings    broker, redis, TenantStore  injected by Aspire
```

`GET /api/pool` (or `GET /pools/{pool}/api/pool` through the gateway) shows which pool, role and replica answered,
and which connections it was wired to.

## Try the module lifecycle across pools

The admin API needs a token with the `platform-admin` role (see
[development tokens](/backend/auth-implementation/#development-tokens)); send it as `-H "Authorization: Bearer $TOKEN"`
on the admin calls below.

```bash
# install and activate through the gateway: the call reaches one core replica
curl -F "package=@greeting.zip" http://localhost:5080/api/admin/modules
curl -X POST http://localhost:5080/api/admin/modules/greeting/activate

# the gateway routes /api/greeting to the sales pool; every sales replica serves it
curl http://localhost:5080/api/greeting/john_doe

# how each pool sees the module
curl http://localhost:5080/pools/core/api/admin/modules     # enabledInPool: false, not loaded
curl http://localhost:5080/pools/sales/api/admin/modules    # loaded, routes mapped
curl http://localhost:5080/pools/worker/api/admin/modules   # loaded, no routes
```

## OpenAPI and Scalar per pool

OpenAPI documents are generated per replica, so each pool's Scalar shows what that pool routes
([how it works](/backend/runtime-modules/#openapi-and-scalar)):

| URL (gateway, port 5080) | Shows |
| --- | --- |
| `/scalar` | The core pool: `webapi`, `identity` and `tenancy` |
| `/pools/sales/scalar` | The sales pool: `webapi`, plus `greeting` while it is active |
| `/pools/{pool}/openapi` | The list of documents that pool serves right now |

The `/pools/{pool}/**` routes send `X-Forwarded-Prefix: /pools/{pool}` and turn off YARP's default prefix transform,
which would overwrite that header. Document URLs and server URLs are built from the header, so "Try it" stays on the
same `/pools/{pool}/...` path.

## Tenants in the lab

```bash
# by header, or by host name (the gateway forwards it as X-Forwarded-Host)
curl -H "X-Tenant: acme" http://localhost:5080/api/tenancy/current
curl -H "Host: acme.localhost" http://localhost:5080/api/tenancy/current

# create a tenant on the SQL Server engine (needs platform.tenants.manage)
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \n  -d '{"id":"contoso","databaseServer":"tenant-sql"}' http://localhost:5080/api/tenancy/tenants
```

`acme.localhost` and `globex.localhost` resolve to 127.0.0.1 in most browsers. How resolution and provisioning work:
[Tenancy and tenant data](/backend/tenancy-data/).

## What it verified

| Check | Result |
| --- | --- |
| Gateway balancing | Per request across replicas: with 12 requests each, core 6/6, sales 3/3/3/3, worker 6/6 |
| Wiring | Every replica receives the `broker`, `redis` and `TenantStore` connection strings |
| Pool rules | Activating `greeting` through a core replica made all 4 sales replicas load and route it, both workers load it without routes, and left core unloaded |
| Broadcast convergence | Install, activate, deactivate, settings, unload and uninstall made through one replica converged on all 8 replicas; 8 queues are bound to `modules.state` |
| Zero-downtime swap | A re-install plus a settings change under load: 300 of 300 requests returned 200, and the new settings were live on every replica |
| Memory after swaps | Released copies often stay under `/api/admin/modules/unloading` for a while; later heap dumps showed only the active copy in each replica |
| Tenant resolution | `X-Tenant: acme` and `Host: acme.localhost` both resolve acme; a client-sent `X-Forwarded-Host` is overwritten by the gateway; an unknown tenant gets 404, a tenant-required module route without a tenant 400 |
| Database per tenant | `inventory`, uploaded to the core pool, migrated its schema into `tenant-acme` and `tenant-globex` on activation; rows stayed separate on both core replicas |
| Provisioning | `POST /api/tenancy/tenants` created `tenant-initech`; both core replicas migrated into it, and all 4 sales replicas (which don't load `tenancy`) knew initech through `tenants.changed` |
| Suspend | `PATCH …/initech {"status":"Suspended"}` gave 403 on core and all sales replicas, by header and by host name; `Active` restored 200 |
| Four engines | inventory 1.2.0 (one migration set per engine) served tenants on PostgreSQL, SQL Server (contoso), MySQL (umbrella) and Oracle (hooli, piedpiper) on both core replicas; the Oracle ORA-00955 bug was found here and fixed with proxy authentication |
| Layered module | inventory 1.1.1 (Domain / Application / Infrastructure, Ardalis on EF Core 10) picked up its existing schema and data; domain rules gave 409s; two full cycles unloaded on both replicas |
| Restart | Tenants, including the provisioned ones, survived a lab restart (Postgres volume) |
| Identity service (branch) | Client credentials, Code + PKCE, refresh, tenant switch, picker, non-member refusal, platform token, admin API 403s, suspend and remove revoking refresh tokens, invite and accept, `RequireMfa` refusal |

## Design lessons

### Balance per request, not per connection

Each replica is its own Aspire resource, and the gateway has one destination per replica. The first version used
Aspire's `WithReplicas`, which puts the replicas behind one proxied address, like a Kubernetes ClusterIP service.
YARP then saw a single destination, and its pooled keep-alive connection pinned **100 %** of the traffic to one
replica.

Production follows the same rule as for [gRPC](/backend/deployment-scenarios/#load-balancing-in-scenario-b): give
YARP (or the mesh) the pod endpoints, through a headless service or service discovery, not a connection-balanced
virtual IP.

### Admin calls reach one replica, so state must be broadcast

Before the broadcast, an install or activate through the gateway reached a single replica, and `/api/greeting`
returned 404 on three of the four sales replicas. The fix is the shared catalog plus the `ModuleStateChanged`
broadcast described in [Runtime modules](/backend/runtime-modules/#pools-and-replicas).

## Not modelled locally

- The CDN for the Blazor WebAssembly `_framework` files, and the client itself (see `src/Aspire/Host`).
- Edge TLS and the WAF.
- Token checks and rate limiting at the gateway: not configured yet. Every replica checks tokens and resolves the
  tenant itself; the gateway only forwards the host name.
- Autoscaling (the sales pool on CPU or requests) and scaling the worker pool on queue lag (for example KEDA on the
  RabbitMQ queue length).
