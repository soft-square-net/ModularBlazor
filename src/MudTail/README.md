# MudTail

MudTail is a Material-style UI framework built with Tailwind CSS v4, vanilla JavaScript and GSAP. It is the design system behind the Blazor WebAssembly client layouts and the public sites built on them (news, sports, art).

## Layout

```
src/                  the library (everything published)
  index.js            public JS API; anything not exported here is internal
  blazor.js           Blazor interop module (IJSObjectReference-friendly)
  core/               theme, design tokens, form validators, GSAP animations, icons
  components/         MudButton, MudDialog, MudDrawer, MudTabs, MudAccordion, MudTooltip, MudAutocomplete
  behaviors/          autoInit + the data-mud behaviours (ticker, score strip, lightbox, mega-nav, reading progress, reveal, theme toggle)
  dock/               MudDock: IDE docking layout (model.js = the layout tree, MudDock.js = the view)
  datatable/          MudDataTable + the shared query engine (client evaluation, PaginationFilter query strings)
  locales/            message packs for MudTail's own UI (ar.js: Arabic)
  styles/             SCSS sources (mudtail.scss entry) and the Tailwind preset (tailwind.css)
demo/                 the showcase; it uses the library only through `mudtail`
  i18n/               demo languages: the localizer and the Arabic catalog (ar/*.js)
  index.html          framework dashboard: a page per component (#/components/<id>), Forms sub-group, theme studio, docs
  site.html           public-site showcase: a news / sport / culture front page using every editorial component
dist/                 build output (git-ignored)
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Showcase at http://localhost:3000 (dashboard) and http://localhost:3000/site.html (public site) |
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

All colours are CSS variables on `:root` (`--mud-palette-primary`, `--mud-palette-surface`, `--mud-palette-text-primary`, …). Dark mode is `data-theme="dark"` on `<html>`. Change the theme at runtime with `updateTheme({ primary, secondary, borderRadius, isDark, numerals })` (`numerals`: the digits, see Languages), which persists to `localStorage` and raises a `mud-theme-changed` window event.

## Using it with Tailwind

```css
@import "tailwindcss";
@import "mudtail/tailwind.css";
@source "../**/*.razor";
```

The preset adds `bg-primary`, `text-ink`, `text-ink-muted`, `border-line`, `bg-surface`, `rounded-mud` and so on, all following the live theme. It also points the `dark:` variant at `[data-theme="dark"]` rather than the OS setting.

If the page also loads unlayered CSS you don't control (the Blazor host's `app.css`, for example), import Tailwind without its preflight reset and put MudTail in a layer. `modules/client/Layouts.Default/node-app/src/framework/main.css` shows the setup.

## Languages (i18n)

MudTail translates its own UI: the data table, the dock, the lightbox, the ticker, password and theme toggles, autocomplete and dialogs. It also gives your app the same tools. English is built in, and Arabic ships in `src/locales/ar.js`, registered automatically.

```js
import { setLocale, t, addMessages, formatNumber, formatDate, onLocaleChange } from 'mudtail';

setLocale('ar', { persist: true });   // <html lang="ar" dir="rtl">; MudTail's texts switch; raises mud-locale-changed
t('datatable.filters');               // "عوامل التصفية"

