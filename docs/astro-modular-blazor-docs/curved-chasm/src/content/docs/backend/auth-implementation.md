---
title: "Authentication: implementation"
description: What is built so far from the auth design — the host's JWT validation, permissions and time-windowed grants, module activation checks, and the OpenIddict identity service.
sidebar:
  order: 12
---

This page tracks what is **implemented** from the [authentication and authorization design](/backend/auth-design/).

| Design step | Status |
| --- | --- |
| 1. Identity service (OpenIddict) in Aspire; JwtBearer, fallback policy and admin API protection in the host | Host side **done** (on `main`). Identity service **merged into `main` and verified**; pool authority wiring is in place |
| 2. `RequirePermission`, manifest permissions and the activation check; unload test of the policy cache | **Done** |
| 3. Tenant middleware, membership check, subscription gating | Tenant middleware **done** ([Tenancy and tenant data](/backend/tenancy-data/)). Per-request membership check and subscription gating not yet |
| 4. Grant store, `IAccessScopes`, claims mapping | **Done** |
| 5. Shifts and content modules | Starter modules built; feature development is next |
| 6. Runtime gaps for Elsa (module hosted services, sub-pipeline, hot-unload declaration) | Implemented on `claude/module-hosted-services-c8094b`; Elsa server module itself remains future work |

## The host (`src/WebApi/WebApi`)

Every replica checks tokens and has the final say; permissions are looked up on the server, never carried in the
token.

```text
request ─► UseRouting ─► UseAuthentication (JwtBearer) ─► UseTenancy (tenant + claim check) ─► UseAuthorization ─► endpoint
                                                                                                 │
              PermissionRequirement ─► IAccessScopes ─► GrantCache (per tenant+user, 5 min, cleared via "access.grants.changed")
                                                            └─► platform.access_grants (tenant store) │ in memory without a store
```

| Piece | Where | What |
| --- | --- | --- |
| `RequirePermission(...)`, `PermissionRequirement`, `PlatformClaims`, `PlatformRoles`, `PlatformPermissions`, `AccessScope`, `GrantSources`, `IAccessScopes`, `IGrantStore`, `IPermissionCatalog`, `ModuleManifest.Permissions` | `WebApi.Contracts/Security` | Everything a module sees. Host types only, so nothing in the authorization pipeline can pin a module |
| JwtBearer, fallback policy, permission handler, grant cache and store, broker invalidation | `WebApi/Security` | `builder.AddPlatformSecurity("broker")`; `app.UseRouting(); app.UsePlatformSecurity();` |
| Activation checks | `Modularity/ModuleAuthorization.cs` | Activation fails (400) on an undeclared permission, a requirement type defined by the module, or a named policy |
| Grant admin, permission catalog, `/me` with permissions | `identity` core module 1.1.0 | `GET`/`POST /api/identity/grants`, `DELETE /grants/{id}` (`access.grants.manage`), `GET /permissions` |

### Tokens

- `Auth:Authority` points at the identity service (OIDC discovery and JWKS); `Auth:Audience` defaults to
  `modular-webapi`.
- Inbound claim mapping is off, so the host reads `sub`, `tenant` and `role` exactly as issued.
- Without an authority, the standard `Authentication:Schemes:Bearer` section applies: that is what
  `dotnet user-jwts` writes for development.

### Secure by default

Every endpoint needs a signed-in caller unless it calls `AllowAnonymous()`. Anonymous today: `/health`, the OpenAPI
documents and Scalar (where enabled), and `/api/identity/me`.

### Permissions and grants

- **Endpoint check (coarse):** the caller holds the permission in some scope of the request's tenant, or through a
  platform role.
- **Per-resource checks are module code:**
  `IAccessScopes.HasPermissionAsync(permission, [AccessScope.Press(p), AccessScope.Category(c)])`. List filters use
  `ScopesAsync(permission)`; another user's rights (an assignee, say) come from `UserHasPermissionAsync`.
- **A grant** is tenant × user × permission × scope (`tenant`, `press:{id}`, `category:{id}`), with an optional
  `validFrom`/`validTo` (UTC) and a source (`standing`, `shift:{id}`).
- **Windows are evaluated at check time**, so a shift grant starts and ends on the clock without any cache event.
- `IGrantStore.ReplaceSourceAsync` publishes a rota in one transaction; `EndAsync` ends a user's grants of a source
  early (check-out).
- **Platform permissions can't be granted** (400), except `access.grants.manage`, which tenant admins need.
- **Storage:** `platform.access_grants` in the tenant store, with `AddAccessGrants` migrations for all four engines.
  Without a store, grants are in memory, seeded from `Access:Grants:N:{Tenant,UserId,Permission,Scope}`.

### Platform roles and protected endpoints

- `platform-admin` holds every platform permission (`platform.modules.manage`, `platform.tenants.manage`,
  `access.grants.manage`) in any tenant and without one. Other mappings come from `Access:Roles:{role}:N`.
- `/api/admin/modules` needs `platform.modules.manage`; tenant create and update need `platform.tenants.manage`; the
  grant API needs `access.grants.manage`.

