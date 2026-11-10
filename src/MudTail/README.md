# MudTail

MudTail is a Material-style UI framework built with Tailwind CSS v4, vanilla JavaScript and GSAP. It is the design system behind the Blazor WebAssembly client layouts and the public sites built on them (news, sports, art).

## Layout

```
src/                  the library (everything published)
  index.js            public JS API; anything not exported here is internal
  blazor.js           Blazor interop module (IJSObjectReference-friendly)
  core/               theme, design tokens, form validators, GSAP animations, icons
  components/         MudButton, MudDialog, MudDrawer, MudTabs, MudAccordion, MudTooltip, MudAutocomplete
  styles/             SCSS sources (mudtail.scss entry) and the Tailwind preset (tailwind.css)
demo/                 the showcase app; it uses the library only through `mudtail`
dist/                 build output (git-ignored)
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Showcase app at http://localhost:3000 |
| `npm run build` | Library outputs into `dist/` (see below) |
| `npm run build:demo` | Showcase app into `dist-demo/` |
| `npm test` | Unit tests (`node --test` through tsx) |
| `npm run lint` | Type-check |

## Build outputs

| File | For |
| --- | --- |
| `dist/mudtail.js` | ES module for apps that bundle (gsap and lucide stay external, resolved from its dependencies) |
| `dist/mudtail.blazor.js` | Self-contained ES module (gsap bundled) for Blazor's `JS.InvokeAsync("import", ...)` |
| `dist/mudtail.css` | Component styles and `--mud-palette-*` tokens, light and dark |
| `dist/tailwind.css` | Tailwind v4 preset mapping the tokens to utilities |

## Theme tokens

All colours are CSS variables on `:root` (`--mud-palette-primary`, `--mud-palette-surface`, `--mud-palette-text-primary`, …). Dark mode is `data-theme="dark"` on `<html>`. Change the theme at runtime with `updateTheme({ primary, secondary, borderRadius, isDark })`, which persists to `localStorage` and raises a `mud-theme-changed` window event.

## Using it with Tailwind

```css
@import "tailwindcss";
@import "mudtail/tailwind.css";
@source "../**/*.razor";
```

The preset adds `bg-primary`, `text-ink`, `text-ink-muted`, `border-line`, `bg-surface`, `rounded-mud` and so on, all following the live theme. It also points the `dark:` variant at `[data-theme="dark"]` rather than the OS setting.

## Using it from Blazor

Copy `dist/mudtail.blazor.js` and `dist/mudtail.css` into the module's `wwwroot` (for example `wwwroot/js` and `wwwroot/css`), and reference the stylesheet from the layout.

```csharp
await using var mud = await JS.InvokeAsync<IJSObjectReference>(
    "import", "./_content/<Assembly>/js/mudtail.blazor.js");

await mud.InvokeVoidAsync("init", new { primary = "#594ae2", isDark = false });
await mud.InvokeVoidAsync("toast", "Saved", "success");

// Render a component into an element Blazor renders empty: <div @ref="host"></div>
_tabs = await mud.InvokeAsync<IJSObjectReference>("create", "tabs", host,
    new { tabs = new[] { new { id = "news", label = "News", content = "" } } },
    DotNetObjectReference.Create(this));

await _tabs.InvokeVoidAsync("setActive", "news");
await _tabs.InvokeVoidAsync("dispose");   // in DisposeAsync
```

Component events come back to .NET as one callback:

```csharp
[JSInvokable] public Task OnMudEvent(string name, JsonElement payload) { ... }
```

| `create` name | Events | Handle methods |
| --- | --- | --- |
| `button` | `click` | `dispose` |
| `autocomplete` | `select` (value) | `setValue`, `dispose` |
| `tabs` | `change` (tab id) | `setActive`, `setPosition`, `dispose` |
| `accordion` | none | `dispose` |
| `drawer` | `open`, `close` | `open`, `close`, `toggle`, `setContent`, `setTitle`, `setAnchor`, `dispose` |
| `dialog` | `action` (action id), `close` | `open`, `close`, `dispose` |

For markup Blazor renders itself, use the behaviour helpers instead: `ripple(element)` and `tooltip(element, text, position)`. Both return a handle with `dispose()`. Use `observeTheme(dotNetRef)` to receive `theme` events. Other helpers are `setTheme`, `toggleDark` and `getTheme`.

Component options are inserted as HTML (titles, labels, tab content), so never pass unescaped user content to them.