addMessages('ar', {
  'cart.title': 'السلة',
  'cart.items': { zero: 'السلة فارغة', one: 'عنصر واحد', two: 'عنصران', few: '{count} عناصر', many: '{count} عنصرًا', other: '{count} عنصر' },
});
t('cart.items', { count: 3 }, '{count} items');   // "3 عناصر"; the last argument is the English default
formatNumber(1234.5);                              // in the active locale
formatDate('2026-11-10', { dateStyle: 'long' });
```

- **Lookup:** the exact locale (`ar-EG`), then its language (`ar`), then the fallback (`en`), then the default text, then the key.
- **Messages:** a string with `{placeholders}`, an object of plural forms chosen with `Intl.PluralRules` (Arabic uses all six: `zero`, `one`, `two`, `few`, `many`, `other`), or a function.
- **Direction:** `setLocale` sets `dir` from the language (Arabic, Hebrew, Persian, Urdu… are right-to-left), and the RTL support below follows it. For Arabic-script languages MudTail also switches to fonts with Arabic glyphs, and resets letter-spacing, which would break the joins between cursive letters.
- **Markup** (Razor too): `translateElement(root)` translates elements marked `data-i18n="key"` (text), `data-i18n-html="key"` (trusted markup), or `data-i18n-attr="placeholder:key;aria-label:key2"`, with `data-i18n-params='{"count":3}'`. The element's own English content is the default, so it still works without a catalog and switches back cleanly.
- **Digits (optional):** numbers, dates and `{count}` in messages are written with the browser's default digits for the language. For Arabic that means Western digits (1, 2, 3). To choose Arabic-Indic digits (١، ٢، ٣), pick them at start-up, at runtime, or in the theme:
  `setLocale('ar', { numerals: 'arab' })`, `setNumerals('arab')`, or `updateTheme({ numerals: 'arab' })` (saved with the theme).
  Values are `'auto'` (default), `'latn'` (1 2 3 always), `'arab'` (١ ٢ ٣ with the separators ٬ ٫) and `'arabext'` (۱ ۲ ۳, for Persian and Urdu).
  The digits apply to `formatNumber`, `formatDate`, `formatRelativeTime`, numbers passed to `t()` and MudTail's components (the data table, for example). The plural form is still chosen from the number.
  A change raises `mud-locale-changed` with `{ locale, dir, numerals }`, so re-render anything you formatted yourself. Related helpers: `getNumerals()`, `intlLocale()` (the locale tag to pass to your own `Intl` formatters, such as `ar-u-nu-arab`) and `localizeDigits(text)` (rewrites the digits in a ready-made string).
- **Other helpers:** `getLocale`, `preferredLocale` (the saved choice, else the browser language), `availableLocales`, `isRtlLocale`, `hasMessage` and `formatRelativeTime`.

**From Blazor:** pass the culture to `init`, for example `mud.InvokeVoidAsync("init", new { locale = CultureInfo.CurrentUICulture.Name })`, and add `numerals = "arab"` to that object for Arabic-Indic digits. MudTail then renders its own texts in that language and sets `lang` and `dir`. Use `observeLocale(dotNetRef)` to hear about changes. Your own Razor text stays with .NET localization (`IStringLocalizer`); `t` and `translateElement` are there for text built in JavaScript.

**Adding a language:** copy `src/locales/ar.js`, translate the values, and register it with `addMessages('<code>', pack)`.

**The demo** has a language switch in the app bar and on the public site. It covers every page in English and Arabic: the dashboard, docs, IDE, all 33 component pages and the public site. Its pages are English HTML templates, so `demo/i18n` uses a catalog keyed by the English source text. Rendered views are translated as they appear, whole sentences at a time when they contain inline markup, so Arabic word order stays natural. Code samples and editors are never touched. Values built in code (column titles, sample data, dates) are localized where they are built. The Theme Studio drawer has a **Digits** choice (Auto, Western, Arabic-Indic). The demo applies it to its static numbers too, but leaves codes such as "P99" alone. Run `__i18nMissing()` in the browser console to list any text on the current page that is still untranslated.

## Right-to-left (RTL)

The direction comes from `dir` on `<html>`. Set it with `setDirection('rtl', 'ar')`, which also raises a `mud-direction-changed` event. It is not saved with the theme, because it should follow the UI culture.

- The styles use logical properties (`inset-inline-start`, `border-inline-end`, `padding-inline`, …). Any offset that must flip is multiplied by `--mud-dir`, which is `1` in LTR and `-1` under `[dir="rtl"]`.
- `start` and `end` follow the writing direction. `left` and `right` always mean the physical side. This applies to drawer anchors, tab positions and tooltip positions (`toPhysicalSide()` resolves them). The rounded-corner classes have logical versions too: `mud-rounded-s` and `mud-rounded-e`.
- Toasts appear at the inline end (bottom-right in LTR, bottom-left in RTL).
- Use `[dir="rtl"]` in selectors, not `:dir(rtl)`. Lightning CSS (Vite's minifier) rewrites `:dir()` as a list of RTL languages, so it fails when `dir="rtl"` is set without a matching `lang`.

## Grid

The grid is 12 columns and built on logical properties, so it mirrors itself in RTL: `mud-container` (capped at `--mud-container-max`, 1280px), `mud-row`, `mud-col-{1..12}` and `mud-col-{sm|md|lg|xl}-{1..12}`.

## Forms

Form controls are markup and CSS, so Razor can render them and bind them with `@bind`. The demo's **Components ▸ Forms** pages show every one, with the markup to copy.

| Control | Markup |
| --- | --- |
| Field | `.mud-input-control` > `.mud-input-label` + `.mud-input-wrapper` > `.mud-input-slot`, plus an optional `.mud-input-helper-text`. States: `mud-input-error`, `mud-input-success`, `mud-input-wrapper--dense`; a disabled input greys the box. Adornments: `.mud-input-adornment-start / -end`. |
| Text area, number, date / time / colour, file | The same field, with `textarea` or `input[type=…]` as the `.mud-input-slot`. File inputs get a themed button. |
| Select | `.mud-input-wrapper--select` > `select.mud-input-slot` (also `multiple`). |
| Checkbox, radio, switch | `label.mud-checkbox`, `label.mud-radio`, `label.mud-switch`; group them in `fieldset.mud-choice-group` (`--column` for a column). |
| Slider | `.mud-slider-field` > `input.mud-slider` + `output`. |
| Password | Add `data-mud="password-toggle"` to the wrapper and a `.mud-input-toggle[data-mud-password-toggle]` button. |
| Input group | `.mud-input-group` joins `.mud-input-addon`, `.mud-input-wrapper` and `.mud-button-root` children into one control. |

Validation helpers: `validateEmail`, `evaluatePasswordStrength`, `validateNumericRange`, `formatCurrency`. They return `{ isValid, error }`, apart from the strength (`{ score, label, color, feedback }`) and the formatted string.

## Editorial components (news, sport, art)

These are **markup and CSS**, so any Razor component can render them without JS interop. The interactive parts are behaviours named in a `data-mud` attribute (next section). Each SCSS partial starts with the exact markup it expects, and `demo/site/main.js` renders all of them.

| Component | Classes | Partial |
| --- | --- | --- |
| Article card | `mud-article` with `--lead`, `--row` (media beside the text) and `--overlay` (text on the image); parts `__media`, `__body`, `__title`, `__excerpt`. The title link covers the whole card. | `_editorial.scss` |
| Kicker, meta line, badges | `mud-kicker`, `mud-meta`, `mud-badge`, `mud-badge--live` | `_editorial.scss` |
| Hero and card grids | `mud-hero-grid` (first child is the lead, 2×2), `mud-card-grid` (auto-fill, `--mud-card-min`), `mud-split` (main + aside, `--mud-split-aside`) | `_editorial.scss` |
| Sections and lists | `mud-section` with `__header` / `__title` / `__more`; `mud-article-list` (numbered "most read"); `mud-prose` (article body) | `_editorial.scss`, `_site.scss` |
| Breaking-news ticker | `mud-ticker` with `__label`, `__viewport`, `__track`, optional `__toggle`, and `data-mud="ticker"` | `_sports.scss` |
| Live score strip | `mud-score-strip mud-scroller` with `mud-score-chip[data-status=live\|ht\|ft\|upcoming]`, `mud-score`, `mud-crest`, and `data-mud="score-strip"` | `_sports.scss` |
| Match card | `mud-match[data-status]` with `__header`, `__teams`, `__team`, `__score` or `__kickoff`, `__events`, `__footer` | `_sports.scss` |
| League table | `mud-table-scroll` > `table.mud-league-table`; rows `data-zone="champions\|europe\|playoff\|relegation"`, `aria-current` for the followed team; `mud-form__result[data-result=W\|D\|L]`; `mud-zone-legend` | `_sports.scss` |
| Masonry gallery and lightbox | `mud-masonry` > `figure.mud-masonry__item` > `a[data-mud-lightbox-item]`, with `data-mud="lightbox"` on the gallery | `_gallery.scss` |
| Site shell | `mud-site`, `mud-skip-link`, `mud-reading-progress`, `mud-site-header`, `mud-topbar`, `mud-masthead`, `mud-logo`, `mud-icon-btn`, `mud-mega-nav` (`__list`, `__item`, `__link`, `__expander`, `__panel`, `__columns`, `__heading`, `__feature`), `mud-site-footer` | `_site.scss` |

Per-section look: set `--mud-accent` (kicker, rules, badges) and `--mud-font-headline` (for example a serif for arts) on any element, for example `<section style="--mud-accent:#16a34a">`.

## Behaviours (`data-mud`)

Call `autoInit(document.body)` once. In Blazor, the Default layout's `module.js` already does this. It attaches a behaviour to every element whose `data-mud` names one (several can be listed, space-separated). It keeps watching the DOM, so elements Blazor renders later are attached and elements Blazor removes are disposed. It returns `{ refresh, dispose }`.

| `data-mud` | What it does |
| --- | --- |
| `ticker` | GSAP marquee, at `data-speed` px/s (default 70). Pauses on hover or focus. `__toggle` pauses it permanently. Runs the other way in RTL. Rebuilds when the headlines or the size change. |
| `score-strip` | When a `.mud-score` inside it changes text (Blazor re-rendered a new score), it flashes and pops the score. Works on match cards too. |
| `lightbox` | Clicking a `[data-mud-lightbox-item]` link opens a full-screen viewer. Esc closes it; arrow keys browse (mirrored in RTL); swipe works; focus is trapped inside and restored on close. Captions are inserted as plain text. `openLightbox(items, index)` opens it directly. |
| `mega-nav` | Panels open on hover (desktop mouse) or with the expander button. Esc, clicking outside or following a link closes them. Below 1024px the nav sits behind any `[data-mud-nav-toggle][aria-controls=<nav id>]` button and the panels act as an accordion. |
| `reading-progress` | Scales the bar with scroll progress through `data-target` (re-queried, so it follows route changes), or through the whole page. |
| `theme-toggle` | Toggles dark mode and keeps `aria-pressed` in sync. |
| `password-toggle` | On a `.mud-input-wrapper`: its `[data-mud-password-toggle]` button shows or hides the password. The field is hidden again when the behaviour is disposed. |

Scroll reveal uses its own attributes: `data-mud-reveal="fade-up|fade|zoom|slide-start|slide-end"`, plus optionally `data-mud-reveal-stagger="0.08"` (animate the children in turn) and `data-mud-reveal-delay`. Content is hidden only once the script is running, and never with `prefers-reduced-motion`. The ticker also stops (and becomes a scrollable strip) under reduced motion.

**Rules for Blazor markup:** behaviours never add or remove children of elements Blazor renders. They only set styles and the attributes they own (`aria-expanded`, `aria-pressed`, `data-open`, `data-state`, `data-enhanced`, `data-mud-revealed`), and they put their own overlays on `<body>`. Don't render those attributes from Razor. Add your own behaviour with `registerBehavior(name, element => ({ dispose() {} }))`.

## Data table (MudDataTable)

`MudDataTable` does global search, column filters, multi-column sorting (Shift+click a header), paging and selection, over rows in the browser or from an API. It is accessible (a real `<table>` with `aria-sort`, a live result count and a keyboard-operable pager), mirrors in RTL, follows the theme, and turns rows into labelled cards on phones. The demo page **Components ▸ Data table** shows both modes.

```js
import { MudDataTable } from 'mudtail';

