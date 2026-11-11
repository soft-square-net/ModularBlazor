---
title: Target architecture
description: One image deployed as several module pools behind a YARP gateway, with a broker, Redis, tenant data and OpenTelemetry.
sidebar:
  order: 4
---

Scenarios A and B are two settings of the same design: **one image, deployed as pools, each pool enabling a set
of modules and a role.**

```text
Blazor WASM client                                    CDN: _framework and static files
   │ (tenant from host name or claim)
   ▼
Edge load balancer + YARP gateway                     TLS, JWT, rate limit, tenant resolution
   │  /sales/*  ─────────────────────┐
   │  everything else ──┐            │
   ▼                    ▼            ▼
┌──────────────────────────────────────────────────────────────────────┐
│ one image · EnabledModules + Role per pool                           │
│  Core pool                 Sales pool             Worker pool        │
│  Identity · Workflow       Sales                  consumers + jobs   │
│  Inventory · ×2            ×4 · autoscaled        ×2 · scale on lag  │
└──────────────────────────────────────────────────────────────────────┘
        │                      │                         │
   Message broker          Redis                    Tenant data
   outbox → topics → DLQ   cache, locks, keys       tenant store + tenant databases
                                                    · object store
Observability: OpenTelemetry traces, metrics and logs, tagged with tenant and correlation ids
```

## Pools from one image

Each deployment of the image reads two settings:

| Setting | Values | Effect |
| --- | --- | --- |
| `EnabledModules` | `Identity,Workflow,Inventory` or `*` | Which modules this pool loads, maps and registers |
| `Role` | `Api`, `Worker`, or both | `Api` maps HTTP endpoints; `Worker` runs message consumers and scheduled jobs |

```text
Scenario A           Core  = EnabledModules: *      Role: Api,Worker   ×N
Extract one module   Core  = everything but Sales   Role: Api          ×2
                     Sales = Sales                  Role: Api          ×4
                     Worker= *                      Role: Worker       ×2
```

To move a module into its own pool: add a deployment with its `EnabledModules`, add a YARP cluster for its path,
and switch its contract registration in the other pools from in-process to the gRPC client. No module code
changes. The host's module registry (`HostModules`) is where the switch belongs.

## How a request flows

1. The client downloads `_framework` and static files from the CDN; only API calls reach the gateway.
2. The gateway validates the JWT, applies rate limits, resolves the tenant and forwards the request to the pool
   that owns the path. The worker pool receives no HTTP traffic.
3. Inside a pool, a call to a co-located module is an in-process call through its contract; a call to a module
   in another pool is a direct gRPC call, never a trip back through the gateway.
4. State changes write to the module's own database and its outbox in one transaction; the relay publishes to the
   broker; consumers in any pool that hosts the subscribing module process the message.

## Shared infrastructure

| Component | Holds |
| --- | --- |
| **Redis** | Data Protection keys, `HybridCache`, distributed locks for scheduled jobs, SignalR backplane, rate-limit counters, tenant configuration cache |
| **Message broker** | Topics or exchanges per domain, competing consumers, dead-letter queues. One logical bus: separate brokers per service would split the event stream |
| **Tenant data** | Tenant store (owned by one module) and the tenant databases; see [Multitenancy](/backend/multitenancy/) |
| **Object store** | Uploaded files and media; containers never keep files on local disk |

Migrations run once per release as a pre-deploy job, never at startup on every replica.

## Observability

- **Traces** cross the gateway, the pools and the broker: W3C trace context travels in HTTP headers and in message
  headers, so one trace shows the request, the outbox publish and the consumer.
- **Every span and log line** carries `tenant.id` and the correlation id.
- **Metrics** per pool: request rate and latency, consumer lag per queue (the worker pool scales on it), outbox
  backlog, dead-letter count.
- **Locally**, .NET Aspire runs the whole topology (pools, broker, Redis, databases) with its dashboard.

## Mistakes this design avoids

| Common diagram mistake | Here |
| --- | --- |
| CDN drawn behind the load balancer | The client loads static files from the CDN directly |
| A load balancer in front of the gateway *and* the gateway balancing again | One edge layer; YARP balances across a pool's replicas |
| Services calling each other through the public gateway | Direct internal calls only |
| Two brokers for two groups of services | One logical bus |
| A queue "writing" to storage | Consumers read the queue and write to storage |
| Writes going to a search index | Writes go to the module's database; the index is a projection fed by events |
