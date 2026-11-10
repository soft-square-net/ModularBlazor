// Components ▸ Data table: client-side and server-side (PaginationFilter + Ardalis specifications).
import { MudDataTable, applyQuery, toPaginationFilterParams, showToast, t, getLocale } from 'mudtail';
import { componentPage, esc } from './page.js';

// ───────── sample data (deterministic) ─────────

const SECTIONS = ['News', 'Sport', 'Culture', 'Business', 'Opinion'];
const AUTHORS = ['Lina Haddad', 'Omar Saleh', 'Mira Chen', 'Daniel Ruiz', 'Hana Youssef', 'Leo Martins', 'Nour Adel', null];
const WORDS = ['Coastal', 'rail', 'harbour', 'gallery', 'derby', 'budget', 'comet', 'ferries', 'striker', 'museum', 'election', 'climate', 'market', 'festival', 'final'];
// Sample headlines are generated, so they are generated in the active language rather than translated.
const WORDS_AR = ['الساحل', 'القطار', 'الميناء', 'المعرض', 'الديربي', 'الميزانية', 'المذنب', 'العبّارات', 'المهاجم', 'المتحف', 'الانتخابات', 'المناخ', 'السوق', 'المهرجان', 'النهائي'];

function makeArticles(n) {
  const arabic = getLocale().startsWith('ar');
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  return Array.from({ length: n }, (_, i) => {
    const words = Array.from({ length: 3 + Math.floor(rnd() * 3) }, () => pick(arabic ? WORDS_AR : WORDS));
    const title = arabic ? words.join(' و') : words.join(' ').replace(/^./, (c) => c.toUpperCase());
    const day = new Date(Date.UTC(2025, 0, 1) + Math.floor(rnd() * 600) * 86400000);
    return {
      id: i + 1,
      title,
      section: pick(SECTIONS),
      author: ((a) => (a ? t(a) : a))(pick(AUTHORS)),
      views: Math.floor(rnd() * 50000),
      featured: rnd() < 0.2,
      publishedOnUtc: day.toISOString(),
      rating: rnd() < 0.15 ? null : Math.round((1 + rnd() * 4) * 10) / 10,
    };
  });
}

let cache = null;
const articles = () => (cache ??= makeArticles(250));

// Columns use the API's property names as `field` (PascalCase), so the same definitions serve both modes.
// Titles and section labels are translated; field names and section values stay as the API knows them.
const columns = () => [
  { key: 'id', field: 'Id', title: '#', type: 'number', width: '4rem', filterable: false },
  { key: 'title', field: 'Title', title: t('demo.dt.title', {}, 'Title') },
  { key: 'section', field: 'Section', title: t('demo.dt.section', {}, 'Section'), type: 'enum', options: SECTIONS.map((v) => ({ value: v, label: t(v) })),
    render: (v) => `<span class="mud-badge" style="--mud-accent: var(--mud-palette-${v === 'Sport' ? 'success' : v === 'Culture' ? 'warning' : 'primary'})">${esc(t(v))}</span>` },
  { key: 'author', field: 'Author', title: t('demo.dt.author', {}, 'Author') },
  { key: 'views', field: 'Views', title: t('demo.dt.views', {}, 'Views'), type: 'number', format: 'integer' },
  { key: 'rating', field: 'Rating', title: t('demo.dt.rating', {}, 'Rating'), type: 'number' },
  { key: 'featured', field: 'Featured', title: t('demo.dt.featured', {}, 'Featured'), type: 'boolean' },
  { key: 'publishedOnUtc', field: 'PublishedOnUtc', title: t('demo.dt.published', {}, 'Published'), type: 'date' },
];

// ───────── a pretend API: it reads the PaginationFilter query string, like [AsParameters] would ─────────

function parseQueryString(qs) {
  const p = new URLSearchParams(qs);
  return {
    keyword: p.get('Keyword') ?? '',
    searchFields: p.getAll('SearchFields'),
    pageNumber: Number(p.get('PageNumber') ?? 1),
    pageSize: Number(p.get('PageSize') ?? 10),
    orderBy: p.getAll('OrderBy'),
    filters: p.getAll('Filters').map((f) => { const [field, op, ...rest] = f.split('|'); return { field, op, value: rest.join('|') }; }),
  };
}