const table = new MudDataTable({
  caption: 'Articles',
  columns: [
    { key: 'title', field: 'Title', title: 'Title' },                                  // text: searched by the keyword
    { key: 'section', field: 'Section', title: 'Section', type: 'enum', options: ['News', 'Sport'] },
    { key: 'views', field: 'Views', title: 'Views', type: 'number', format: 'integer' },
    { key: 'publishedOnUtc', field: 'PublishedOnUtc', title: 'Published', type: 'date' },
  ],
  data: rows,                                   // client side, or:
  // server: { url: '/api/v1/articles' },       // server side: GET ?Keyword=…&Filters=Views|gte|1000 → PagedResponse<T>
});
host.appendChild(table.getElement());
```

**One query, both modes.** The query is `{ keyword, searchFields, filters: [{ field, op, value }], orderBy: ['Views desc'], pageNumber, pageSize }`. In client mode `applyQuery` evaluates it in the browser. In server mode `toPaginationFilterParams` sends it as the query string that `[AsParameters] PaginationFilter` binds. The rules are the same on both sides, and both test suites (`src/datatable/query.test.js` and the .NET check) use the same rows and expectations:
- **Keyword**: case-insensitive "contains" over the text columns.
- **Filters**: all of them must match, and text comparisons ignore case.
- **Unknown or invalid input** is ignored rather than rejected.

**Ardalis specifications (.NET).** `PaginationFilter` (Core) now has `Filters`: `Field|op|value` strings. `Query.SearchBy(filter)` applies the keyword and the column filters, so every specification built on `EntitiesByPaginationFilterSpec` filters by column without changes.
- **Operators**: `eq`, `neq`, `contains`, `startswith`, `endswith`, `gt`, `gte`, `lt`, `lte`, `in` (comma list), `isnull` and `notnull`.
- **Safety**: only real, readable, mapped scalar properties are used. Values are converted to the property's type (enums by name, dates as UTC) and sent as SQL parameters.
- **Sensitive columns**: `filter.RestrictTo(fields)` also drops filters on any column outside the list.

```csharp
group.MapGet("/", async ([AsParameters] PaginationFilter filter, ISender sender, CancellationToken ct) => …)
     .Produces<PagedResponse<ArticleDto>>();

