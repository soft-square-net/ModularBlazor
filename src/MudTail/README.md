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

**The demo** has a language switch in the app bar and on the public site. It covers every page in English and Arabic: the dashboard, docs, IDE, all 38 component pages and the public site. Its pages are English HTML templates, so `demo/i18n` uses a catalog keyed by the English source text. Rendered views are translated as they appear, whole sentences at a time when they contain inline markup, so Arabic word order stays natural. Code samples and editors are never touched. Values built in code (column titles, sample data, dates) are localized where they are built. The Theme Studio drawer has a **Digits** choice (Auto, Western, Arabic-Indic). The demo applies it to its static numbers too, but leaves codes such as "P99" alone. Run `__i18nMissing()` in the browser console to list any text on the current page that is still untranslated.

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

## Loading and progress

**Which loading pattern to use:**

| Pattern | Use it for |
| --- | --- |
| Skeleton (`.mud-skeleton`) | The first load of a content area: article lists, cards, a profile. The layout doesn't jump when the content arrives. |
| Spinner (`.mud-spinner`, `-dots`, `-bars`, `-pulse`) | Short waits in a small place: a widget, a dropdown, a "load more" button. Bars suit live audio or a live match; pulse is a "live" beacon. |
| Overlay (`showLoading(element)`) | Refreshing content that is already on screen, such as a table or chart. It stays visible but dimmed. |
| Busy button (`setButtonLoading`) | While a form or action is sent. It stops a second click. |
| Page loader (`pageLoader`) | Moving between pages or lazy-loaded modules. |
| Progress bar or ring | Whenever the amount is known: uploads, steps, reading or match progress. |

```html
<span class="mud-spinner mud-tone-success" style="--mud-spinner-size: 48px; --mud-spinner-width: 6px" role="status"><span class="mud-sr-only">Loading…</span></span>

<div class="mud-progress" role="progressbar" aria-valuenow="42" aria-valuemin="0" aria-valuemax="100" style="--mud-progress-value: 42">
  <div class="mud-progress__track"><div class="mud-progress__bar"></div></div><span class="mud-progress__label">42%</span>
</div>

<div class="mud-donut mud-tone-warning" role="progressbar" aria-valuenow="68"
     style="--mud-progress-value: 68; --mud-progress-thickness: 10px; --mud-progress-border-width: 2px; --mud-progress-border-color: var(--mud-palette-warning)">
  <span class="mud-donut__label">68%</span>
</div>
```

```js
import { MudProgressCircular, MudProgressLinear, showLoading, setButtonLoading, pageLoader } from 'mudtail';

const ring = new MudProgressCircular({
  value: 62, size: 120, thickness: 12, color: 'primary', trackColor: '#e4e1fb',
  borderWidth: 2, borderColor: 'primary', linecap: 'round', sublabel: 'possession',
  thresholds: [{ from: 0, color: 'error' }, { from: 40, color: 'warning' }, { from: 75, color: 'success' }],
});
ring.setValue(80);   // also update({ … }), setIndeterminate(true)
```

- **Markup only (Razor):** every value, colour, size, line width and border is a custom property. Set `--mud-progress-value`, `-buffer`, `-color`, `-track`, `-height`, `-radius`, `-size`, `-thickness`, `-border-width`, `-border-color` and `-steps` in a `style` attribute that Blazor re-renders.
  - Modifiers: `--small`, `--large`, `--striped`, `--animated`, `--indeterminate`, `--steps`, `--stacked` (a caption row) and `--square`.
  - The `.mud-tone-*` classes colour both spinners and bars.
- **`MudProgressLinear` / `MudProgressCircular`:**
  - The label is written in the page's digits.
  - `thresholds` change the colour with the value.
  - The SVG ring has round or flat caps, a start angle, counter-clockwise fill, a border on both edges, a sub-label and an indeterminate state.
- **Accessibility:** `role="progressbar"` with `aria-valuenow`/`aria-valuetext` (left out while indeterminate), `role="status"` on spinners, and `aria-busy` on overlaid containers and busy buttons. Animations slow down or stop for `prefers-reduced-motion`.

## Stat hero card

The stat hero card is a "how we compare" block for the public site. An eyebrow, a headline and a lead sit over a card of horizontal bars. One bar is highlighted, with a gradient fill and a large value; the others are muted. The bars grow in when the card scrolls into view. Use it for page speed, reader trust, match statistics, ticket sales or exhibition visitors. The public-site demo has one under Sport.

