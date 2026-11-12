# WebApi.Identity.Server

The identity service of the WebApi platform: **OpenIddict** (authorization server) and **ASP.NET Core Identity**
(accounts). It runs as its own process with its own database, never as a runtime module. It implements step 1 of the
auth design (`docs/.../backend/auth-design.md`).

It owns global accounts, tenant memberships, the tenant security policy and token issuing. It doesn't own
permissions or grants: the WebApi host looks those up on the server.

## Endpoints and values for resource servers

| What | Value in the Hybird lab |
| --- | --- |
| Issuer (`iss`) | `http://localhost:5090/` (config `Identity:Issuer`; the trailing slash is part of it) |
| Audience (`aud`) | `modular-webapi` |
| Discovery | `http://localhost:5090/.well-known/openid-configuration` |
| JWKS | `http://localhost:5090/.well-known/jwks` |
| Authorize / token | `/connect/authorize`, `/connect/token` |
| Userinfo / end session / revoke | `/connect/userinfo`, `/connect/endsession`, `/connect/revoke` |

Access tokens are signed JWTs (RS256, `typ: at+jwt`) and are **not encrypted**. A resource server validates them with
`JwtBearer`, with `Authority = http://localhost:5090/`, `Audience = modular-webapi`, and `RequireHttpsMetadata = false`
in the lab. It maps the claims below without the inbound claim-type mapping (`MapInboundClaims = false`). Access
tokens last 10 minutes (`Identity:AccessTokenLifetime`). Refresh tokens last 14 days and rotate on every use.

## Clients

| Client | Type | Flows | Scopes |
| --- | --- | --- | --- |
| `blazor-client` | public | Authorization Code + **PKCE (required)**, refresh token | `openid profile email offline_access api` |
| `elsa-workflows` | confidential | client credentials | `api` |

The seeder registers both clients (create or update) at every start. The `blazor-client` redirect URIs are in
`appsettings.json` (`Identity:BlazorClient`), for the Blazor client on `https://localhost:5001`. The
`elsa-workflows` secret is in `appsettings.Development.json`. Outside Development it must come from a secret store,
and the client isn't registered while the secret is missing.

Asking for the `api` scope (or any scope) gives a token whose audience is `modular-webapi`.

## Claims

User tokens carry only these claims:

| Claim | Meaning |
| --- | --- |
| `sub` | Global user id (the same in every tenant) |
| `tenant` | The one tenant this token is for. It's missing only in a *platform token* (see below) |
| `role` | **Platform roles only** (`platform-admin`). Tenant roles stay memberships |
| `name` | The tenant profile's display name if there is one, else the account's |
| `email` | The account email |
| `amr` | How the user signed in, always a JSON array (`["pwd"]`, or with `"mfa"`) |

They never carry permissions, presses, categories or shifts. OpenIddict adds its own technical claims (`client_id`,
`scope`, `jti`, `oi_*`); ignore them.

Client-credentials tokens have `sub` = `client_id` = `elsa-workflows`, a `name`, and no `tenant`. The service
sends `X-Tenant` on every call and the host checks it.

## Flows

### Sign in for a tenant (Code + PKCE)

```
GET /connect/authorize?client_id=blazor-client&response_type=code&redirect_uri=…&scope=openid profile email offline_access api
    &code_challenge=…&code_challenge_method=S256&state=…&tenant=acme
```

1. If there's no identity-service session (cookie `modular.identity`), the user goes to `/Account/Login` and back.
2. The tenant comes from the **`tenant` parameter**, else from a **`login_hint` of the form `tenant:acme`**.
   - If neither is given, a single active membership picks itself.
   - With several, the user goes to the **tenant picker** `/Account/SelectTenant`.
   - With none, only a user with a platform role gets a token, a *platform token* without `tenant`.
3. Issuing checks:
   - The account may sign in and isn't locked out.
   - The membership exists and is **Active**.
   - The tenant's security policy holds (see below).

   A failed check is an OAuth error at the redirect URI, e.g. `error=access_denied&error_description=The account is
   not a member of tenant 'initech'.`
4. Each sign-in creates an OpenIddict authorization bound to that tenant. The code and refresh tokens belong to it.

### Refresh

`grant_type=refresh_token` checks everything again: account, lockout, membership status and tenant policy. If any
check fails, the result is `invalid_grant` with a description.

### Switching tenant

Run the authorize request again with the other tenant and `prompt=none`, e.g. `&tenant=globex&prompt=none`. The
identity-service session is still there, so the user doesn't enter a password again, and the app gets a new code and
token pair for `globex`. Refresh tokens stay bound to their tenant.

### Sign out

`/connect/endsession`, with `post_logout_redirect_uri` set to a registered URI, ends the identity-service session and
redirects. `/Account/Logout` does the same for someone using the service directly.

## Tenant security policy

The identity service keeps its own `identity.Tenants` row per tenant: a display name for the picker and the policy.
The ids must match the WebApi tenant directory (`acme`, `globex`).