var filter = q.Filter.RestrictTo("Title", "Section", "Views", "PublishedOnUtc");
return articles.PaginatedListAsync(new ArticlesByPaginationFilterSpec(filter), filter, ct);
```

**From Blazor**, use `create("datatable", host, options, dotNetRef)` with `serverSide: true`. Each page raises `OnMudEvent("query", { requestId, query, filter })`, where `filter` is a ready PaginationFilter. Call your API with the app's authorised client, then answer with `setPage(requestId, items, totalCount)` or `failPage(requestId, message)`. Answers to queries that were replaced in the meantime are ignored. The other events are `rowclick` and `selection`.

## IDE docking layout (MudDock)

`MudDock` is a Visual Studio–style workspace: tab groups in recursive row and column splits, drag-and-drop docking, splitters, maximize, auto-hide edge strips with flyouts, and a saved layout. It ports VsDock from the "Blazor WASM Web IDE Dock Panel Layout" project. The rules are the same (`DockModel` is a straight port of its `DockService`, covered by `src/dock/model.test.js`), and the styling comes from MudTail tokens, so it follows light and dark mode and the live palette, and mirrors in RTL.

```js
import { MudDock } from 'mudtail';

const dock = new MudDock({
  storageKey: 'my-app.layout',                 // optional: save / restore the layout in localStorage
  definitions: [
    { key: 'explorer', title: 'Explorer', icon: '<svg…>', render: (panel, ctx) => element },
    { key: 'editor', title: 'Untitled', allowMultiple: true, document: true,
      render: (panel, ctx) => ({ element, dispose() {} }) },
  ],
  defaultLayout: (m) => ({
    root: m.newSplit('row', [m.newGroup([m.createPanel('explorer')]), m.newGroup([m.createPanel('editor', 'a.js')], { weight: 3 })]),
    left: [], right: [],                        // blocks that start auto-hidden in the edge strips
  }),
});
container.appendChild(dock.getElement());      // give the container a height
dock.model.openDocument('editor', 'b.js', { file: 'b.js' });
dock.dispose();
```

- **Rendering is keyed.** Each split, group and panel element is created once and cached by id. A change only moves the DOM nodes whose place changed, so panel content (text, scroll, focus) is never rebuilt when you switch tabs, dock or resize. `ctx.setState(name, value)` stores a string in `panel.state`; it is saved with the layout and survives moves.
- **Docking.** Drop a tab or a whole block (drag the empty part of the tab bar) on the centre of a block to merge it as a tab, on an edge to split, on the tab strip to re-order, or on the outer edge of the workspace to dock around everything.
- **Blocks.** Use ⋯ or right-click the tab bar to add panels, add blocks, move the tabs to the bottom, maximize (or double-click the tab bar; Esc restores), auto-hide, or close the block. Only outer side columns without `document` panels can auto-hide. Their tabs then sit in an edge strip and open as a resizable flyout on hover; the pin docks them back.
- **Keyboard.** Arrow keys, Home and End move between tabs (mirrored in RTL); Delete closes a tab; middle-click also closes one. The menus follow the same keys.
- **Touch and pen.** A mouse uses native drag and drop. A finger or pen drags tabs and block handles with the dock's own gesture: past 8 px a label follows the finger, and the same drop overlay shows where it will land. A tap still just selects the tab. Splitters and flyout widths work with any pointer.
- **Declared layouts.** `DockModel.layoutFrom(saved)` turns a saved layout (the object or JSON that `serialize()` produces) into a `defaultLayout`, so an arrangement can be written as data.
- **Model API** (`dock.model`): `addPanel`, `addBlock`, `show`, `openDocument`, `moveTo`, `close`, `closeGroup`, `activate`, `toggleMaximize`, `autoHide`, `pin`, `resize`, `toggleTabsPosition`, `resetLayout`, `serialize`, `load`, and `on('change', …)`. Use `dock.clearSaved()` to forget the stored layout.

The demo's **VS 2026 Dock** view (`demo/views/VSDockLayout.js`) is the full example: VsDock's shell (menus, toolbar, status bar) and working panels.

### MudDock from Blazor

Each panel is a Blazor component that the dock mounts with Blazor's [JS root components](https://learn.microsoft.com/aspnet/core/blazor/components/js-spa-frameworks#render-razor-components-from-javascript). Blazor owns each panel's DOM, and the dock never moves markup that Blazor rendered.

```csharp
// Program.cs: register every panel component under a name
builder.RootComponents.RegisterForJavaScript<ExplorerPanel>("app-explorer");
builder.RootComponents.RegisterForJavaScript<EditorPanel>("app-editor");

