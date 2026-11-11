---
title: Deployment scenarios
description: Scenario A runs identical replicas of the whole API; Scenario B splits modules into pools that scale on their own.
sidebar:
  order: 3
---

The same codebase can be deployed two ways. Most systems start with A and move individual modules to B.

## Scenario A: replicated modular monolith

Every container runs the same image with every module.

```text
               load balancer / gateway
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  API #1 [A+B+C]  API #2 [A+B+C]  API #3 [A+B+C]      stateless, same image
        └──────┬───────┴───────┬──────┘
               ▼               ▼
   Redis (cache, keys, locks)  Broker (competing consumers)
               ▼
   Tenant store + tenant databases · Object store
```

**Advantages:** simple deployment, calls between modules stay in process, low operational cost.

**Costs:** one busy module scales the whole app; a memory leak or CPU spike in one module affects all of them;
every release redeploys every module; connection pools add up (replicas × tenant databases × pool size).

### What must be shared before you add a second replica

Each of these breaks silently when there is more than one instance:

| Concern | Failure if ignored | Fix |
| --- | --- | --- |
| ASP.NET Data Protection keys | Cookies and antiforgery tokens fail on another instance | Persist keys to Redis, a database or blob storage, with one application name |
| In-memory cache | Instances serve different, stale data | `HybridCache` / `IDistributedCache` on Redis, plus invalidation events |
| Rate limiting | Each instance allows the full limit, so the real limit is N× | Limit at the gateway, or keep counters in Redis |
| Scheduled jobs | Every instance runs the job | Clustered Hangfire or Quartz, a distributed lock, or a worker pool |
| EF Core migrations and seeding | Instances race each other at startup | Run once as a pre-deploy job or init container |
| SignalR | Messages reach only clients on the same instance | Redis backplane or Azure SignalR |
| Tenant configuration cache | A change is seen by one instance only | Cache in Redis, invalidate with a `TenantUpdated` event |
| Uploaded files | Files land on one container's disk | Object storage only |
| Health | Traffic reaches an instance that is still starting | Separate `/health/live` and `/health/ready`; ready checks the database and broker |

The "easier transactions" advantage holds only when modules share one connection. Modules here own their own
schema and `DbContext`, so atomic work across modules still needs a shared transaction or, better, the
[outbox](/backend/communication/#reliable-messages-outbox-and-inbox), which keeps working after a split.

## Scenario B: independently deployed pools

Modules are grouped into pools; each pool has its own replicas, scaling rule and release.

```text
Identity API   ×3     login and token refresh; JWTs are validated locally in every service
Sales API      ×4     autoscaled on CPU or requests per second
Inventory API  ×2     two is the minimum for high availability; idempotent stock updates
Workflow API   ×2     saga state in a database, so any replica can resume a workflow
```

**Advantages:** independent scaling, deployment, fault isolation and resource allocation.

**Costs:** distributed tracing becomes mandatory, operations across services become eventually consistent (the
UI shows "pending" states), contracts need versioning, and every pool needs its own pipeline and dashboards.

### Load balancing in Scenario B

| Traffic | Mechanism | Watch out for |
| --- | --- | --- |
| Client → gateway | Edge load balancer or ingress | Terminate TLS and run the WAF here |
| Gateway → pool | YARP cluster per pool, by path prefix (`/sales/*`) | One destination per replica, health-checked. Behind a single connection-balanced address (a ClusterIP service), YARP's keep-alive connection pinned 100 % of traffic to one replica in the [lab](/backend/hybrid-lab/) |
| Service → service (gRPC) | Client-side balancing or a service mesh | gRPC keeps long-lived HTTP/2 connections: a plain L4 Kubernetes Service sends every call to one pod. Use `Grpc.Net.Client` with a DNS resolver and a headless service, or Linkerd/Istio |
| Messages | Competing consumers | See [load balancing messages](/backend/communication/#load-balancing-messages) |

### Data ownership

**No service reads another service's tables.** Sharing a database *server* is fine; sharing a schema or
credentials is not. Data another service needs arrives through its API or its events.

## Build for B, deploy as A

Design every module as if it were already separate, and deploy it inside the monolith until it needs to scale or
fail on its own. Moving it out is then a deployment change. That only works if these hold from the first day:

1. A module references other modules only through their `*.Contracts` assemblies. Enforce it with architecture
   tests (NetArchTest or ArchUnitNET) in CI.
2. No shared `DbContext`, no joins across module schemas, no transaction across modules.
3. In-process calls are written as if remote: async, DTOs only, no entities, no shared mutable state.
4. The transport hides behind the contract: the same interface has an in-process and a gRPC implementation.
5. Messages always go through the real broker.
6. Module APIs are coarse-grained. A chatty interface that is free in process becomes slow over the network.

The [target architecture](/backend/target-architecture/) shows how one image serves both scenarios.
