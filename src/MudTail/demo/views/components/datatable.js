// Components ▸ Data table: client-side and server-side (PaginationFilter + Ardalis specifications).
import { MudDataTable, MudEditForm, applyQuery, toPaginationFilterParams, showToast, t, getLocale, getIconSvg } from 'mudtail';
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

// ───────── editing ─────────

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const editableRows = () => structuredClone(articles().slice(0, 40));

/** The edit form: the columns' types, plus the rules an Article has on the server (like DataAnnotations). */
const articleFields = () => [
  { key: 'title', label: t('demo.dt.title', {}, 'Title'), required: true, minLength: 5, maxLength: 120, span: 2,
    helper: t('demo.dt.titleHelp', {}, 'Try “test” to see a server-side validation error.') },
  { key: 'section', label: t('demo.dt.section', {}, 'Section'), type: 'select', required: true, options: SECTIONS.map((v) => ({ value: v, label: t(v) })) },
  { key: 'author', label: t('demo.dt.author', {}, 'Author') },
  { key: 'views', label: t('demo.dt.views', {}, 'Views'), type: 'number', min: 0, step: 1 },
  { key: 'rating', label: t('demo.dt.rating', {}, 'Rating'), type: 'number', min: 1, max: 5, step: 0.1 },
  { key: 'publishedOnUtc', label: t('demo.dt.published', {}, 'Published'), type: 'date', required: true },
  { key: 'featured', label: t('demo.dt.featured', {}, 'Featured'), type: 'switch' },
];

/** A pretend save: half a second, and a "duplicate headline" error the way a 400 ValidationProblemDetails reports it. */
async function pretendSave(model) {
  await wait(500);
  if (/\btest\b/i.test(model.title ?? '')) return { errors: { title: t('demo.dt.duplicate', {}, 'An article with this headline already exists.') } };
  return { ...model, publishedOnUtc: model.publishedOnUtc ? new Date(model.publishedOnUtc).toISOString() : null };
}

const announce = ({ type, row }) => showToast(
  type === 'create' ? t('demo.dt.created', { title: row.title }, 'Created “{title}”')
    : type === 'update' ? t('demo.dt.updated', { title: row.title }, 'Saved “{title}”')
      : t('demo.dt.deleted', { title: row.title }, 'Deleted “{title}”'),
  type === 'delete' ? 'warning' : 'success');

