---
title: Multitenancy across pools
description: Resolve the tenant once at the gateway, carry it through every call and message, and choose where each tenant's data lives.
sidebar:
  order: 5
---

## Resolve once, carry everywhere

```text
Client ──► Gateway: tenant from host name (acme.example.com) or the JWT tenant claim
              │ forwards X-Tenant header
              ▼
           Pool: validates the header against the token's claim, sets the tenant context
              │
              ├─ gRPC call ──► another pool     tenant id in call metadata
              └─ outbox row ──► broker ──► consumer   tenant id in message headers
```

- **Never trust the header alone.** Each service checks it against the token's tenant claim; a header that
  disagrees is rejected.
- **Background work has no request.** Consumers and jobs set the tenant context from the message header or the
  job's data before touching tenant data.
- **Logs, traces and metrics** are tagged with `tenant.id`, so one tenant's problem can be found quickly.

## Where tenant data lives

With database-per-tenant *and* database-per-service, the number of databases is tenants × services. Choose per
tenant instead of one rule for all:

| Option | Isolation | Cost | Use for |
| --- | --- | --- | --- |
| Shared database per module, `TenantId` column + global query filters | Logical | Lowest | Default |
| Shared database, schema per tenant | Stronger | Medium | Tenants with custom data volume |
| Dedicated database per tenant | Strongest | Highest | Premium or regulated tenants |

The tenant store records which option each tenant uses and its connection details; modules resolve their
connection through it.

## Who owns the tenant store

One module owns the tenant store (Multitenancy, or Identity in Scenario B). Other modules never query its tables:

- they read tenant configuration through a cached lookup (Redis), and
- they react to `TenantCreated`, `TenantUpdated` and `TenantDisabled` events to refresh caches or provision
  their own schema.

## Checklist

- Message headers include the tenant id; consumers fail loudly when it is missing.
- Kafka partition keys use the tenant id or the aggregate id, so one tenant's events stay in order.
- Connection pools are sized for replicas × tenant databases × pool size, or tenants share databases.
- Migrations for tenant databases run once per release, per tenant, outside the request path.