### In a module

```csharp
public ModuleManifest Manifest { get; } = new("content", "Content", "1.0.0", "content")
{
    Permissions =
    [
        new PermissionDefinition("content.author", "Write and submit articles"),
        new PermissionDefinition("content.publish", "Publish approved articles")
    ]
};

app.MapPost("/{id}/publish", PublishAsync).RequirePermission("content.publish");   // any of several: RequirePermission("a", "b")
```

The declared permissions are listed in the permission catalog (`GET /api/identity/permissions`).

Using a permission that the manifest doesn't declare, defining an `IAuthorizationRequirement` in the module, or using
a named policy makes activation fail: those types would be cached by the host's authorization pipeline and keep the
module in memory.

### Development tokens

```bash
dotnet user-jwts create --project src/WebApi/WebApi --name admin --role platform-admin
dotnet user-jwts create --project src/WebApi/WebApi --name editor1 --claim tenant=acme
```

`user-jwts` tokens have `aud` set to the launch-profile URLs (`http://localhost:5298`, `https://localhost:7276`).
Replicas on other ports need `--audience` or `Authentication:Schemes:Bearer:ValidAudiences`.

### Verified

On a standalone host (port 5298), with grants both in memory and in PostgreSQL:

- The admin API returns 401 anonymous, 403 for an editor and 200 for `platform-admin`; tenant writes return 403 for
  an editor.
- A token for `acme` with `X-Tenant: globex` gets 403.
- Added and revoked grants take effect on the next request; a grant whose `validFrom` is in the future is not yet
  effective; granting a platform permission returns 400.
- A test module was refused (400) for an undeclared permission, and again for its own requirement type. The declared
  version served 403, then 200 after the grant, and it unloaded afterwards.
