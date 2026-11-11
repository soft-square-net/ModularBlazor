---
title: "Endpoints: Minimal API + Carter"
description: Why the API uses Minimal API with Carter modules, and not FastEndpoints, when modules are loaded while the app runs.
sidebar:
  order: 6
---

**Decision:** keep **Minimal API + Carter**. Every module exposes its endpoints as `ICarterModule` classes. Do not
add FastEndpoints.

## Context

- Built-in modules are compiled into the host. `HostModules` lists them, `CarterModuleTypes()` finds their
  `ICarterModule` types, and `app.MapCarter()` maps them at startup.
- Modules can also be **uploaded while the API runs** (`.dll` or `.nupkg`): the host reads the assembly, registers
  its manifest in the modules schema, and the admin installs, activates and loads it without a restart.

So the endpoint framework must accept new endpoints after startup.

## Options

| | FastEndpoints + Carter | Minimal API + Carter |
| --- | --- | --- |
| Endpoint discovery | `AddFastEndpoints()` scans assemblies once; `UseFastEndpoints()` builds routes once | `ICarterModule.AddRoutes(app)` can be called at any time, against any route builder |
| Endpoints after startup | Not supported: a new module needs a restart | Supported, through a dynamic `EndpointDataSource` |
| Models in the codebase | Two (FastEndpoints classes and Carter modules), two validation pipelines, two OpenAPI paths | One |
| What you get | Request–endpoint–response classes, built-in validation, pre/post processors | Endpoint filters, route groups, FluentValidation: close enough with a small convention |

## Why Carter still fits

`ICarterModule` is a contract with one method, `AddRoutes(IEndpointRouteBuilder app)`. The host depends on that
contract, not on `MapCarter()`'s startup scan:

```text
built-in module   → MapCarter() at startup
runtime module    → module.AddRoutes(privateRouteBuilder) on activation
                    → endpoints added to a dynamic EndpointDataSource
                    → change token → routing rebuilds, no restart
```

## Consequences

- Endpoints are written the same way in built-in and runtime modules.
- The hard parts of runtime modules do not depend on the endpoint framework: a per-module DI container, assembly
  load contexts and cache eviction. See [Runtime modules](/backend/runtime-modules/).
- Teams that want the request–endpoint–response style write one class per endpoint inside a Carter module, with
  an endpoint filter for validation.