// ExplorerPanel.razor / EditorPanel.razor receive:
[Parameter] public string PanelId { get; set; } = "";
[Parameter] public string PanelKey { get; set; } = "";
[Parameter] public string Title { get; set; } = "";
```

```csharp
_dock = await mud.InvokeAsync<IJSObjectReference>("create", "dock", hostElement, new
{
    storageKey = "my-app.layout",
    layout = savedOrDefaultLayout,        // the shape serialize() produces (object or JSON string)
    definitions = new object[]
    {
        new { key = "explorer", title = "Explorer", component = "app-explorer" },
        new { key = "editor", title = "Untitled", allowMultiple = true, document = true, component = "app-editor" },
    },
}, DotNetObjectReference.Create(this));   // OnMudEvent("layout", json) after every change

var panelId = await _dock.InvokeAsync<string>("openDocument", "editor", "Program.cs", new { file = "Program.cs" });
await _dock.InvokeVoidAsync("dispose");   // in DisposeAsync: also disposes the panel components
```

The handle's methods are `addPanel(key, groupId?, zone?)`, `show`, `openDocument`, `close`, `activate`, `getPanelState`, `setPanelState`, `resetLayout`, `clearSaved`, `serialize`, `load` and `dispose`.

## Using it from Blazor

The Default layout module bundles MudTail's Blazor interop (`mudtail/blazor`) into its `js/module.js` and `css/main.min.css`. Once that layout is active, every module can use this one shared runtime instead of shipping its own:

```csharp
// The interop object the layout's module.js returned to moduleHost
var mud = await JS.InvokeAsync<IJSObjectReference>("moduleHost.get", "Layouts.Default");
await mud.InvokeVoidAsync("toast", "Saved", "success");
```

To ship MudTail in another app instead, copy `dist/mudtail.blazor.js` and `dist/mudtail.css` into its `wwwroot` and import it:

```csharp
await using var mud = await JS.InvokeAsync<IJSObjectReference>(
    "import", "./_content/<Assembly>/js/mudtail.blazor.js");