const extraActions = () => [
  { id: 'feature', label: t('demo.dt.feature', {}, 'Feature'), icon: 'star', color: 'warning', show: (row) => !row.featured,
    onClick: (row, table) => { table.updateRow({ ...row, featured: true }); showToast(t('demo.dt.featuredToast', { title: row.title }, '“{title}” is now featured'), 'success'); } },
  { id: 'share', label: t('demo.dt.share', {}, 'Send to newsletter'), icon: 'send', color: 'info' },
  { id: 'archive', label: t('demo.dt.archive', {}, 'Archive'), icon: 'archive', color: 'secondary', disabled: (row) => row.featured },
];

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
        title: 'Create, edit and delete', description: 'A <strong>New</strong> button and an actions column: <strong>Edit</strong> and <strong>New</strong> open an EditForm in a dialog (validated as you type; saving takes half a second here), <strong>Delete</strong> asks first. The extra actions are your own: <em>Feature</em> shows only on rows that are not featured, <em>Archive</em> is disabled on featured rows. Switch how the actions are shown:',
        code: `
          import { MudDataTable } from 'mudtail';

          const table = new MudDataTable({
            columns, data: articles,
            create: true,                                 // the "New" button
            actions: [
              'edit', 'delete',
              { id: 'feature', label: 'Feature', icon: 'star', color: 'warning', show: (row) => !row.featured,
                onClick: (row, table) => table.updateRow({ ...row, featured: true }) },
              { id: 'share', label: 'Send to newsletter', icon: 'send', color: 'info' },   // → onAction
              { id: 'archive', label: 'Archive', icon: 'archive', disabled: (row) => row.featured },
            ],
            actionsDisplay: 'icons',                      // 'icons' | 'buttons' | 'menu'
            editor: { fields: [                           // MudEditForm fields (default: from the columns)
              { key: 'title', label: 'Title', required: true, minLength: 5, maxLength: 120, span: 2 },
              { key: 'section', label: 'Section', type: 'select', required: true, options: ['News', 'Sport', 'Culture'] },
              { key: 'views', label: 'Views', type: 'number', min: 0 },
              { key: 'publishedOnUtc', label: 'Published', type: 'date', required: true },
              { key: 'featured', label: 'Featured', type: 'switch' },
            ] },
            onCreate: (model) => api.create(model),       // return the saved row, or { errors: { title: '…' } }
            onUpdate: (model, row) => api.update(row.id, model),
            onDelete: (row) => api.remove(row.id),
            onAction: (id, row) => …,
            onRowsChange: ({ type, row }) => …,           // 'create' | 'update' | 'delete'
          });
          // Without the on… hooks, client mode edits its own rows, and server: { url } calls POST / PUT / DELETE.`,
        mount(el) {
          let table = null;
          const host = document.createElement('div');
          const build = (display) => {
            table?.dispose();
            const rows = table ? table.rows : editableRows();
            table = new MudDataTable({
              caption: t('demo.dt.caption', {}, 'Articles'), columns: columns(), data: rows, pageSize: 5, pageSizes: [5, 10, 25],
              create: true,
              actions: ['edit', 'delete', ...extraActions()],
              actionsDisplay: display,
              editor: { fields: articleFields() },
              onCreate: pretendSave,
              onUpdate: pretendSave,
              onDelete: () => wait(300),
              onAction: (id, row) => showToast(t('demo.dt.sent', { title: row.title }, '“{title}” goes out in tomorrow’s newsletter'), 'info'),
              onRowsChange: announce,
            });
            host.replaceChildren(table.getElement());
          };
          const modes = document.createElement('div');
          modes.className = 'cp-segmented';
          modes.setAttribute('role', 'group');
          modes.setAttribute('aria-label', 'Show actions as');
          [['icons', 'Icon buttons'], ['buttons', 'Text buttons'], ['menu', 'Menu']].forEach(([value, label], i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.setAttribute('aria-pressed', String(i === 0));
            b.addEventListener('click', () => {
              modes.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
              build(value);
            });
            modes.appendChild(b);
          });
          el.append(modes, host);
          build('icons');
          return () => table?.dispose();
        },
      },
      {
        title: 'A custom column with edit and delete icon buttons', description: 'No actions column here: the first column renders its own icon buttons. Any element with <code>data-dt-action="edit"</code>, <code>"delete"</code> or your own id runs that action on its row, so the buttons need no event wiring (and Blazor markup can use the same attribute).',
        code: `
          const table = new MudDataTable({
            columns: [
              { key: 'manage', title: 'Manage', sortable: false, filterable: false, searchable: false, editable: false, width: '9rem',
                render: (_, row) => \`
                  <div class="cp-icon-actions">
                    <button type="button" class="mud-button-root mud-button-text mud-button-primary mud-button-icon"
                            data-dt-action="edit" title="Edit" aria-label="Edit \${esc(row.title)}">\${getIconSvg('edit', 16)}</button>
                    <button type="button" class="mud-button-root mud-button-text mud-button-error mud-button-icon"
                            data-dt-action="delete" title="Delete" aria-label="Delete \${esc(row.title)}">\${getIconSvg('delete', 16)}</button>
                    <button type="button" class="mud-button-root mud-button-text mud-button-surface mud-button-icon"
                            data-dt-action="preview" title="Preview" aria-label="Preview \${esc(row.title)}">\${getIconSvg('eye', 16)}</button>
                  </div>\` },
              ...columns,
            ],
            data: articles,
            create: { label: 'Write an article' },
            onAction: (id, row) => id === 'preview' && openPreview(row),
          });`,
        mount(el) {
          const iconButton = (action, icon, color, label, row) => `<button type="button" class="mud-button-root mud-button-text mud-button-${color} mud-button-icon" data-dt-action="${action}" title="${esc(label)}" aria-label="${esc(`${label}: ${row.title}`)}">${getIconSvg(icon, 16)}</button>`;
          const manage = {
            key: 'manage', title: t('demo.dt.manage', {}, 'Manage'), sortable: false, filterable: false, searchable: false, editable: false, width: '9rem',
            render: (_, row) => `<div class="cp-icon-actions">${iconButton('edit', 'edit', 'primary', t('datatable.edit', {}, 'Edit'), row)}${iconButton('delete', 'delete', 'error', t('datatable.delete', {}, 'Delete'), row)}${iconButton('preview', 'eye', 'surface', t('demo.dt.preview', {}, 'Preview'), row)}</div>`,
          };
          const table = new MudDataTable({
            caption: t('demo.dt.caption', {}, 'Articles'), columns: [manage, ...columns().filter((c) => c.key !== 'id')], data: editableRows(), pageSize: 5, pageSizes: [5, 10, 25],
            create: { label: t('demo.dt.write', {}, 'Write an article'), icon: 'edit' },
            editor: { fields: articleFields(), title: { create: t('demo.dt.newArticle', {}, 'New article'), edit: t('demo.dt.editArticle', {}, 'Edit article') } },
            onCreate: pretendSave,
            onUpdate: pretendSave,
            confirmDelete: (row) => t('demo.dt.confirmDelete', { title: row.title }, 'Delete “{title}”? This cannot be undone.'),
            onAction: (id, row) => { if (id === 'preview') showToast(t('demo.dt.previewing', { title: row.title }, 'Previewing “{title}”'), 'info'); },
            onRowsChange: announce,
          });
          el.appendChild(table.getElement());
          return () => table.dispose();
        },
      },
      {
        title: 'EditForm on its own', description: '<code>MudEditForm</code> is also a component by itself: fields, a model, rules, and an async submit that can return field errors from the server. <code>openEditDialog()</code> puts one in a dialog.',
        code: `
          import { MudEditForm, openEditDialog } from 'mudtail';

          const form = new MudEditForm({
            fields: [
              { key: 'name', label: 'Full name', required: true, autocomplete: 'name' },
              { key: 'email', label: 'Email', type: 'email', required: true },
              { key: 'team', label: 'Team', type: 'radio', options: ['Northbridge', 'Harbour City'] },
              { key: 'message', label: 'Message', type: 'textarea', maxLength: 500 },
              { key: 'terms', label: 'I accept the house rules', type: 'checkbox', required: true, span: 2 },
            ],
            model: { team: 'Northbridge' },
            onSubmit: async (model) => api.send(model),   // or return { errors: { email: 'Already registered' } }
            onCancel: () => form.reset(),
          });
          host.appendChild(form.getElement());

          const saved = await openEditDialog({ title: 'Edit profile', fields, model: user, onSubmit: save });   // null if cancelled`,
        mount(el) {
          const form = new MudEditForm({
            fields: [
              { key: 'name', label: t('demo.form.name', {}, 'Full name'), required: true, autocomplete: 'name' },
              { key: 'email', label: t('demo.form.email', {}, 'Email'), type: 'email', required: true, autocomplete: 'email' },
              { key: 'team', label: t('demo.form.team', {}, 'Team'), type: 'radio', options: [{ value: 'Northbridge', label: t('Northbridge') }, { value: 'Harbour City', label: t('Harbour City') }] },
              { key: 'age', label: t('demo.form.age', {}, 'Age'), type: 'number', min: 13, max: 120 },
              { key: 'message', label: t('demo.form.message', {}, 'Message'), type: 'textarea', maxLength: 500 },
              { key: 'terms', label: t('demo.form.terms', {}, 'I accept the house rules'), type: 'checkbox', required: true, span: 2 },
            ],
            model: { team: 'Northbridge' },
            submitText: t('demo.form.send', {}, 'Send'),
            onSubmit: async (model) => { await wait(600); showToast(t('demo.form.sent', { name: model.name }, 'Thanks, {name}!'), 'success'); form.setModel({ team: 'Northbridge' }); },
            onCancel: () => form.reset(),
          });
          form.getElement().style.maxInlineSize = '640px';
          el.appendChild(form.getElement());
          return () => form.dispose();
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
      {
        title: 'Blazor: create, edit and delete', language: 'Razor / C#',
        description: 'The dialog and its EditForm run in the browser; saving goes to .NET. The table raises <code>create</code>, <code>update</code> or <code>delete</code> with a <code>requestId</code>; answer with <code>completeEdit(requestId, savedRow)</code>, or <code>failEdit(requestId, message, errors)</code> to keep the form open with the server\'s messages (a ValidationProblemDetails <code>Errors</code> dictionary fits as it is). Custom actions raise <code>action</code>.',
        code: `
          _table = await _mud.InvokeAsync<IJSObjectReference>("create", "datatable", _host, new
          {
              caption = "Articles",
              data = articles,
              create = true,
              actions = new object[] { "edit", "delete", new { id = "feature", label = "Feature", icon = "star", color = "warning" } },
              actionsDisplay = "menu",
              editor = new
              {
                  fields = new object[]
                  {
                      new { key = "title", label = "Title", required = true, maxLength = 120, span = 2 },
                      new { key = "section", label = "Section", type = "select", required = true, options = new[] { "News", "Sport" } },
                      new { key = "publishedOnUtc", label = "Published", type = "date", required = true },
                  },
              },
          }, _self);

          [JSInvokable]
          public async Task OnMudEvent(string name, JsonElement payload)
          {
              var requestId = payload.TryGetProperty("requestId", out var r) ? r.GetInt32() : 0;
              switch (name)
              {
                  case "create" or "update":
                      var model = payload.GetProperty("model").Deserialize<ArticleDto>(JsonSerializerOptions.Web)!;
                      var result = name == "create" ? await Api.CreateAsync(model) : await Api.UpdateAsync(payload.GetProperty("key").GetString()!, model);
                      if (result.IsSuccess) await _table!.InvokeVoidAsync("completeEdit", requestId, result.Value);
                      else await _table!.InvokeVoidAsync("failEdit", requestId, result.Title, result.Errors);   // { "Title": ["Already used"] }
                      break;
                  case "delete":
                      await Api.DeleteAsync(payload.GetProperty("key").GetString()!);
                      await _table!.InvokeVoidAsync("completeEdit", requestId);
                      break;
                  case "action" when payload.GetProperty("action").GetString() == "feature":
                      await Api.FeatureAsync(payload.GetProperty("key").GetString()!);
                      break;
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
        ['create', '<code>true</code> or <code>{ label, icon }</code>: a New button that opens the edit form.'],
        ['actions, actionsDisplay', 'An actions column: <code>\'edit\'</code>, <code>\'delete\'</code> and <code>{ id, label, icon?, color?, show?(row), disabled?(row), onClick?(row, table) }</code>, shown as <code>icons</code>, <code>buttons</code> or a <code>menu</code>.'],
        ['editor', '<code>{ fields?, title?: { create, edit }, columns?, maxWidth? }</code>: MudEditForm fields; by default one per editable column (<code>editable: false</code> leaves a column out; <code>required</code> and <code>editor</code> on a column refine its field).'],
        ['onCreate, onUpdate, onDelete', 'Save (async). Return the saved row, or <code>{ errors }</code> (or throw) to keep the form open. Without them, client mode edits its own rows and <code>server.url</code> calls POST / PUT / DELETE.'],
        ['confirmDelete, onAction, onRowsChange', 'A confirmation (or a function giving its text), custom actions without their own <code>onClick</code>, and a callback after every change.'],
      ] },
      { title: 'Methods', rows: [
        ['setData(rows)', 'Replace the rows (client mode).'],
        ['setQuery(partial), getQuery(), reload()', 'Drive it from code.'],
        ['getSelection(), getSelectedRows(), clearSelection()', 'Selection.'],
        ['openCreate(defaults), openEdit(row | key), deleteRow(row | key)', 'The edit form and delete, from code; <code>runAction(id, row | key)</code> runs any action.'],
        ['addRow, updateRow, removeRow', 'Change rows in client mode without a form.'],
        ['getElement(), dispose()', 'Mount and remove.'],
      ] },
      { title: 'MudEditForm', rows: [
        ['fields', '<code>[{ key, label, type?, required?, min?, max?, step?, minLength?, maxLength?, pattern?, options?, placeholder?, helper?, span?, validate?(value, model) }]</code>. Types: text, textarea, number, email, url, tel, password, date, datetime-local, time, color, select, radio, checkbox, switch, hidden.'],
        ['model, onSubmit, onCancel, onChange', '<code>onSubmit(model)</code> may be async; return <code>{ errors }</code> or throw to show server errors.'],
        ['Methods', '<code>getModel</code>, <code>setModel</code>, <code>validate</code>, <code>setErrors(errors, message)</code>, <code>clearErrors</code>, <code>reset</code>, <code>submit</code>, <code>isDirty</code>, <code>focus</code>, <code>dispose</code>.'],
        ['openEditDialog(options), confirmDialog(options)', 'The form in a dialog (resolves with the saved model, or null), and a yes / no question (resolves true or false).'],
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
        ['Events', '<code>query</code>, <code>rowclick</code> (row, when <code>rowClick: true</code>), <code>selection</code> (keys), <code>create</code> / <code>update</code> / <code>delete</code> ({ requestId, model | key }), <code>action</code> ({ action, key, row }), <code>changed</code>.'],
        ['Handle methods', '<code>setData</code>, <code>setPage</code>, <code>failPage</code>, <code>reload</code>, <code>setQuery</code>, <code>getQuery</code>, <code>getSelection</code>, <code>clearSelection</code>, <code>openCreate</code>, <code>openEdit</code>, <code>deleteRow</code>, <code>completeEdit</code>, <code>failEdit</code>, <code>addRow</code>, <code>updateRow</code>, <code>removeRow</code>, <code>dispose</code>.'],
        ['crud', '<code>dotnet</code> (default: saving goes to .NET as above), <code>rest</code> (POST / PUT / DELETE on <code>server.url</code>) or <code>client</code> (rows in the browser only).'],
      ] },
    ],
  }),
};
