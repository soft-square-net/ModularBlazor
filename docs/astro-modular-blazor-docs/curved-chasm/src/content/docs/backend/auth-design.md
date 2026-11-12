---
title: Authentication and authorization
description: Design note for the WebApi runtime-module platform (newsroom SaaS) — OpenIddict identity, tenant memberships, scoped and time-windowed grants, module permissions, the content workflow, shifts and Elsa 3.
sidebar:
  order: 11
---

:::caution[Status]
Final, agreed with the user. Items marked *(assumed)* were recommended and never contested, but not explicitly
confirmed. **This page is the design decision.** Implementation has started: the host side of steps 1, 2 and 4 and the
tenant middleware are on `main`, and the identity service is on a branch. See
[Authentication: implementation](/backend/auth-implementation/) and [Tenancy and tenant data](/backend/tenancy-data/).
:::

## 1. Principles

1. Identity runs as its own service, never as a runtime module.
2. Modules work with permission names (plain strings). Every authorization type belongs to the host, so modules stay
   [unloadable](/backend/runtime-module-unloading/).
3. A grant is a permission × a scope × a validity window, within one tenant. Grants are looked up on the server, never
   carried in the token.
4. The host and modules enforce at request time. Elsa and the shifts module only *produce* grants and state changes.
5. Time rules are enforced by the clock, never by a timer. A component that's down or deactivated never leaves anyone
   with access they shouldn't have.
6. The code is always multi-tenant. A dedicated deployment is the same images with one tenant.

## 2. Deployment models

| | Shared SaaS (subscriptions) | Dedicated deployment (on request) |
| --- | --- | --- |
| Tenants | Many: each customer company is one | One |
| Identity service | One shared issuer | The customer's own, with its own signing keys |
| Data | Identity DB shared (TenantId on rows); content DB per tenant | All the customer's own |
| Modules | Installed by the platform operator; plan-gated per tenant | Only packages signed by the vendor |

## 3. Identity and authentication

- **Identity service:** OpenIddict + ASP.NET Core Identity, its own Aspire project and database.
  - Owns: accounts, credentials, MFA, lockout, recovery, email confirmation, external logins (per-tenant Entra or
    Google, as dynamic schemes), tenant memberships, token issuing.
  - Tenant-branded login pages.
- **Accounts:** one global account per person.
  - `TenantMemberships(UserId, TenantId, status, invitedBy, joinedAt)`, plus a profile per tenant.
  - Sign in once, pick a tenant (or the subdomain picks it), get a token for **one** tenant. Switching tenant means a
    new token without signing in again.
  - Membership is checked whenever a token is issued or refreshed.
- **Tenant security policy, enforced when a token is issued for that tenant:** require MFA (enrol first), require the
  tenant's own identity provider (`idp`/`amr`), maximum session length. The password policy is platform-wide.
- **Tokens:**
  - Lifetime and signing: JWT access tokens of 5–15 minutes plus refresh tokens. Asymmetric signing certificates,
    kept in the database or a key vault and rotated; replicas only get the public keys.
  - Claims: `sub` (global), `tenant`, platform roles. Never press, category, shift or permission claims.
- **Clients:**
  - Blazor: Authorization Code + PKCE, behind a BFF.
  - Elsa and the workers: client credentials.
- **Where tokens are checked** *(assumed)*:
  - Every WebApi replica checks tokens and has the final say.
  - The YARP gateway rejects invalid tokens, applies rate limits per user and tenant, and strips forgeable headers. It
    makes no decisions about routes.
- **Infrastructure:** Data Protection keys go to Redis.

## 4. Tenancy

- **Tenant match:** the request's tenant (subdomain or `X-Tenant`) must equal the token's tenant; otherwise 403.
  Tenant resolution is a host middleware; the `tenancy` module keeps the directory.
- **Membership check:** the host checks active membership on each request (cached, cleared through the broker).
  - Removing a membership revokes that tenant's refresh tokens and ends access within seconds.
- **Scopes inside a tenant:** presses and categories. A scope is a set of (press, category) pairs, so a shift section
  may span presses.
- **Two levels of admin:**
  - Platform operator: installs modules, provisions tenants, manages subscriptions.
  - Tenant admin: invites by email (the user accepts), suspends or removes members, manages roles, grants and
    settings. Can't reset passwords, change emails, delete accounts, or see a user's other tenants.
- **Subscriptions:** the module catalog is global; each tenant's plan switches modules on or off for that tenant (host
  check). Module settings are global defaults plus per-tenant overrides.
- **Keyed by tenant:** grants, `IAccessScopes`, caches, audit, and Elsa's workflows and timers.
- **Account deletion:** tenant content keeps the `sub` and the author is pseudonymised.
- **Moving a tenant from SaaS to dedicated:** copy its members' accounts (then a password reset, or federation with
  the SaaS identity service).

See also [Multitenancy across pools](/backend/multitenancy/).

## 5. Authorization model (host)

- **Grants:** `(tenant, user, permission, scope, validFrom, validTo, source)`.
  - Standing grants: `content.author`, `content.editor` per category or press.
  - Shift grants come from the rota (written by the shifts module). Valid from the scheduled start to the earlier of
    check-out or the scheduled end.

| Rota role (per shift) | Grants |
| --- | --- |
| Manager | content.accept, content.assign, content.transfer, content.return |
| Desk | content.publish, content.return |
| Editor | content.review (assigned articles only) |

- **`IAccessScopes` (Contracts):** answers "scopes where this user has permission P in this tenant now". Used for
  single-article checks and list filters. Cached until the next window boundary and cleared through the broker.
