---
title: API, sign-in and tenants
description: Calling ModularBlazor.Host from Astro at build time and in the browser, sharing the Blazor sign-in, CORS and the X-Tenant header.
sidebar:
  order: 4
---

## Build time: public data only

Astro pages can `fetch` in their frontmatter. That code runs **when the site is built** (or per request with an
SSR adapter), never in the visitor's browser. Use it only for public data:

```astro title="src/pages/modules.astro"
---
const api = import.meta.env.API_BASE_URL ?? 'http://localhost:5100';
const modules = await fetch(`${api}/api/modules/core`).then(r => r.json());
---
<ul>{modules.map((m: { id: string; name: string }) => <li>{m.name}</li>)}</ul>
```

`GET /api/modules/core` is public. Everything under `/api/v1/identity`, `/api/v1/tenants` or `/api/me/modules`
needs a token, and a token must never be baked into static HTML.

## In the browser: CORS

The API answers cross-origin requests only from the origins in `Cors:Origins` (exact match, no wildcards). Add
the Astro origins, for development and production:

```json title="src/api/ModularBlazor.Host/appsettings.Development.json"
{
  "Cors": {
    "Origins": [ "http://localhost:5000", "https://localhost:5001", "http://localhost:4321" ]
  }
}
```

Under Aspire, add another `Cors__Origins__<n>` environment variable to the `host-api` resource in
`src/Aspire/Host/Program.cs`.

## Sharing the sign-in

Users sign in inside the Blazor client (`Module.Auth`, `/app/login`). `JwtAuthenticationService` stores the access
token under `authToken` and the refresh token under `refreshToken` in `localStorage`. When Astro and the client are
served from the **same origin**, an Astro script can read the token to personalise a page after it loads:

```ts
const token = localStorage.getItem('authToken')?.replace(/^"|"$/g, '');
if (token) {
  const me = await fetch(`${apiBase}/api/v1/identity/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (me.ok) showUser(await me.json());
  // 401: the token expired. Link to /app/login; the client refreshes or asks to sign in again.
}
```

- Only read the token. Refreshing and signing out belong to the Blazor client, so there is one owner of the
  session.
- Client-side checks are UX. The API enforces permissions (`Permissions.Identity.*`, `Permissions.Multitenancy.*`)
  on every request.
- A token in `localStorage` is readable by any script on the origin. Keep third-party scripts off pages that read
  it, and set a Content Security Policy.

## Tenants

A JWT is valid only for the tenant it was issued for. Requests without `X-Tenant` go to the root tenant. If the
public site is per tenant (one hostname per tenant, for example), send the same header the client sends:

```ts
fetch(url, { headers: { Authorization: `Bearer ${token}`, 'X-Tenant': tenantId } });
```

## Linking into the app

Plain links work, because the client's routes are base-relative to `/app/`:

| Link from Astro | Opens |
| --- | --- |
| `/app/` | the client home (layouts and login are startup modules) |
| `/app/login` | `Module.Auth` |
| `/app/todo` | `Module.ToDo`, downloaded on navigation |
| `/app/admin` | `Module.Admin` (role `admin`) |
