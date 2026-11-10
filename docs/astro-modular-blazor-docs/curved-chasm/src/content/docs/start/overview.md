---
title: Overview
description: Why put Astro next to the Modular Blazor WebAssembly client, and what each side is responsible for.
sidebar:
  order: 1
---

The Modular Blazor project is a **standalone Blazor WebAssembly client** that downloads its features as modules
(`.dll` or `.nupkg`) at runtime, an **ASP.NET Core API** (module catalog, identity, tenants, host modules) and
**MudTail**, the UI kit its layouts are built on. Astro fits next to it as the tool for pages that should be
plain, fast, indexable HTML.

## Why add Astro

A standalone Blazor WebAssembly app renders nothing until the .NET runtime has downloaded and started. That is
fine for a signed-in dashboard, where the user waits once and then works for a long time. It is a poor fit for:

- **public content**: news articles, match reports, gallery pages, landing pages, which must show up instantly and
  be read by search engines and link previews;
- **documentation** like this site;
- **marketing pages** that change often and are edited by people who do not build .NET.

Astro renders those pages to HTML at build time and ships **zero JavaScript by default**. Interactive parts are
added as **islands**: small components that hydrate on their own, when you ask them to.

## Who does what

| Concern | Astro site | Modular Blazor client | API |
| --- | --- | --- | --- |
| Public pages (news, sport, culture) | renders them at build time | — | provides data at build time, if any |
| Signed-in app, admin, modules | links to it | renders it, loads modules on navigation | catalog, auth, tenants |
| Look and feel | MudTail CSS + `data-mud` behaviours | MudTail through `Layouts.Default` | — |
| Interactive widget on a public page | hosts a **Blazor island** or a small JS island | provides the component | serves its data |
| Sign-in | link to `/app/login` | `Module.Auth`, JWT in local storage | `POST /api/v1/identity/tokens` |

## The three ways to combine them

1. **Side by side.** Astro serves `/`, the Blazor client serves `/app/`. They share a domain, the MudTail theme and
   the user's sign-in token. This is the simplest option and the recommended starting point.
2. **Blazor islands inside Astro pages.** A Blazor component is registered for JavaScript and mounted into an
   Astro page, lazily. Useful for one rich widget on an otherwise static page.
3. **MudTail-only islands.** No Blazor on the public page at all: MudTail's vanilla JS components and behaviours
   provide the interactivity (tickers, mega-nav, lightbox, tabs, data table).

[Architecture options](/guides/architecture/) compares them in detail.

:::note[Status]
The repository does not contain an Astro site yet. These guides describe how to add one. Code that is not in the
repository today is labelled **proposed**.
:::