```html
<section class="mud-stat-hero mud-stat-hero--dark" aria-labelledby="speed-title">
  <header class="mud-stat-hero__head">
    <p class="mud-stat-hero__eyebrow">Best-in-class speed</p>
    <h2 class="mud-stat-hero__title" id="speed-title">The fastest front page in the region</h2>
    <p class="mud-stat-hero__lead">…</p>
  </header>
  <figure class="mud-stat-card" data-mud="stat-bars">
    <figcaption class="mud-stat-card__caption">% of page visits that load in under two seconds</figcaption>
    <ol class="mud-stat-bars">
      <li class="mud-stat-bar is-highlight" style="--mud-stat-value: 71">
        <span class="mud-stat-bar__label">The Daily Mud</span>
        <span class="mud-stat-bar__track">
          <span class="mud-stat-bar__fill"><span class="mud-stat-bar__icon" aria-hidden="true">…svg…</span></span>
          <span class="mud-stat-bar__value">71%</span>
        </span>
      </li>
      <li class="mud-stat-bar" style="--mud-stat-value: 48">…</li>
    </ol>
    <p class="mud-stat-card__source"><a href="…">View the full dataset</a> · …</p>
  </figure>
</section>
```

- **Looks:**
  - `--dark` gives the deep navy look with a teal glow, whatever the page theme. Without it, the card follows the theme, light or dark.
  - `.mud-stat-card--compact` is a smaller card for articles and sidebars.
  - Labels share one column, as wide as the longest label, so the tracks line up. On phones, each label sits above its bar.
- **Custom properties:** `--mud-stat-value`, `--mud-stat-max` (default 100), `--mud-stat-from` / `--mud-stat-to` (the highlight gradient; can be set per bar), `--mud-stat-fill` (the other bars) and `--mud-stat-label-width`.
- **Animation:** `data-mud="stat-bars"` grows the bars in. It only animates `--mud-stat-progress`, so Blazor keeps owning the markup. Without it, or with reduced motion, bars are simply full.
- **From JavaScript:** `createStatCard({ eyebrow, title, lead, caption, items: [{ label, value, icon, highlight, from, to, fill }], max, format, sort, dark, compact, source })` builds the same markup. Values are written in the page's digits. From Blazor, use `create("statCard", host, options)`, or write the markup in Razor and use `behavior("stat-bars", element)`.
- **Right-to-left:** it mirrors, and the gradient flips with it.

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
| `stat-bars` | On a `.mud-stat-card`: its `.mud-stat-bar` rows grow in, one after another, when the card scrolls into view. Only `--mud-stat-progress` is animated, so the markup stays Blazor's. Bars are full without it or with reduced motion. |

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

### Create, edit and delete

`create: true` adds a **New** button. `actions` adds an actions column. Both open a **MudEditForm** in a dialog.

```js
const table = new MudDataTable({
  columns, data: articles,
  create: true,
  actions: ['edit', 'delete',
    { id: 'feature', label: 'Feature', icon: 'star', color: 'warning', show: (row) => !row.featured,
      onClick: (row, table) => table.updateRow({ ...row, featured: true }) }],
  actionsDisplay: 'icons',                      // 'icons' | 'buttons' | 'menu'
  editor: { fields: [{ key: 'title', label: 'Title', required: true, maxLength: 120, span: 2 }, …] },
  onCreate: (model) => api.create(model),       // the saved row, or { errors: { title: 'Already used' } }
  onUpdate: (model, row) => api.update(row.id, model),
  onDelete: (row) => api.remove(row.id),
});
```

- **The form's fields** default to one per column, typed by the column (enum → select, boolean → switch, date → date). Leave a column out with `editable: false`, or refine its field with `required` and `editor: { … }`. Alternatively, give the whole list in `editor.fields`.
- **Saving:**
  - The `on…` hooks may be async.
  - Returning `{ errors }` or throwing keeps the dialog open, with each message under its field.
  - Without hooks, client mode edits its own rows. Server mode with `server.url` calls `POST {url}`, `PUT {url}/{key}` and `DELETE {url}/{key}`, and a 400 `ValidationProblemDetails` becomes field errors.
- **Delete** asks first. Set `confirmDelete: false` to skip it, or pass a function that returns the question.
- **Extra actions** take these options:
  - `show(row)` and `disabled(row)` decide where the action appears and when it is greyed out.
  - Each has its own `onClick(row, table)`, or falls back to `onAction(id, row)`.
  - In menu mode they share one ⋮ menu per row, which supports arrow keys, Home/End and Escape.