function fakeApi(qs, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      const query = parseQueryString(qs);
      const { items, totalCount } = applyQuery(articles(), columns(), query);
      // PagedResponse<T>, as the .NET endpoint returns it
      resolve({ items, totalCount, pageNumber: query.pageNumber, pageSize: query.pageSize, totalPages: Math.ceil(totalCount / query.pageSize) });
    }, 450);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); });
  });
}

// ───────── page ─────────

export const DATATABLE_PAGE = {
  id: 'data-table', label: 'Data table', icon: 'database',
  render: () => componentPage({
    title: 'Data table', kinds: ['JS', 'Blazor', '.NET'],
    lead: 'Global search, column filters, multi-column sorting (Shift+click), paging and selection, over rows in the browser or from your API. Server-side queries are exactly what <code>[AsParameters] PaginationFilter</code> binds, and the API answers with an Ardalis specification, so both modes return the same rows.',
    examples: [
      {
        title: 'Client side', description: '250 rows filtered, sorted and paged in the browser. Open <strong>Filters</strong> for per-column conditions; each active filter shows as a removable chip.',
        code: `
          import { MudDataTable } from 'mudtail';

          const table = new MudDataTable({
            caption: 'Articles',
            data: articles,                          // rows in the browser
            selection: 'multiple',
            onRowClick: (row) => …,
            onSelectionChange: (keys, rows) => …,
            columns: [
              { key: 'title', title: 'Title' },                                   // text: searched by the keyword
              { key: 'section', title: 'Section', type: 'enum', options: ['News', 'Sport', 'Culture'] },
              { key: 'views', title: t('demo.dt.views', {}, 'Views'), type: 'number', format: 'integer' },
              { key: 'featured', title: t('demo.dt.featured', {}, 'Featured'), type: 'boolean' },
              { key: 'publishedOnUtc', title: t('demo.dt.published', {}, 'Published'), type: 'date' },
            ],
          });
          host.appendChild(table.getElement());
          // later: table.dispose();`,
        mount(el) {
          const table = new MudDataTable({
            caption: t('demo.dt.caption', {}, 'Articles'), columns: columns(), data: articles(), selection: 'multiple', striped: true,
            onRowClick: (row) => showToast(t('demo.dt.opened', { title: row.title }, 'Opened “{title}”'), 'info'),
          });
          el.appendChild(table.getElement());
          return () => table.dispose();
        },
      },
      {
        title: 'Server side', description: 'The same table, with the data from an API. Below it is the request each search, filter, sort or page change sends. Here a pretend API answers it (with half a second of latency); against the real backend, point <code>server.url</code> at an endpoint like the one in the next example.',
        code: `
          const table = new MudDataTable({
            caption: 'Articles',
            columns,                                   // field: the API's property name (Title, Views…)
            server: { url: '/api/v1/articles' },        // GET ?Keyword=…&PageNumber=…&OrderBy=…&Filters=Views|gte|1000
            // or your own request:  server: { fetch: (query, signal) => api.searchArticles(toPaginationFilter(query), signal) }
          });`,
        mount(el) {
          const request = document.createElement('pre');
          request.className = 'cp-request';
          request.setAttribute('aria-label', 'Request sent to the server');
          const table = new MudDataTable({
            caption: t('demo.dt.captionServer', {}, 'Articles (server)'), columns: columns(), selection: 'single',
            server: {
              fetch: (query, signal) => {
                const qs = toPaginationFilterParams(query).toString();
                request.textContent = `GET /api/v1/articles?${decodeURIComponent(qs.replace(/\+/g, ' '))}`;
                return fakeApi(qs, signal);
              },
            },
          });
          el.append(table.getElement(), request);
          return () => table.dispose();
        },
      },
      {
        title: '.NET: endpoint and specification', language: 'C#',
        description: 'The endpoint binds the query with <code>[AsParameters]</code>. <code>Query.SearchBy(filter)</code> applies the keyword <em>and</em> the column filters (<code>Filters=Field|op|value</code>), and <code>Query.PaginateBy(filter)</code> orders and pages. <code>RestrictTo</code> limits searching, filtering and sorting to the listed columns.',
        code: `
          // Endpoint
          group.MapGet("/", async ([AsParameters] PaginationFilter filter, ISender sender, CancellationToken ct)
                  => Results.Ok(await sender.Send(new SearchArticlesQuery(filter), ct)))
               .Produces<PagedResponse<ArticleDto>>();

          // Specification (Ardalis): keyword + column filters + order + page, projected to the DTO
          public sealed class ArticlesByPaginationFilterSpec : EntitiesByPaginationFilterSpec<Article, ArticleDto>
          {
              public static readonly string[] Fields = ["Title", "Section", "Author", "Views", "Rating", "Featured", "PublishedOnUtc"];

              public ArticlesByPaginationFilterSpec(PaginationFilter filter) : base(filter) =>
                  Query.Select(a => new ArticleDto(a.Id, a.Title, a.Section, a.Author, a.Views, a.Rating, a.Featured, a.PublishedOnUtc));
          }

          // Handler
          public Task<PagedResponse<ArticleDto>> Handle(SearchArticlesQuery q, CancellationToken ct)
          {
              var filter = q.Filter.RestrictTo(ArticlesByPaginationFilterSpec.Fields);   // no filtering on other columns
              return articles.PaginatedListAsync(new ArticlesByPaginationFilterSpec(filter), filter, ct);
          }

          // Filters it understands (all must match; text ignores case; unknown or invalid ones are skipped):
          //   Title|contains|rail   Section|in|Sport,Culture   Views|gte|1000   PublishedOnUtc|lt|2026-01-01
          //   Featured|eq|true      Rating|isnull|             Author|startswith|Li`,
      },
      {
        title: 'Blazor', language: 'Razor / C#',
        description: 'The table raises <code>query</code> with a ready <code>PaginationFilter</code>; your component calls the API with its authorised client and answers with <code>setPage</code>. Answers to queries that were replaced in the meantime are ignored.',
        code: `
          <div @ref="_host"></div>

          @code {
              private ElementReference _host;
              private IJSObjectReference? _mud, _table;
              private DotNetObjectReference<ArticlesPage>? _self;

              protected override async Task OnAfterRenderAsync(bool firstRender)
              {
                  if (!firstRender) return;
                  _self = DotNetObjectReference.Create(this);
                  _mud = await JS.InvokeAsync<IJSObjectReference>("moduleHost.get", "Layouts.Default");
                  _table = await _mud.InvokeAsync<IJSObjectReference>("create", "datatable", _host, new
                  {
                      caption = "Articles",
                      serverSide = true,
                      selection = "multiple",
                      columns = new object[]
                      {
                          new { key = "title", field = "Title", title = "Title" },
                          new { key = "section", field = "Section", title = "Section", type = "enum", options = new[] { "News", "Sport" } },
                          new { key = "views", field = "Views", title = "Views", type = "number", format = "integer" },
                          new { key = "publishedOnUtc", field = "PublishedOnUtc", title = "Published", type = "date" },
                      },
                  }, _self);
              }

              [JSInvokable]
              public async Task OnMudEvent(string name, JsonElement payload)
              {
                  if (name != "query" || _table is null) return;
                  var requestId = payload.GetProperty("requestId").GetInt32();
                  var filter = payload.GetProperty("filter").Deserialize<ArticleFilter>(JsonSerializerOptions.Web)!;
                  try
                  {
                      var page = await Api.SearchArticlesAsync(filter);        // GET /api/v1/articles?…
                      await _table.InvokeVoidAsync("setPage", requestId, page.Items, page.TotalCount);
                  }
                  catch (Exception ex)
                  {
                      await _table.InvokeVoidAsync("failPage", requestId, ex.Message);
                  }
              }

              public async ValueTask DisposeAsync()
              {
                  if (_table is not null) { await _table.InvokeVoidAsync("dispose"); await _table.DisposeAsync(); }
                  if (_mud is not null) await _mud.DisposeAsync();
                  _self?.Dispose();
              }
          }`,
      },
    ],
    api: [
      { title: 'Options', rows: [
        ['columns', '<code>[{ key, field?, title?, type?, sortable?, filterable?, searchable?, align?, width?, format?, render?, options? }]</code>. <code>field</code> is the name sent to the server (its property name; matched ignoring case).'],
        ['type', '<code>string</code> (searched by the keyword), <code>number</code>, <code>date</code>, <code>boolean</code>, <code>enum</code> (with <code>options</code>). It decides the filter control, operators, alignment and formatting.'],
        ['format', 'A function, or a preset: <code>number</code>, <code>integer</code>, <code>percent</code>, <code>currency:EUR</code>, <code>date</code>, <code>datetime</code>, <code>boolean</code>. Values are inserted as text.'],
        ['render(value, row)', 'Custom cell: a <em>trusted</em> HTML string or a DOM node. Escape any user content yourself.'],
        ['data', 'Rows for client mode.'],
        ['server', '<code>{ url, headers?, credentials?, debounce? }</code> (GET with the PaginationFilter query string, reads PagedResponse), or <code>{ fetch(query, signal) }</code>. Older requests are aborted.'],
        ['rowKey, selection', 'Row id field (default <code>id</code>); <code>none</code>, <code>single</code> or <code>multiple</code> (selection survives paging).'],
        ['pageSize, pageSizes, initialQuery', 'Paging and the starting keyword / filters / order.'],
        ['caption, dense, striped, stackOnMobile', 'Accessible name and looks; on phones rows become labelled cards (default on).'],
        ['onRowClick, onSelectionChange, onQuery', 'Callbacks.'],
      ] },
      { title: 'Methods', rows: [
        ['setData(rows)', 'Replace the rows (client mode).'],
        ['setQuery(partial), getQuery(), reload()', 'Drive it from code.'],
        ['getSelection(), getSelectedRows(), clearSelection()', 'Selection.'],
        ['getElement(), dispose()', 'Mount and remove.'],
      ] },
      { title: 'Query helpers', rows: [
        ['applyQuery(rows, columns, query)', 'The client-side engine.'],
        ['toPaginationFilterParams(query)', 'URLSearchParams for <code>[AsParameters] PaginationFilter</code>.'],
        ['toPaginationFilter(query)', 'The same as a JSON object (POST body, Blazor HttpClient).'],
        ['fromPagedResponse(json)', 'Reads <code>PagedResponse&lt;T&gt;</code>.'],
      ] },
      { title: 'Filter operators', rows: [
        ['text', '<code>contains</code>, <code>eq</code>, <code>neq</code>, <code>startswith</code>, <code>endswith</code>, <code>isnull</code>, <code>notnull</code> (ignore case).'],
        ['number / date', '<code>eq</code>, <code>neq</code>, <code>gt</code>, <code>gte</code>, <code>lt</code>, <code>lte</code>, <code>isnull</code>, <code>notnull</code>. Plain dates are UTC midnight.'],
        ['boolean / enum', '<code>eq</code>; enums also <code>neq</code> and <code>in</code> (comma list).'],
      ] },
      { title: 'Blazor', rows: [
        ['create("datatable", host, options, dotNetRef)', 'Options as above (format as a preset name). <code>serverSide: true</code> raises <code>query</code> { requestId, query, filter }; answer with <code>setPage(requestId, items, totalCount)</code> or <code>failPage(requestId, message)</code>.'],
        ['Events', '<code>query</code>, <code>rowclick</code> (row, when <code>rowClick: true</code>), <code>selection</code> (keys).'],
        ['Handle methods', '<code>setData</code>, <code>setPage</code>, <code>failPage</code>, <code>reload</code>, <code>setQuery</code>, <code>getQuery</code>, <code>getSelection</code>, <code>clearSelection</code>, <code>dispose</code>.'],
      ] },
    ],
  }),
};
