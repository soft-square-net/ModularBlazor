# Layouts.Default assets

This folder builds the Default layout module's `wwwroot`. The `.csproj` embeds that `wwwroot` into the module DLL. The module provides two layouts:

| Layout key | Component | For |
| --- | --- | --- |
| `default` | `DefaultLayout.razor` | the admin-style shell: sidebar plus main area (`_shell.css`) |
| `public` | `PublicLayout.razor` | the public site (news, sport, culture): masthead, mega-nav and footer, built entirely from MudTail's `mud-site` classes |

A module's pages use the public layout when its settings say `Layout = "public"`.

| Source | Output | What it is |
| --- | --- | --- |
| `src/framework/main.css` | `../wwwroot/css/main.min.css` | Tailwind utilities (no preflight), the MudTail preset, all MudTail CSS (components, editorial, sport, gallery, site shell) and `_shell.css` |
| `src/js/module.ts` | `../wwwroot/js/module.js` | On activation: applies the saved MudTail theme and starts `MudTail.autoInit(document.body)`. Returns the MudTail API, which other modules read with `moduleHost.get('Layouts.Default')` |

## Behaviours without interop

Because `module.js` runs `autoInit` on `<body>`, any module's Razor page gets the interactive components just by rendering the markup: a ticker (`data-mud="ticker"`), live scores (`data-mud="score-strip"`), a gallery lightbox (`data-mud="lightbox"`) and scroll reveal (`data-mud-reveal`). The markup and rules are in `src/MudTail/README.md`. `PublicLayout` uses `mega-nav`, `reading-progress` and `theme-toggle` the same way.

## Public layout navigation

The mega-nav is built from the module menu (`IModuleNavigation.Items`) by URL, in `PublicNavigation.cs`. An item whose href is `sports/football` goes into the panel of the item whose href is `sports`. Items without such a parent stay at the top level.

## One token set

Every colour, radius and z-index comes from MudTail's `--mud-palette-*` tokens (`src/MudTail`, a `file:` dependency). This folder defines no palette of its own. While the layout is loaded, `_shell.css` also points the host's own `app.css` variables (`--bg`, `--accent`, …) at the MudTail tokens. Host pages therefore follow the same theme, including dark mode.

MudTail's CSS and `_shell.css` are imported **unlayered** on purpose. The host's `app.css` is unlayered, and unlayered CSS always beats layered CSS. If they were layered, plain host rules such as `a { color }` would override MudTail's components.

## RTL

Both layouts use logical properties only. With `dir="rtl"` on `<html>`, everything mirrors. MudTail's `setDirection()` switches it at runtime.

## Build

```
npm install
npm run build      # builds MudTail first, then this module's wwwroot
npm run dev        # rebuild on change (MudTail must already be built)
```

`js/module.js` is loaded from a blob URL by `moduleHost`, so it must stay a single file with no imports. `preserveEntrySignatures` in `vite.config.ts` keeps its exports; without it the module tree-shakes down to nothing.

The stylesheet is declared in `ModuleInfo.cs` (`Styles = css/main.min.css`) and in the catalog seed. Existing installations need the same entry added under the module's settings in Module Management.