- **A custom column** doesn't need the actions column. Any element in a cell with `data-dt-action="edit"`, `"delete"` or your own id runs that action on its row. Icon buttons from `render(value, row, table)`, or Razor markup, work with no event wiring.
- **From code:** `openCreate(defaults)`, `openEdit(row | key)`, `deleteRow(row | key)` and `runAction(id, row | key)`. In client mode, `addRow`, `updateRow` and `removeRow` change rows without a form. `onRowsChange({ type, row, key })` is called after each change.
- **From Blazor:** with the default `crud: 'dotnet'`, the table raises `create`, `update` or `delete` with a `requestId`. Answer with `completeEdit(requestId, savedRow)`, or with `failEdit(requestId, message, errors)` to keep the form open. A ValidationProblemDetails `Errors` dictionary can be passed as it is. Custom actions raise `action` (`{ action, key, row }`). Use `crud: 'rest'` or `crud: 'client'` for the other modes.

### MudEditForm

MudEditForm is a form built from field definitions and bound to a copy of a model, like Blazor's `EditForm` with DataAnnotations.

- **Rules:** `required`, `min`/`max`, `minLength`/`maxLength`, `pattern`, the `email`/`url` formats, and your own `validate(value, model)`.
- **When it validates:** a field is checked after you leave it. After the first submit, fields are checked as you type.
- **Accessibility:** errors are linked to their fields with `aria-invalid` and `aria-describedby`, and a summary appears on submit.
- **Field types:** text, textarea, number, email, url, tel, password, date, datetime-local, time, color, select, radio, checkbox, switch and hidden.
- **Submitting:** `onSubmit(model)` may be async. While it runs, the submit button shows its busy state. Server errors can be returned as `{ errors }` or set with `setErrors(errors, message)`.

`openEditDialog(options)` shows the form in a dialog and resolves with the saved model, or `null` if it was cancelled. `confirmDialog({ title, message, confirmText, color })` resolves `true` or `false`. All of its texts are translated, including Arabic.

## Tree view (MudTreeView)

`MudTreeView` is a tree with levels that the reader can reorder. It's suited to site sections, menus, categories, running orders and playlists.

```js
import { MudTreeView } from 'mudtail';

const tree = new MudTreeView({
  label: 'Site sections',
  nodes: [
    { id: 'news', label: 'News', icon: 'news', expanded: true, badge: 128, children: [
      { id: 'world', label: 'World' }, { id: 'local', label: 'Local', children: [{ id: 'harbour', label: 'Harbour district' }] } ] },
    { id: 'sport', label: 'Sport', icon: 'trophy', children: [{ id: 'football', label: 'Football' }] },
    { id: 'about', label: 'About us', draggable: false, droppable: false },
  ],
  dragMode: 'any',                       // 'any' | 'level' | 'siblings' | 'none'
  onMove: ({ node, from, to, source }) => api.move(node.id, to.parentId, to.index),
});
host.appendChild(tree.getElement());
```

**Reordering:**
- **Move up / move down buttons:** each node has them. They move the node among its siblings on the same level, and are disabled at the ends. From the keyboard, Alt+↑ and Alt+↓ do the same.
- **Drag and drop:** works with a mouse on the whole row, or with a pen or touch on the grip, so the page still scrolls under a finger.
  - A line shows where the node will land, at the target's level.
  - Dropping on the middle of a row puts the node *inside* it. A collapsed node opens if you hold the drag over it.
  - Esc cancels. The page auto-scrolls near its edges.
- **`dragMode` limits where a node can go:**
  - `any`: before, after or inside any node.
  - `level`: anywhere at the same depth.
  - `siblings`: only within its own parent, the same rule as the buttons.
  - `none`: buttons only.
- **More limits:** `maxDepth`, `canDrop(node, target, position)`, and per-node `draggable: false` / `droppable: false`. A node can never be dropped into its own branch.

**Feedback:** rows slide to their new places, and the moved node flashes once. Both are skipped with reduced motion. Every move is announced to screen readers ("World moved to position 2 of 4 in News").

**Accessibility:** it follows the WAI-ARIA tree pattern.
- Roving focus and `aria-level` / `aria-setsize` / `aria-posinset`.
- ↑ ↓ Home End move between nodes. → ← open and close nodes, mirrored in right-to-left.
- Enter selects, `*` opens all siblings, and typing a letter jumps to the next node starting with it.