- **Audit:** every action records who did it, who started it, the tenant, and the grant or shift that allowed it.
- **Permission names:** `content.editor` (standing) and `content.review` (shift) stay separate.

## 6. Endpoint authorization in runtime modules

- **Declaring permissions:** `RequirePermission("...")` (Contracts) builds the policy inline on the endpoint.
  `ModuleManifest.Permissions` declares the module's permissions; activation fails if an endpoint uses one that isn't
  declared.
- **Default:** a signed-in user is required; modules opt out with `AllowAnonymous`.
- **Unload safety:** module-defined `IAuthorizationRequirement` types are rejected on activation. Fine-grained checks
  are module code that calls `IAccessScopes`.
- **To verify:** that `AuthorizationPolicyCache` lets go of a module's endpoints on unload (gcroot test, as in
  [Unloading runtime modules](/backend/runtime-module-unloading/)).
- **Module admin API:** `/api/admin/modules` requires `platform.modules.manage`, a platform operator only. The policy
  is registered at startup. It's never routed through the public gateway in production. Package signing comes next.

## 7. Content workflow (the content module owns state)

```text
draft → submitted ─(Manager accepts)→ accepted ─(Manager assigns within AutoAssignDelay, else Elsa)→ in review
      → approved → scheduled (bound to the approved version) → published (Desk)
returned ← Manager or Desk;  an edit while scheduled → schedule cancelled → awaiting Desk re-approval
```

- **Owner edit:** state ∈ {draft, returned} ∨ (submitted ∧ now < submittedAt + OwnerEditWindow ∧ not accepted or
  assigned). Accepting or assigning locks the owner out at once.
- **Assignee edit:** assigned to them ∧ the assignment's shift is active now ∧ content.review in scope.
- **Assigning:**
  - Needs content.assign in scope now.
  - The assignee must be an Editor on the rota in an active shift covering the category.
  - Compare-and-set on state; the loser gets 409. Nobody eligible → the article stays queued and Elsa escalates.
- **Publishing:** content.publish in scope now ∧ (not the author or reviewer ∨ standing content.editor on the
  article's category).
- **Scheduled publishing:** the right is checked at scheduling time. It still publishes after the Desk user's shift
  ends; any edit cancels it.
- **Unaccepted submissions:** stay submitted. Elsa reminds the manager, and they move with handover. Elsa never
  accepts.

## 8. Shifts and handover

- **Rota:** a table owned by the shifts module, which writes the shift grants. Elsa runs the processes around it.
- **Check-out:**
  - It ends access early.
  - The outgoing manager chooses which unfinished work transfers.
  - If nobody checks out by scheduled end + CheckoutGrace, Elsa checks the shift out and transfers all unfinished work
    to the incoming queue (`transferredFrom`). Access has already ended by the clock.
- **Settings:** AutoAssignDelay = 5m, CheckoutGrace = 15m, OwnerEditWindow = 24h.
  - Platform defaults, tenant overrides, section overrides.
  - Changing them needs `newsroom.settings.manage`.

## 9. Elsa 3 (Elsa Server inside its own runtime module)

- **Placement:** a dedicated `workflow` pool with no other modules.
  - `HotUnload = false`: upgrades are a rolling restart.
  - Redis distributed locks; its own Postgres schema; Elsa tenancy on.
- **Runtime gaps to build:**
  - starting and stopping a module's hosted services;
  - a catch-all route running a private sub-pipeline for Elsa's API and Studio (needs a spike).
- **Security:**
  - Elsa's built-in identity is off. The host claims transformation maps `workflows.design` and `workflows.run` to
    Elsa's permission claims. Designing workflows is a platform-level right.
  - Elsa signs in as the `elsa-workflows` client and calls the content and shifts module APIs over HTTP. Every call
    carries the tenant, which the host checks.
  - Elsa may only issue grants from the shift templates. Every action is logged with actor = elsa and the initiator.

## 10. Responsibilities

| Component | Owns |
| --- | --- |
| Identity service (OpenIddict) | Accounts, memberships, credentials, MFA, external IdPs, tenant security policy, token issuing |
| WebApi host | Token checks, tenant match and membership check, subscription gating, fallback policy, grant store, `IAccessScopes`, audit hooks, admin API policy, Elsa claim mapping |
| `WebApi.Contracts` | `RequirePermission`, `PermissionRequirement`, claim names, `ModuleManifest.Permissions`, `IAccessScopes`, `IGrantStore` |
| `identity` runtime module *(assumed; possibly renamed `access`)* | Grant and role admin API (checks Elsa's grants against the templates), permission catalog, `/me` |
| `tenancy` runtime module | Tenant directory, plans and module enablement admin |
| Shifts module | Rota, sections, check-in and check-out, writing shift grants |
| Content module | States, the time windows, owner and assignee, transition API, list filters |
| Elsa module | Orchestration: auto-assignment, reminders, automatic check-out, handover, scheduled publishing |
| YARP gateway | Rejecting invalid tokens, rate limits, stripping headers, BFF |

## 11. Implementation order (when asked)

1. Identity service (OpenIddict) in Aspire. JwtBearer, the fallback policy and admin API protection in the host.
2. Contracts: `RequirePermission` and the manifest permissions, with the activation check. Unload test of the policy
   cache.
3. Tenant middleware, membership check, subscription gating.
4. Grant store, `IAccessScopes`, claims mapping.
5. Shifts and content modules with the workflow rules.
6. Runtime gaps for Elsa (hosted services, sub-pipeline spike), then the Elsa module.