await mud.InvokeVoidAsync("init", new { primary = "#594ae2", isDark = false });   // once per app
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

### Lifecycle

Every function that sets something up returns a **handle with `dispose()`**. Call it from your component's `DisposeAsync`. Calling it twice is harmless.

| Call | Returns | Notes |
| --- | --- | --- |
| `init(options)` | the theme | Once per app. Options: `primary`, `secondary`, `borderRadius`, `isDark`, `numerals` (`'auto'`, `'latn'`, `'arab'` or `'arabext'`), `locale` (+ `persistLocale`), `dir`, `lang`, `autoInit`. Any other key is ignored, so it is safe as a module entry point. |
| `create(name, host, options, dotNetRef)` | handle | One of the components in the table below; `componentNames()` lists them. |
| `behavior(name, element)` | handle or `null` | One behaviour on one element Blazor rendered: `ticker`, `score-strip`, `lightbox`, `mega-nav`, `reading-progress`, `theme-toggle`, `password-toggle`. Attach in `OnAfterRenderAsync(firstRender)`. Returns `null` when the markup doesn't fit. |
| `autoInit(root)` | handle (`refresh`, `dispose`) | All `data-mud` behaviours under `root`, kept in sync with what Blazor renders. The Default layout already runs one on `<body>`. |
| `ripple(element)`, `tooltip(element, text, position)` | handle | For Blazor-rendered buttons and other elements. |
| `lightbox(items, index)` | handle (`next`, `prev`, `show`, `close`, `dispose`) | Opens a viewer on `[{ src, caption, alt }]`. |
| `observeTheme(dotNetRef)`, `observeDirection(dotNetRef)`, `observeLocale(dotNetRef)` | handle | Raises `OnMudEvent("theme", theme)`, `OnMudEvent("direction", "ltr" \| "rtl")` or `OnMudEvent("locale", { locale, dir })`. |
| `setTheme`, `toggleDark`, `getTheme`, `setDirection`, `toast` | value | No setup, so nothing to dispose. |
| `dispose()` | count | Disposes every handle still alive. The Default layout calls it when moduleHost deactivates it. |
| `activeCount()` | number | Handles still alive: a quick leak check. |

