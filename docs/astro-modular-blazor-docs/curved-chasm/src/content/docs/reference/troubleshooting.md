---
title: Troubleshooting
description: Common problems when Astro pages and the Blazor client share a site, and how to fix them.
sidebar:
  order: 2
---

## A missing page shows the Blazor "Loading core modules…" screen

The SPA fallback is site-wide. Scope it to `/app/` (see [Hosting](/guides/hosting/#production-one-nginx-site)).

## The client loads, but modules return 404 or index.html

- `<base href>` in the client's `index.html` must be `/app/` when it is served from `/app/`.
- The `location ^~ /app/modules/` block must come with `^~`, so the `.dll` rule cannot take those files over.

## "Could not find any element matching selector '#app'"

The **client** was started on an Astro page. Islands need the separate islands host, which registers components
with `RegisterForJavaScript` and does not add `App` to `#app`.

## An island stays on its fallback

- Check the console for 404s under `/islands/_framework/`: the islands host is not published there, or
  `loadBootResource` points elsewhere.
- The identifier in `<BlazorIsland component="…">` must match `RegisterForJavaScript(identifier: "…")` exactly.
- `params` must match the component's `[Parameter]` names and types.

## CORS errors from the browser

Add the page's exact origin (scheme, host and port) to `Cors:Origins` in the API settings.

## Dark mode differs between the site and the app

They are on different origins (different ports in development), so they do not share `localStorage`. Serve both
from one origin, or use the dev proxy from [Hosting](/guides/hosting/#local-development).

## Behaviours stop working after navigation

With Astro's `<ClientRouter />`, re-run `autoInit` on `astro:page-load` and dispose it on `astro:before-swap`
([MudTail in Astro](/guides/mudtail-in-astro/#with-view-transitions)).

## Arabic text looks broken or spaced out

Set `lang="ar"` together with `dir="rtl"` (or call `setLocale('ar')`). MudTail then picks fonts with Arabic glyphs
and resets letter-spacing, which would break the joins between letters.
