---
title: Backend overview
description: How the API is deployed, how modules talk to each other, and how modules are added while the API runs.
sidebar:
  order: 1
---

The API (`ModularBlazor.Host`) is a **modular monolith**: every module (Auth, Catalog, Multitenancy, Media, Todo, …)
lives in one solution with its own Domain, Application and Infrastructure projects. This section describes how that
API is deployed, scaled and extended:

- **One codebase, two ways to deploy it.** Run the same image as identical replicas (Scenario A), or split modules
  into separate pools that scale on their own (Scenario B). The design lets a module move from A to B by
  configuration, not by rewriting it.
- **Hybrid communication.** Modules call each other synchronously when they need an answer now, and send messages
  through a broker when they change another module's state or announce a fact.
- **Modules at runtime.** An admin can upload a module package while the API runs; it is installed, activated and
  served without a restart.

## The big picture

```text
Client (Blazor WASM, Astro pages)
   │  static files ──► CDN
   ▼
Edge load balancer + YARP gateway        TLS, JWT, rate limit, tenant resolution
   │
   ├──► Core pool   [Identity · Workflow · Inventory]  ×2     same image,
   ├──► Sales pool  [Sales]                            ×4     EnabledModules
   └──  Worker pool [consumers + scheduled jobs]       ×2     and Role per pool
                 │
   Message broker · Redis · Tenant store + tenant databases · Object store
   OpenTelemetry: traces, metrics, logs (tenant + correlation ids) across everything
```

## Where it lives in the repository

| Path | What |
| --- | --- |
| `src/api/ModularBlazor.Host` | The production API host and its built-in modules (`HostModules`) |
| `src/WebApi/WebApi` | Runtime module prototype: one image that runs as any pool |
| `src/WebApi/WebApi.Contracts` | `IRuntimeModule` and `ModuleManifest`, shared by the host and every runtime module |
| `src/WebApi/Modules/Core/` | **Core modules** (`Identity`, `Tenancy`): built with every WebApi release and enabled by default |
| `src/WebApi/Modules/Custom/` | **Custom modules**: built on their own and uploaded while the app runs |
| `src/WebApi/Modules/Custom/WebApi.Modules.Greeting` | Sample custom module, uploaded as a package |
| `src/WebApi/Modules/Custom/Inventory` | Sample layered custom module (Domain, Application, Infrastructure) |
| `src/Aspire/Hybird` | Aspire lab: gateway, three pools, RabbitMQ, Redis, PostgreSQL |

`src/WebApi/Modules/Directory.Build.props` holds the shared settings for layered modules; `Core/` and `Custom/` each
add their own `Directory.Build.props` on top. Both kinds are ordinary runtime modules: they differ only in how they
arrive (with the release, or by an admin upload). See [Core and custom modules](/backend/runtime-modules/#core-and-custom-modules).

## Read in this order

| Page | Answers |
| --- | --- |
| [Communication](/backend/communication/) | When to call, when to send a message, and how to make messages reliable |
| [Deployment scenarios](/backend/deployment-scenarios/) | Replicated monolith or separate services, and what each needs to be safe |
| [Target architecture](/backend/target-architecture/) | The combined design: gateway, module pools, broker, Redis, observability |
| [Hybrid architecture lab](/backend/hybrid-lab/) | The target architecture running locally with .NET Aspire, and what it measured |
| [Multitenancy](/backend/multitenancy/) | How the tenant travels through calls and messages, and where tenant data lives |
| [Endpoints: Minimal API + Carter](/backend/endpoints-carter/) | Why Minimal API + Carter, and not FastEndpoints |
| [Runtime modules](/backend/runtime-modules/) | How a module is installed, activated and served while the API runs, on every replica of every pool |
| [Unloading runtime modules](/backend/runtime-module-unloading/) | What it takes to free a module's memory, measured with heap dumps |
| [Authentication and authorization](/backend/auth-design/) | Design note (not implemented): identity service, tenant memberships, scoped grants, module permissions, newsroom workflow |

The admin endpoints and packaging rules are in the [runtime modules API reference](/reference/runtime-modules-api/).

## Principles

- **Build for Scenario B, deploy as Scenario A** until a module really needs to scale or fail on its own.
- **A module only knows another module's contracts**: DTOs, interfaces and events, never its tables or classes.
- **Use the real broker even in one process**, so moving a module out never changes how its messages behave.
- **Nothing important lives in one instance's memory**: keys, caches, locks and files are shared.