- `RequireMfa`: a token for this tenant is only issued when the account has MFA enabled **and** this sign-in used it
  (`amr` contains `mfa`). Otherwise issuing (and refreshing) is refused, with
  `error=access_denied` and `error_description=mfa_required: Tenant 'globex' requires multi-factor authentication …`.
- This is the hook and the flag only. MFA enrolment and the second-factor login step aren't built yet (TODO in
  `Pages/Account/Login.cshtml.cs`).
- A platform admin sets it with `PUT /api/admin/tenants/{tenant}` and the body `{"displayName":"…","requireMfa":true}`.

## Membership admin API

Call it with a bearer token from this service (audience `modular-webapi`). Allowed callers:
- the **`platform-admin`** role, for any tenant;
- an **active `tenant-admin` membership**, with a token issued for that same tenant.

A tenant admin sees only that tenant's members, never the user's other tenants.

| Method and path | What it does |
| --- | --- |
| `GET /api/admin/tenants/{tenant}/members` | Lists the members (status, role, invited by, dates) |
| `POST /api/admin/tenants/{tenant}/members` `{"email","role?","displayName?"}` | Invites a member (status `Invited`). An unknown email gets a new account without a password. The user accepts on `/Account/Invitations` |
| `POST …/members/{userId}/suspend` | Sets `Suspended` and **revokes that tenant's refresh tokens and codes** |
| `POST …/members/{userId}/activate` | Sets a suspended member back to `Active` (an invited user has to accept) |
| `DELETE …/members/{userId}` | Removes the membership and the tenant profile, and **revokes that tenant's refresh tokens and codes** |
| `PUT /api/admin/tenants/{tenant}` | Sets the tenant display name and `RequireMfa` (platform admin only) |

Revocation works through the tenant-bound authorizations: OpenIddict refuses every refresh token of a revoked
authorization. Access tokens already issued stay valid until they expire (at most 10 minutes). The WebApi host's
per-request membership check closes that gap.

TODO: an invitation email with a set-password link for new accounts.

## Data

- PostgreSQL database `identity` (Aspire resource `identity-db` on the `tenant-data` server, passed as `ConnectionStrings:identity`), schema `identity`, with
  EF Core migrations in `Data/Migrations`. They're applied at startup, and EF Core's migration lock keeps replicas
  safe.
- Tables:
  - the ASP.NET Core Identity tables;
  - the OpenIddict tables (applications, authorizations, scopes, tokens);
  - `TenantMemberships` (UserId, TenantId, Status, Role, InvitedBy, InvitedAt, JoinedAt);
  - `TenantProfiles` (UserId, TenantId, DisplayName, JobTitle);
  - `Tenants` (TenantId, DisplayName, RequireMfa).
- **Npgsql only.** `WebApi.Data`'s engine abstraction is built for per-tenant module databases: it references
  `WebApi.Contracts`, all four EF providers and per-engine migration assemblies. This service has one database of its
  own, so it uses `UseNpgsql` directly. Supporting another engine means one migration set per engine, like the
  modules have.

To add a migration:

```bash
dotnet ef migrations add <Name> -o Data/Migrations --project src/WebApi/Identity/WebApi.Identity.Server
```

## Dev accounts (Development only)

They're seeded from `appsettings.Development.json` (`Identity:Seed`); the passwords are in that file.

| Account | Platform role | Memberships |
| --- | --- | --- |
| `admin@modular.local` | `platform-admin` | none (gets a platform token) |
| `editor@modular.local` | none | `acme` (member), `globex` (member) |
| `acme-admin@modular.local` | none | `acme` (`tenant-admin`) |

Seeded tenants: `acme` (Acme Corporation) and `globex` (Globex Corporation), both with `RequireMfa = false`.

## Running

- **In the Hybird lab:** `dotnet run --project src/Aspire/Hybird --launch-profile http`. The `identity` resource
  listens on `http://localhost:5090` and gets `ConnectionStrings:identity` and `Identity:Issuer` from the AppHost.
- **Standalone:** set `ConnectionStrings:identity` to a Postgres server (the Development default is
  `localhost:5432`), then run with `ASPNETCORE_URLS=http://localhost:5090`.

## Signing keys

- **Development:** `AddDevelopmentSigningCertificate()` and `AddDevelopmentEncryptionCertificate()`. These are
  self-signed certificates in the current user's certificate store, created on first run and valid for a year.
  They're fine for one machine and one instance.
- **Production: TODO.** Today `Program.cs` loads PFX files from `Identity:SigningCertificate:Path/Password` and
  `Identity:EncryptionCertificate:Path/Password`, and refuses to start without them. Before going live:
  - keep the keys in a key vault (or the database, encrypted), never in the image;
  - rotate them: publish the next signing key in JWKS ahead of use (OpenIddict accepts several signing credentials;
    the first one signs), keep the old public key until the longest token has expired, then remove it;
  - each dedicated deployment gets its own keys, and resource servers only ever see the public keys through JWKS;
  - put the ASP.NET Core Data Protection keys (login cookie) in Redis before running more than one replica, as the
    design says.
- TLS: the lab runs plain HTTP, so `DisableTransportSecurityRequirement()` is on in Development only. Production
  terminates TLS and keeps the requirement.
