---
title: Hybrid architecture lab
description: The target architecture as a runnable .NET Aspire model — a YARP gateway, three module pools from one image, RabbitMQ, Redis and PostgreSQL — and what it measured.
sidebar:
  order: 5
---

`src/Aspire/Hybird` runs the [target architecture](/backend/target-architecture/) on one machine. One image
(`src/WebApi`) is deployed as three **module pools** behind a **YARP gateway**, sharing **RabbitMQ**, **Redis** and
**PostgreSQL**. Every replica exports OpenTelemetry to the Aspire dashboard.

```bash
dotnet run --project src/Aspire/Hybird --launch-profile http
```

The dashboard opens at `http://localhost:17888`; the gateway listens on `http://localhost:5080`. Docker is needed
for the broker, Redis and PostgreSQL containers.

## Resources

| Resource | What it is |
| --- | --- |
| `gateway` (port 5080) | YARP. `/api/sales/**` and `/api/greeting/**` go to the sales pool; everything else goes to core. `/pools/{core\|sales\|worker}/**` reaches one pool directly (lab only) |
| `core-1`, `core-2` | Core pool, `Role=Api`, modules: identity, workflow, inventory |
| `sales-1` … `sales-4` | Sales pool, `Role=Api`, modules: sales, greeting (the sample module stands in for Sales) |
| `worker-1`, `worker-2` | Worker pool, `Role=Worker`: modules load (services, consumers) but get no routes, and no public route reaches it |
| `broker` | RabbitMQ with the management UI |
| `redis` | Cache, locks, Data Protection keys, rate-limit counters |
| `tenant-data` | PostgreSQL: `TenantStore` (HybirdTenants), `tenant-acme`, `tenant-globex`, plus pgAdmin |

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

## What it verified

| Check | Result |
| --- | --- |
| Gateway balancing | Per request across replicas: with 12 requests each, core 6/6, sales 3/3/3/3, worker 6/6 |
| Wiring | Every replica receives the `broker`, `redis` and `TenantStore` connection strings |
| Pool rules | Activating `greeting` through a core replica made all 4 sales replicas load and route it, both workers load it without routes, and left core unloaded |
| Broadcast convergence | Install, activate, deactivate, settings, unload and uninstall made through one replica converged on all 8 replicas; 8 queues are bound to `modules.state` |
| Zero-downtime swap | A re-install plus a settings change under load: 300 of 300 requests returned 200, and the new settings were live on every replica |
| Memory after swaps | Released copies often stay under `/api/admin/modules/unloading` for a while; later heap dumps showed only the active copy in each replica |

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
- JWT validation, rate limiting and tenant resolution at the gateway: described in the research, not configured yet.
- Autoscaling (the sales pool on CPU or requests) and scaling the worker pool on queue lag (for example KEDA on the
  RabbitMQ queue length).
