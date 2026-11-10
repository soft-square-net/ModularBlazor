---
title: Hosting and deployment
description: One nginx site for Astro at / and the Blazor client at /app/, a multi-stage Docker build, and local development.
sidebar:
  order: 5
---

## Local development

Run each part with its own tool; they talk over HTTP.

| Part | Command | URL |
| --- | --- | --- |
| API | `dotnet run --project src/api/ModularBlazor.Host` | http://localhost:5100 |
| Blazor client | `dotnet run --project src/apps/blazor/ModularBlazor.Client` | http://localhost:5000 |
| Astro site | `npm run dev` in the Astro project | http://localhost:4321 |
| MudTail demo | `npx vite --port 3001` in `src/MudTail` | http://localhost:3001 |

In development the Astro site and the client are on **different origins** (ports), so they do not share
`localStorage`. To test the shared theme and sign-in, proxy the client through Astro's dev server:

```js title="astro.config.mjs"
export default defineConfig({
  vite: {
    server: {
      proxy: { '/app': { target: 'http://localhost:5000', changeOrigin: true } },
    },
  },
});
```

The client must then be built with `<base href="/app/">`.

## Production: one nginx site

The client image already serves the Blazor app with nginx (`src/apps/blazor/ModularBlazor.Client/nginx`). Put the
Astro output at the root and the client under `/app/`:

```text
/usr/share/nginx/html/
  index.html, news/, sport/, _astro/, 404.html     Astro (dist/)
  app/
    index.html, _framework/, css/, modules/         Blazor client (publish output, base href /app/)
  islands/                                          optional islands host
```

```nginx title="snippets/app.conf"
root /usr/share/nginx/html;
include /etc/nginx/mime.types;
types { application/wasm wasm; application/octet-stream dll; }

# Modules: raw bytes, never the SPA fallback, never stale.
location ^~ /app/modules/ {
    gzip off;
    default_type application/octet-stream;
    add_header Cache-Control "no-cache";
    try_files $uri =404;
}

# Blazor client: unknown paths under /app/ go to its index.html and the Router handles them.
location /app/ {
    try_files $uri $uri/ /app/index.html =404;
}

# Astro: real files only, with Astro's own 404 page.
location / {
    try_files $uri $uri/ $uri.html =404;
}
error_page 404 /404.html;

# Hashed Astro assets can be cached for a long time.
location /_astro/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

:::caution
Keep the `/app/` fallback scoped to `/app/`. A site-wide `try_files … /index.html` would answer every missing
Astro page, and every missing module, with the Blazor shell instead of a 404.
:::

## Docker

Extend the client's Dockerfile with an Astro stage and copy both outputs into the nginx image:

```dockerfile
FROM node:22 AS astro
WORKDIR /site
COPY docs/astro-site/package*.json ./
RUN npm ci
COPY docs/astro-site/ ./
RUN npm run build

# … the existing .NET publish stage of the client, publishing to /app/publish …

FROM nginx:alpine
COPY --from=astro /site/dist/ /usr/share/nginx/html/
COPY --from=publish /app/publish/wwwroot/ /usr/share/nginx/html/app/
```

Replace `docs/astro-site` with the folder of your Astro project. If the site imports MudTail, copy
`src/MudTail` into the stage and build it first (`npm --prefix src/MudTail ci && npm --prefix src/MudTail run build`),
because its `file:` dependency points at that folder.

Under Aspire the client container already bind-mounts `wwwroot/modules`. With the client under `/app/`, mount it
at `/usr/share/nginx/html/app/modules` instead.

## This documentation site

This site is itself an Astro (Starlight) project in `docs/astro-modular-blazor-docs/curved-chasm`:

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # static output in dist/
```