| `create` name | Events | Handle methods |
| --- | --- | --- |
| `button` | `click` | `dispose` |
| `autocomplete` | `select` (value) | `setValue`, `dispose` |
| `tabs` | `change` (tab id) | `setActive`, `setPosition`, `dispose` |
| `accordion` | none | `dispose` |
| `drawer` | `open`, `close` | `open`, `close`, `toggle`, `setContent`, `setTitle`, `setAnchor`, `dispose` |
| `dialog` | `action` (action id), `close` | `open`, `close`, `dispose` |
| `datatable` | `query` ({ requestId, query, filter }), `rowclick`, `selection` | `setData`, `setPage`, `failPage`, `reload`, `setQuery`, `getQuery`, `getSelection`, `clearSelection`, `dispose` |
| `dock` | `layout` (JSON) | `addPanel`, `show`, `openDocument`, `close`, `activate`, `getPanelState`, `setPanelState`, `resetLayout`, `clearSaved`, `serialize`, `load`, `dispose` (see "MudDock from Blazor") |

```csharp
@implements IAsyncDisposable
<div class="mud-ticker" @ref="_ticker">…</div>

@code {
    private ElementReference _ticker;
    private IJSObjectReference? _mud, _behavior;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!firstRender) return;
        _mud = await JS.InvokeAsync<IJSObjectReference>("moduleHost.get", "Layouts.Default");
        _behavior = await _mud.InvokeAsync<IJSObjectReference>("behavior", "ticker", _ticker);
    }

    public async ValueTask DisposeAsync()
    {
        if (_behavior is not null) { await _behavior.InvokeVoidAsync("dispose"); await _behavior.DisposeAsync(); }
        if (_mud is not null) await _mud.DisposeAsync();
    }
}
```

Component options are inserted as HTML (titles, labels, tab content), so never pass unescaped user content to them.