**From code:** `moveUp`, `moveDown`, `move(id, parentId, index)`, `addNode`, `removeNode`, `updateNode`, `select`, `toggle`, `expandAll`, `collapseAll`, `getData` (the tree in its current order, with your own fields kept) and `setData`.

**From Blazor:** `create("tree", host, options, dotNetRef)`. It raises `move` with `{ id, from: { parentId, index }, to: { parentId, index }, source }`, and `change` with the whole tree, so you can save a single move or the full order.

## Image editor (MudImageEditor)

`MudImageEditor` is a Photoshop-style editor that runs entirely in the browser.

```js
import { MudImageEditor } from 'mudtail';

const editor = new MudImageEditor({
  src: '/media/harbour.jpg',                      // URL (CORS-enabled), File, Blob or <img>
  format: 'webp', quality: 0.86,
  sizes: [
    { name: 'thumbnail', width: 160, height: 160, fit: 'cover' },
    { name: 'article', width: 1200, fit: 'width' },
    { name: 'hero', width: 1920, height: 1080, fit: 'cover' },
  ],
  upload: { url: '/api/v1/media/images', mode: 'multipart' },   // or mode: 'stream'
});
host.appendChild(editor.getElement());
```

**Features:**
- **Opening an image:** the Open button, drag and drop, or pasting.
- **Tools:**
  - **Move / zoom:** wheel, pinch, + / −, fit, 100 %, and Space+drag pans with any tool.
  - **Crop:** free or a fixed ratio (original, 1:1, 4:3, 3:2, 16:9, 21:9, 4:5, 3:4, 9:16), with eight handles, rule of thirds and a size label.
  - **Drawing:** brush, highlighter, text (with font, size and bold), rectangle, ellipse and arrow.
  - **Eyedropper:** picks a colour from the image for the drawing tools.
- **Transform:** rotate 90°, straighten (±45°), flip horizontally or vertically, and a background colour for straightened corners. Any crop and drawings follow every transform.
- **Adjustments:**
  - Light: exposure, brightness, contrast, highlights, shadows.
  - Colour: temperature, tint, saturation, vibrance, hue.
  - Effects: vignette, grain, sharpen, blur, black and white, sepia, invert.
  - 12 filter presets (Vivid, Warm, Noir, Vintage, Newsprint…), each with a live thumbnail.
- **Checking and undoing:** a histogram, before/after (hold **Compare**), and up to 60 steps of undo/redo.
- **Non-destructive editing:** the edit is a plain object (`getState()` / `setState()`). The preview is rendered at up to 1,600 px; exports always use full resolution.
- **Output:**
  - A resize with linked width and height for the edited image.
  - Any number of output sizes, made from the full-resolution crop, never from the resized image. Fit modes: `cover` (crop to fill), `contain`, `width`, `height`, `inside` (never upscale) and `fill`.
  - WebP, JPEG (flattened on the background colour) or PNG. AVIF works only where the browser can encode it; otherwise the browser falls back to PNG.
  - High-quality downscaling in halving steps, a list of the created files with download buttons, and a progress bar while uploading.
- **Upload modes:**
  - `multipart` sends every size in one `multipart/form-data` request (field `files`), plus a `meta` JSON part (name, width, height, type, size) and a `recipe` JSON part (see Recipes below).
  - `stream` sends one request per size. The body is the image bytes (`Content-Type: image/webp`), with `X-File-Name`, `X-Image-Size`, `X-Image-Width` and `X-Image-Height` headers, and `{name}` in the URL is replaced with the size's name. On the server, read `Request.Body` directly; the image is never buffered. The recipe goes to `upload.recipeUrl` as JSON, with `upload.method`.
  - `includeOriginal: true` also sends the untouched original, the exact bytes that were opened (not the edited full-size image, which is the `original` size). Multipart adds it as an `original` file part. Stream mode sends it first, to `upload.originalUrl`, with `Content-Type` and `X-File-Name`. The upload fails if the original's bytes could not be read, for example an image from another site without CORS. It is off by default.
  - Use `onSave(files)` instead to save in your own way.
