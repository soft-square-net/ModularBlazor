---
title: MudTail in Astro
description: Install MudTail in an Astro site, load its CSS and tokens, start the data-mud behaviours and keep the theme in sync with Blazor.
sidebar:
  order: 2
---

MudTail is plain CSS plus vanilla JavaScript, so it needs no Astro integration. The `Layouts.Default` module
already consumes it the same way (`modules/client/Layouts.Default/node-app`), and an Astro site can copy that
setup.

## Install

MudTail is a local package (`src/MudTail`, `"private": true`). Reference it with a `file:` dependency and build it
once so its `dist/` exists:

```bash
npm --prefix src/MudTail run build
npm install ../../src/MudTail      # from the Astro project; adjust the relative path
```

```json title="package.json"
{
  "dependencies": {
    "mudtail": "file:../../src/MudTail"
  }
}
```

The package exports:

| Import | Contents |
| --- | --- |
| `mudtail` | ES module; `gsap` and `lucide` resolved from its dependencies. Use this in Astro. |
| `mudtail/mudtail.css` | Component styles and the `--mud-palette-*` tokens, light and dark |
| `mudtail/tailwind.css` | Tailwind v4 preset that maps the tokens to utilities |
| `mudtail/blazor` | Self-contained interop module for `IJSRuntime`. Not needed in Astro. |

## Load the styles

Import the CSS once, in the layout every page uses:

```astro title="src/layouts/Site.astro"
---
import 'mudtail/mudtail.css';
const { title, lang = 'en', dir = 'ltr' } = Astro.props;
---
<html lang={lang} dir={dir}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
  </head>
  <body>
    <div class="mud-site">
      <slot />
    </div>
  </body>
</html>
```

### With Tailwind

Add Tailwind with its Vite plugin, then import the MudTail preset after Tailwind and point `@source` at your
`.astro` files:

```js title="astro.config.mjs"
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: { plugins: [tailwindcss()] },
});
```

```css title="src/styles/site.css"
@import "tailwindcss";
@import "mudtail/tailwind.css";
@source "../**/*.astro";
```

The preset gives you `bg-primary`, `bg-surface`, `text-ink`, `text-ink-muted`, `border-line`, `rounded-mud` and the
`dark:` variant bound to `[data-theme="dark"]`, all following the live theme.

## Start the behaviours

A `<script>` in an Astro component is bundled and runs once per page. Start MudTail there:

```astro title="src/components/MudTail.astro"
<script>
  import { initTheme, autoInit } from 'mudtail';

  initTheme();               // applies the saved theme (palette, radius, dark mode) to <html>
  autoInit(document.body);   // every data-mud="…" and data-mud-reveal element on the page
</script>
```

Include `<MudTail />` in the layout. Markup is the same one the Razor layouts render, for example the
`PublicLayout` masthead:

```astro
<button type="button" class="mud-icon-btn mud-theme-toggle" data-mud="theme-toggle" aria-label="Dark mode">…</button>
<div class="mud-reading-progress" data-mud="reading-progress" aria-hidden="true"></div>
<nav class="mud-mega-nav" id="site-nav" data-mud="mega-nav" aria-label="Main">…</nav>
```

:::caution[Attributes MudTail owns]
Behaviours set `aria-expanded`, `aria-pressed`, `data-open`, `data-state`, `data-enhanced` and
`data-mud-revealed` themselves. Do not write them in your markup, in Astro or in Razor.
:::

### With view transitions

Astro's `<ClientRouter />` swaps the page body without a full reload, so the behaviours must follow:

```astro
<script>
  import { initTheme, autoInit } from 'mudtail';

  let mud: { dispose(): void } | undefined;
  document.addEventListener('astro:page-load', () => {
    initTheme();
    mud = autoInit(document.body);
  });
  document.addEventListener('astro:before-swap', () => mud?.dispose());
</script>
```

## One theme for both apps

`updateTheme()` saves the theme to `localStorage` and raises a `mud-theme-changed` event. Astro and the Blazor
client on the **same origin** read the same saved theme, so a user who switches to dark mode in the app sees the
public site dark too. Nothing else is needed.

## Arabic and right-to-left

MudTail follows `dir` on `<html>`. Render `dir="rtl" lang="ar"` from the layout for Arabic pages (Astro's i18n
routing gives you `Astro.currentLocale`). Then call `setLocale('ar')` in the page script: the Arabic catalog ships
with MudTail, so its own texts (data table, lightbox, ticker, dialogs) switch language, and `dir` is set from the
language.

```astro
---
const isAr = Astro.currentLocale === 'ar';
---
<html lang={isAr ? 'ar' : 'en'} dir={isAr ? 'rtl' : 'ltr'}>
```
