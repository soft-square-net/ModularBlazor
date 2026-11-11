---
title: Communication between modules
description: Synchronous calls for answers, messages for changes and facts, and the outbox and inbox that make messages reliable.
sidebar:
  order: 2
---

Modules talk in two ways. Pick by what the caller needs, not by habit.

| The caller… | Use | Example |
| --- | --- | --- |
| needs an answer now, to continue | **Query**, sync gRPC (or an in-process call when both modules are in one pool) | "Is this user allowed to place orders?" |
| wants another module to change its state | **Command message**, async; the caller returns `202 Accepted` | "Reserve stock for order 42" |
| announces something that happened | **Integration event**, publish/subscribe | `OrderPlaced`, `TenantUpdated` |
| reads another module's data often | **Neither**: keep a local read model, fed by that module's events | Sales keeps a copy of product prices |

## Rules for synchronous calls

- **One hop at most.** A → B is fine; A → B → C multiplies latency and the chance of failure. If a chain appears,
  replace a hop with a read model or a message.
- **Always set a deadline**, retry with jitter only for safe operations, and put a circuit breaker in front
  (`Microsoft.Extensions.Http.Resilience` or Polly).
- **Browsers do not speak native gRPC.** The Blazor client calls the gateway with REST/JSON (or gRPC-Web);
  gRPC is for service-to-service calls only.
- **Never call back through the public gateway.** Services call each other directly on the internal network
  (Kubernetes DNS or a service mesh).

## The same call, in one process or across the network

A module never references another module's implementation, only its `*.Contracts` assembly. The transport is
chosen at startup:

```text
Sales needs ICatalogQueries
   ├─ Catalog runs in the same pool   → in-process implementation (direct call)
   └─ Catalog runs in another pool    → gRPC client implementation
```

Callers do not change when a module moves. So that both paths behave the same, treat in-process calls as if
they were remote: async signatures, serializable DTOs, no shared entities, no shared transaction.

## Reliable messages: outbox and inbox

A message must not be lost when the process crashes between "save the data" and "publish the event", and must
not be applied twice when the broker redelivers it.

```text
Producer (Sales)                              Consumer (Inventory)
  ┌───────────────────────────────┐             ┌──────────────────────────────┐
  │ one transaction:              │   broker    │ inbox: seen message id?      │
  │   save order                  │ ──────────► │   yes → acknowledge, skip    │
  │   insert OrderPlaced (outbox) │             │   no  → handle + record id   │
  └───────────────────────────────┘             │         in one transaction   │
         relay publishes outbox rows            └──────────────────────────────┘
                                                  failed N times → dead-letter queue
```

| Piece | Why |
| --- | --- |
| **Outbox** table in the producer's own database | The event is saved in the same transaction as the change, so both happen or neither does |
| **Relay** | Publishes outbox rows to the broker and marks them sent; safe to run on every replica with a lock |
| **Inbox** or idempotency key | Redelivered messages are detected and skipped |
| **Dead-letter queue** | A message that keeps failing is parked for inspection instead of blocking the queue |
| **Headers** | Correlation id, tenant id and trace context travel with every message |

## Message contracts

- Contracts live in the producer's `*.Contracts` assembly and are **versioned by adding fields only**. Never
  rename or remove a field a consumer might read.
- Name events in the past tense (`OrderPlaced`) and commands in the imperative (`ReserveStock`).
- Keep messages small and self-contained: ids plus the values a consumer needs, not whole entities.

## Load balancing messages

Every replica that hosts a consumer competes for messages, so adding replicas adds throughput, with one limit:

- **Kafka**: parallelism is capped by the number of partitions. Four replicas on two partitions leave two idle.
  Use the tenant id or the aggregate id as the partition key to keep per-entity ordering.
- **RabbitMQ / Azure Service Bus**: no partition cap; when order matters, use sessions or a single active
  consumer for that queue.