- **Saving to the Modular Blazor API:** the `Media` host module (`modules/host/Media`) implements both modes:

  ```js
  // multipart: one request
  upload: { url: '/api/v1/media/images', mode: 'multipart', includeOriginal: true, headers: { Authorization: `Bearer ${token}` } }

  // stream: you pick the image's id; the first request to a new id creates the image
  const id = crypto.randomUUID();
  upload: {
    mode: 'stream', includeOriginal: true, headers: { Authorization: `Bearer ${token}` },
    url: `/api/v1/media/images/${id}/variants/{name}`,
    originalUrl: `/api/v1/media/images/${id}/original`,
    recipeUrl: `/api/v1/media/images/${id}/recipe`,      // PUT or POST
  }
  ```

  `GET /api/v1/media/images/{id}` returns the variants (with download URLs) and the recipe; `GET …/{id}/recipe` returns the recipe exactly as it was stored, and `GET …/{id}/original` the original, ready for `renderRecipe`.
- **Keyboard:** V C B H T U O A I pick the tools, Ctrl+Z / Ctrl+Y undo and redo, Enter / Esc apply or cancel a crop, and [ ] change the brush size.
- **Languages and layout:** every text is translated, including Arabic, and the layout mirrors in RTL. On narrow screens the tools move into a row and the panel goes below the canvas.

**From code:** `crop(rect | '16:9')`, `rotate(±1)`, `flip('h' | 'v')`, `straighten(deg)`, `adjust({ contrast: 15 })`, `applyPreset('warm')`, `resize({ width })`, `exportImage({ format, quality })` (resolves to a Blob), `exportSizes()`, `upload()` and `download(name)`. The pure pipeline (`applyAdjustments`, `fitSize`, `histogram`, `centeredCrop`, …) is exported too, for server-side-style processing in the browser.

**From Blazor:** `create("imageEditor", host, options, dotNetRef)`. The bytes come back to .NET as a stream:

```csharp
await using var js = await _editor.InvokeAsync<IJSStreamReference>("getFile", "thumbnail");   // or ("exportImage", "jpeg", 0.9)
await using var stream = await js.OpenReadStreamAsync(maxAllowedSize: 20_000_000);
await Http.PostAsync("api/v1/media/images/thumbnail", new StreamContent(stream));
```

With `saveWith: "dotnet"`, the Save button raises `save` with `{ files, recipe }` instead of uploading, so your component stores the files with its own authorised `HttpClient`.

### Recipes: regenerate the exported files later

A recipe is plain JSON with everything needed to turn the original into the exported files again. Store it in the database next to the untouched original. Replaying it on that original gives the same files, byte for byte; the demo page checks this.

```json
{
  "type": "mudtail.image-recipe", "version": 1, "createdAt": "2026-11-10T09:30:00.000Z",
  "source": { "name": "harbour", "width": 2400, "height": 1600, "type": "image/jpeg", "bytes": 482113, "sha256": "…" },
  "pipeline": ["rotate", "flip", "straighten", "background", "blur", "adjust", "annotate", "crop", "resize", "sizes", "encode"],
  "edit": { "quarter": 0, "angle": 0, "flipH": false, "flipV": false, "background": null, "adjust": { "contrast": 15 },
            "preset": "custom", "annotations": [], "crop": { "x": 0, "y": 150, "width": 2400, "height": 1350 }, "resize": { "width": 1600 } },
  "output": { "format": "webp", "quality": 0.86, "includeOriginal": true, "fileName": "harbour",
              "sizes": [{ "name": "thumbnail", "width": 160, "height": 160, "fit": "cover" }] },
  "files": [{ "name": "thumbnail", "fileName": "harbour-thumbnail.webp", "width": 160, "height": 160, "type": "image/webp", "bytes": 5120 }]
}
```

- **Getting a recipe:**
  - `editor.getRecipe()` returns it.
  - Every upload carries it: multipart sends a `recipe` part, stream mode sends it to `upload.recipeUrl`, and `onSave(files, editor, recipe)` and `onExport(files, recipe)` receive it.
  - The Export panel can copy it, download it as `.json`, load it from a file, or show it and apply a pasted one.
- **Regenerating:**
  - `renderRecipe(original, recipe, { verify, sizes })` resolves to `{ files, recipe, warnings }`, without the editor's UI. It uses the same rendering function as the editor's export, which is why the files match.
  - It can render only some sizes, for example a new size added to every stored image.
  - `editor.applyRecipe(recipe)` reopens the edit for more changes, as one undoable step.
