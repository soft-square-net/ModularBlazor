---
title: Concepts for Blazor developers
description: Astro Islands, client directives and server islands, explained in Blazor terms.
sidebar:
  order: 2
---

## Islands architecture

An Astro page is HTML first. Each interactive component on it is an **island**: it is rendered to HTML on the
server or at build time, and its JavaScript is loaded and run (hydrated) separately, only for that component. The
rest of the page stays static. One slow widget never blocks the article around it.

Blazor WebAssembly works the other way round in this project: the whole UI is one app, rendered in the browser
after the .NET runtime has started. Islands let you use Blazor for **a part** of a page instead of the whole page.

## Client directives

Astro decides when an island starts with a `client:*` directive. Astro has integrations for React, Vue, Svelte,
Solid and Preact, but not for Blazor, so a Blazor island cannot use these directives directly. The
[`<BlazorIsland>`](/guides/blazor-islands/) component in these guides copies their behaviour with a `load`
property:

| Astro directive | Starts when | `<BlazorIsland load=…>` |
| --- | --- | --- |
| `client:load` | the page loads | `load="eager"` |
| `client:idle` | the browser is idle (`requestIdleCallback`) | `load="idle"` |
| `client:visible` | the island scrolls into view (`IntersectionObserver`) | `load="visible"` (default) |
| `client:media="(…)"` | a media query matches | `load="media"` + `media="(…)"` |
| `client:only` | page load, with no server-rendered HTML | no slot content |

## Server islands

`server:defer` renders a component on the server **per request** and streams it in after the static page. A
standalone Blazor WebAssembly client has no server rendering, so there is no Blazor counterpart. If you need
per-user content on a public page, either use a server island in Astro (with an SSR adapter) that calls the API,
or fetch from the API in the browser.

## Rendering modes side by side

| | Astro (static) | Astro island | Modular Blazor client |
| --- | --- | --- | --- |
| HTML produced | at build time | at build time (fallback), then in the browser | in the browser |
| JavaScript shipped | none | that island's code | the .NET runtime + startup modules |
| First paint | immediate | immediate (fallback) | after the runtime starts |
| Good for | content | widgets on content | applications |

## Costs to keep in mind

- **One runtime per page.** All Blazor islands on a page share one .NET runtime. The first island pays for the
  download (several MB, cached afterwards); the others are cheap.
- **No navigation.** An island is not the Router. Do not use `NavigationManager` to move between pages from an
  island; render ordinary links.
- **Modules.** The module loader (`ModuleManager`) lives in the Blazor client host. An island host only knows the
  components it was compiled with. See [Blazor islands](/guides/blazor-islands/#runtime-modules).
