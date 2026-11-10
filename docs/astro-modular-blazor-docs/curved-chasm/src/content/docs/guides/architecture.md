---
title: Architecture options
description: Side by side, Blazor islands, or MudTail-only islands. What each costs and when to choose it.
sidebar:
  order: 1
---

## 1. Side by side (recommended start)

Astro owns the root of the domain, the Blazor client lives under a sub-path.

```text
https://example.com/                 Astro: home, sections, articles, docs   (static files)
https://example.com/news/derby-day/  Astro
https://example.com/app/             Blazor client (index.html + _framework + modules)
https://example.com/app/reports      Blazor route, loads Module.Reports on navigation
https://api.example.com/             ModularBlazor.Host (catalog, identity, tenants)
```

- The Blazor client needs `<base href="/app/">` in `wwwroot/index.html`. All module URLs and routes are
  base-relative, so nothing else changes.
- Both apps are on one origin, so they share `localStorage`: the MudTail theme (`mud_vanilla_theme_config`) and the sign-in
  token (`authToken`) are visible to both.
- Astro pages link into the app with plain links (`/app/login`, `/app/reports`). The browser does a full page
  load into Blazor, once.

**Choose it when** the public site and the app are different experiences that can share a header, footer and
theme.

## 2. Blazor islands inside Astro pages

A Blazor component is registered with `RegisterForJavaScript` in a small **islands host** and mounted into an
Astro page by a custom element, when it becomes visible.

```text
/news/derby-day/                     static article HTML
  └─ <blazor-island component="live-table">   boots /islands/_framework/blazor.webassembly.js on scroll
/islands/                            islands host (Blazor WebAssembly, no Router, no #app)
```

- Pays the .NET runtime download on the first island of a visit; everything else on the page stays static.
- Reuses C# components and API clients (`AddApiClients`) you already have.
- The island host is a separate Blazor project; see [Blazor islands](/guides/blazor-islands/).

**Choose it when** one widget on a public page is complex enough that rewriting it in JS is worse than the
runtime download: a live league table with filters, a form with server validation rules, an editor.

## 3. MudTail-only islands

No Blazor on public pages. MudTail already ships the interactive parts a news, sport or art site needs:

| Need | MudTail |
| --- | --- |
| Headline ticker, live scores | `data-mud="ticker"`, `data-mud="score-strip"` |
| Navigation | `data-mud="mega-nav"`, `data-mud-nav-toggle` |
| Galleries | `data-mud="lightbox"` |
| Reading progress, scroll reveal | `data-mud="reading-progress"`, `data-mud-reveal` |
| Tabs, accordion, dialog, drawer | `MudTabs`, `MudAccordion`, `MudDialog`, `MudDrawer` |
| Tables with paging and search | `MudDataTable` |
| Stat cards, progress | `createStatCard`, `MudProgressLinear`, `MudProgressCircular` |

**Choose it when** the page is content with light interaction. It is the lightest option, and the markup is the
same one the Razor layouts render, so a section can move between Astro and Blazor without a redesign.

## Comparison

| | Side by side | Blazor islands | MudTail-only |
| --- | --- | --- | --- |
| JavaScript on a public page | MudTail only | MudTail + .NET runtime on demand | MudTail only |
| Reuses C# components | in the app only | yes | no |
| Extra project | Astro site | Astro site + islands host | Astro site |
| Moving parts in production | 2 sites, 1 origin | 3 builds, 1 origin | 2 sites, 1 origin |

Most projects combine **1 and 3**, and add **2** for the odd widget that earns it.