- The `AddAccessGrants` migration ran on PostgreSQL (SQL Server, MySQL and Oracle migrations exist but weren't run).

## The identity service

The identity service is merged into `main` (project `src/WebApi/Identity/WebApi.Identity.Server`) and runs as an independent Aspire process. In the Hybird lab, it is exposed at `http://localhost:5090/`; WebApi pools use it as their authority. Identity remains outside the runtime-module loader.

OpenIddict (authorization server) and ASP.NET Core Identity (accounts), in its own process with its own database,
never as a runtime module. It owns global accounts, tenant memberships, the tenant security policy and token
issuing. It doesn't own permissions or grants: the WebApi host looks those up.

| What | Value in the Hybird lab |
| --- | --- |
| Issuer (`iss`) | `http://localhost:5090/` (config `Identity:Issuer`; the trailing slash is part of it) |
| Audience (`aud`) | `modular-webapi` |
| Discovery, JWKS | `/.well-known/openid-configuration`, `/.well-known/jwks` |
| Authorize, token | `/connect/authorize`, `/connect/token` |
| Userinfo, end session, revoke | `/connect/userinfo`, `/connect/endsession`, `/connect/revoke` |

Access tokens are signed JWTs (RS256, `typ: at+jwt`), not encrypted, valid 10 minutes. Refresh tokens last 14 days
and rotate on every use. Resource servers validate with `JwtBearer`, `MapInboundClaims = false`, and
`RequireHttpsMetadata = false` in the lab.

### Clients and claims

| Client | Type | Flows |
| --- | --- | --- |
| `blazor-client` | public | Authorization Code + PKCE (required), refresh token; scopes `openid profile email offline_access api` |
| `elsa-workflows` | confidential | client credentials; scope `api` |

| Claim | Meaning |
| --- | --- |
| `sub` | Global user id, the same in every tenant |
| `tenant` | The one tenant this token is for; missing only in a platform token and in client-credentials tokens |
| `role` | Platform roles only (`platform-admin`); tenant roles stay memberships |
| `name`, `email` | Display name (tenant profile first) and account email |
| `amr` | How the user signed in, a JSON array (`["pwd"]`, or with `"mfa"`) |

Tokens never carry permissions, presses, categories or shifts.

### Flows

- **Sign in for a tenant:** the authorize request names the tenant (`tenant=acme`, or `login_hint=tenant:acme`). A
  single active membership picks itself; several go to a tenant picker; none gives a token only to a platform-role
  user (a *platform token* without `tenant`).
- **Issuing checks** the account (not locked out), an **Active** membership, and the tenant's security policy. A
  failure is an OAuth error such as `access_denied` with a description.
- **Refresh** checks everything again.
- **Switching tenant:** the authorize request again with the other tenant and `prompt=none`; no password, a new token
  pair bound to that tenant.
- **Tenant security policy:** per-tenant `RequireMfa` refuses tokens unless the sign-in used MFA. The flag works; MFA
  enrolment and the second-factor step aren't built yet.

### Membership admin API

Callable by `platform-admin` for any tenant, or by an active `tenant-admin` member with a token for that tenant.

| Method and path | Does |
| --- | --- |
| `GET /api/admin/tenants/{tenant}/members` | Lists members |
| `POST /api/admin/tenants/{tenant}/members` | Invites by email (status `Invited`); the user accepts on `/Account/Invitations` |
| `POST …/members/{userId}/suspend` | Suspends and **revokes that tenant's refresh tokens and codes** |
| `POST …/members/{userId}/activate` | Re-activates a suspended member |
| `DELETE …/members/{userId}` | Removes the membership and profile, and revokes the tenant's tokens |
| `PUT /api/admin/tenants/{tenant}` | Display name and `RequireMfa` (platform admin only) |

Access tokens already issued stay valid until they expire (at most 10 minutes); the host's per-request membership
check, still to be built, closes that gap.

### Data, accounts and keys

- PostgreSQL database `identity` (Aspire resource `identity-db` on the `tenant-data` server), schema `identity`:
  the Identity and OpenIddict tables plus `TenantMemberships`, `TenantProfiles` and `Tenants` (policy). Npgsql only:
  the service has one database of its own and doesn't use `WebApi.Data`.
- Development accounts (`Identity:Seed`): `admin@modular.local` (platform-admin, no memberships),
  `editor@modular.local` (acme, globex), `acme-admin@modular.local` (tenant-admin of acme).
- Signing keys: development certificates locally. Production needs keys from a key vault with rotation through JWKS,
  and Data Protection keys in Redis before running more than one replica (TODO).

**Verified** in the full Hybird lab: client credentials, Code + PKCE, refresh, tenant switch with `prompt=none`,
tenant picker, non-member refusal, platform-admin token, admin API 403s, suspend and remove revoking refresh tokens,
invite and accept, and the `RequireMfa` refusal.

## Scalar OAuth in the Hybird lab

Scalar uses the public `scalar-client` with Authorization Code + PKCE. It has no client secret. The browser signs in at the separate identity service, then Scalar exchanges the authorization code for a token and sends that token to the selected API pool.

```text
Browser / Scalar UI                         Identity service                 YARP → WebApi pool
http://localhost:5080/.../scalar/           http://localhost:5090             http://localhost:5080
       │                                             │                                │
       ├─ top-level /connect/authorize ────────────►│                                │
       │◄─ login, then redirect with code ──────────┤                                │
       ├─ POST /connect/token + PKCE (fetch) ──────►│                                │
       │◄─ access_token (JWT) ──────────────────────┤                                │
       ├─ API request + Authorization: Bearer ─────────────────────────────────────►│
       │                                             │                 validate JWT + authorize
```

The authorize redirect and token exchange have different browser rules:

| Setting | What it matches | Hybird lab example |
| --- | --- | --- |
| CORS allowed origin | Only scheme, host and port of browser JavaScript | `http://localhost:5080` (one entry covers root and pool Scalar paths) |
| OAuth redirect URI | Exact callback URL, including path | `http://localhost:5080/scalar/` or `http://localhost:5080/pools/sales/scalar/` |

A top-level navigation to `/connect/authorize` is not blocked by CORS. Scalar's JavaScript token request to `/connect/token` is cross-origin and needs the gateway origin in the identity service's CORS allowlist. The redirect URI must separately match an exact URI registered for `scalar-client`.

### A/B deployment and Scalar URLs

In Scenario A, open Scalar through the stable gateway, usually `http://localhost:5080/scalar/`. In Scenario B, use the pool route, for example `http://localhost:5080/pools/sales/scalar/` or `/pools/worker/scalar/`. Register the matching full callback URI for every Scalar entry point. Do not use a per-replica Aspire URL such as `http://localhost:65033/scalar/` as a durable callback: its port may change at restart. The gateway URL stays stable and YARP routes the request to the pool.

The current Development CORS setting is:

```json
{
  "Cors": {
    "AllowedOrigins": [ "http://localhost:5080" ]
  }
}
```

The Scalar client registration must include the exact root and pool redirect URIs. These localhost values are for the Hybird development lab. Configure the actual HTTPS origin and callbacks for each customer deployment; do not use wildcard origins or callbacks.

### Troubleshooting Scalar authorization

- **“Failed to fetch” after login:** inspect the browser Network panel. If `/connect/token` fails with a CORS error, allow the exact Scalar origin in identity-service CORS. If it is a 400, compare the `redirect_uri` and client registration exactly, including scheme, port, path and trailing slash.
- **401 from a protected API:** Scalar did not attach a valid access token, or the API rejected its issuer/audience/signature/expiry. Re-authorize and inspect the request's `Authorization: Bearer` header and response body.
- **403 from a protected API:** the token was accepted, but it lacks the required permission or scope.
- **A different port after restart:** use the fixed gateway origin and pool path; do not bookmark the random replica address.

## Not built yet

- Per-request tenant-membership validation in WebApi, with revocation propagated from the identity service.
- Shift grant templates and Elsa workflow integration; MFA enrolment; production signing-key management and rotation.
- Gateway-side JWT checks are not required for correctness because each WebApi pool validates tokens. Add gateway checks only as an additional edge control, and keep authorization enforcement in the destination API.