- **Checks:**
  - **Coordinates:** crop and drawings are in pixels of the full-size original after rotation.
  - **Same original:** the original's SHA-256 is checked when it can be read; it can't be when the image comes from another site without CORS.
  - **Higher-resolution master** (same proportions): coordinates, stroke widths and blur are scaled, and the warning is `different-resolution`.
  - **Other warnings:** `different-file` and `different-proportions`. With `verify: 'strict'` a different file is refused (`RecipeError`).
- **Safe to store and replay:** `normalizeRecipe` validates every value. It clamps numbers to their ranges, drops unknown fields and shapes, and only accepts plain colours and safe font names. A recipe read back from the database can't inject anything.
- **Versioning:** each recipe records its `version`. A newer recipe than this MudTail understands is refused rather than half-applied.
- **Same output, same environment:** the files match when rendered by the same MudTail in the same browser engine. Another engine can differ by a few bytes in its WebP or JPEG encoder or in text antialiasing, while the pixels look the same.
- **Where regeneration runs:** in the browser or in Blazor WebAssembly. From Blazor, call `renderRecipe(originalUrl, recipeJson)` and then `getFile(name)` for each file, as a stream.

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
| `behavior(name, element)` | handle or `null` | One behaviour on one element Blazor rendered: `ticker`, `score-strip`, `lightbox`, `mega-nav`, `reading-progress`, `theme-toggle`, `password-toggle`, `stat-bars`. Attach in `OnAfterRenderAsync(firstRender)`. Returns `null` when the markup doesn't fit. |
| `autoInit(root)` | handle (`refresh`, `dispose`) | All `data-mud` behaviours under `root`, kept in sync with what Blazor renders. The Default layout already runs one on `<body>`. |
| `ripple(element)`, `tooltip(element, text, position)` | handle | For Blazor-rendered buttons and other elements. |
| `lightbox(items, index)` | handle (`next`, `prev`, `show`, `close`, `dispose`) | Opens a viewer on `[{ src, caption, alt }]`. |
| `observeTheme(dotNetRef)`, `observeDirection(dotNetRef)`, `observeLocale(dotNetRef)` | handle | Raises `OnMudEvent("theme", theme)`, `OnMudEvent("direction", "ltr" \| "rtl")` or `OnMudEvent("locale", { locale, dir })`. |
| `setTheme`, `toggleDark`, `getTheme`, `setDirection`, `toast` | value | No setup, so nothing to dispose. |
| `buttonLoading(element, bool)`, `pageLoading(true | false | percent)` | nothing | A busy state on a Blazor-rendered button; the page-top loader (calls nest). |
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
| `datatable` | `query` ({ requestId, query, filter }), `rowclick`, `selection`, `create` / `update` / `delete` ({ requestId, … }), `action`, `changed` | `setData`, `setPage`, `failPage`, `reload`, `setQuery`, `getQuery`, `getSelection`, `clearSelection`, `openCreate`, `openEdit`, `deleteRow`, `completeEdit`, `failEdit`, `addRow`, `updateRow`, `removeRow`, `dispose` |
| `progress` | none | `setValue`, `setBuffer`, `setIndeterminate`, `update`, `dispose` |
| `progressCircular` | none | `setValue`, `setIndeterminate`, `update`, `dispose` |
| `spinner` | none | `dispose` |
| `loading` | none | Covers `host`, which can be any element: `show`, `hide`, `setText`, `isVisible`, `dispose` |
| `tree` | `move` ({ id, from, to, source }), `change` (nodes), `select` (node), `toggle` ({ id, expanded }) | `setData`, `getData`, `select`, `toggle`, `expandAll`, `collapseAll`, `moveUp`, `moveDown`, `move`, `addNode`, `removeNode`, `updateNode`, `dispose` |
| `statCard` | none | Builds the stat hero card from data (see "Stat hero card"): `update(options)`, `dispose` |
| `imageEditor` | `opened`, `change` (edit state), `exported` ({ files, recipe }), `uploaded`, `save` ({ files, recipe }, with `saveWith: "dotnet"`), `error` | `open`, `getState`, `setState`, `undo`, `redo`, `reset`, `setTool`, `rotate`, `flip`, `straighten`, `adjust`, `applyPreset`, `crop`, `resize`, `zoomFit`, `exportImage` and `getFile` (bytes, as an `IJSStreamReference`), `exportSizes`, `getRecipe`, `applyRecipe`, `renderRecipe` (regenerate without the UI), `upload`, `download`, `dispose` |
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
