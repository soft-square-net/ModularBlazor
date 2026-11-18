---
title: Create a module, A to Z
description: Build a runtime module from an empty folder, give it tenant data and migrations, pack it, add it to a pool, upload, activate, grant, configure, upgrade and remove it.
sidebar:
  order: 9
---

This page walks through one module from start to finish. The example is a small **Notes** module (`notes`): a
tenant-scoped `Note` aggregate, two endpoints, one permission and one setting. Every step names the real files and
commands of this repository. How the runtime works underneath: [Runtime modules](/backend/runtime-modules/).

```mermaid
flowchart LR
    A["1-2 · Decide<br/>and scaffold"] --> B["3-5 · Domain,<br/>Application,<br/>Infrastructure"]
    B --> C["6 · Migrations<br/>4 engines"]
    C --> D["7 · Build<br/>and pack .zip"]
    D --> E["8 · Choose a pool<br/>and route it"]
    E --> F["9-10 · Upload<br/>and activate"]
    F --> G["11-12 · Grant<br/>and configure"]
    G --> H["13-14 · Upgrade<br/>or remove"]
```

## 1. Decide what you are building

Answer these before you create a project. Each answer changes a later step.

| Question | Options | Default for a business module |
| --- | --- | --- |
| Core or custom? | **Core** ships with every WebApi release and is seeded as `Active`. **Custom** is built on its own and uploaded by an admin | Custom |
| One project or three? | **Single project** for glue (`greeting`, `identity`). **Layered** (`Domain`, `Application`, `Infrastructure`) for anything with business rules | Layered |
| Tenant data? | A `TenantDbContext` with its own schema in each tenant's database, or no database | Tenant data |
| Which pool? | An existing pool, or a new one when it needs its own scaling, isolation or restarts | An existing `Api` pool |
| Can it unload? | `HotUnload = true` (default), or `false` when a library pins its assemblies (Elsa) | `true` |
| Endpoints or pipeline? | Carter endpoints, or `IModulePipeline` for a library that brings its own middleware | Carter |

Pick a module **id** now. It must be lowercase `a-z`, `0-9`, `.`, `-`, and it never changes: it names the catalog
entry, the default route prefix (`/api/notes`), the database schema and the `Modules:Enabled` entries of pools.

## 2. Scaffold the projects

Layered custom modules live in `src/WebApi/Modules/Custom/<Name>/`. The build settings come from
`src/WebApi/Modules/Directory.Build.props`, which recognises each layer by its **project-name suffix**, so the names
matter.

```bash
cd src/WebApi/Modules/Custom
dotnet new classlib -n WebApi.Modules.Notes.Domain -o Notes/WebApi.Modules.Notes.Domain
dotnet new classlib -n WebApi.Modules.Notes.Application -o Notes/WebApi.Modules.Notes.Application
dotnet new classlib -n WebApi.Modules.Notes.Infrastructure -o Notes/WebApi.Modules.Notes.Infrastructure
```

Delete the generated `Class1.cs` files and reduce each project file to what the shared props don't already provide.
`TargetFramework`, `Nullable`, `ImplicitUsings` and the `soft.square.net.` assembly/namespace prefix come from the
repository's root `Directory.Build.props`.

```xml title="Notes/WebApi.Modules.Notes.Domain/WebApi.Modules.Notes.Domain.csproj"
<Project Sdk="Microsoft.NET.Sdk">
  <!-- References WebApi.SharedKernel (compile only) through Modules/Directory.Build.props. -->
</Project>
```

```xml title="Notes/WebApi.Modules.Notes.Application/WebApi.Modules.Notes.Application.csproj"
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="..\WebApi.Modules.Notes.Domain\WebApi.Modules.Notes.Domain.csproj" />
  </ItemGroup>
</Project>
```

```xml title="Notes/WebApi.Modules.Notes.Infrastructure/WebApi.Modules.Notes.Infrastructure.csproj"
<Project Sdk="Microsoft.NET.Sdk">
  <!-- The entry assembly. NOT referenced by WebApi: its build output is zipped and uploaded. -->
  <ItemGroup>
    <ProjectReference Include="..\WebApi.Modules.Notes.Application\WebApi.Modules.Notes.Application.csproj" />
  </ItemGroup>
</Project>
```

What the suffixes give you:

| Layer | Gets automatically | Never ships |
| --- | --- | --- |
| `.Domain` | `WebApi.SharedKernel` (`AggregateRoot<T>`, `ITenantOwned`, `DomainException`, `IRepository<T>`) | SharedKernel |
| `.Application` | The above plus `WebApi.Contracts` and `Microsoft.AspNetCore.App` | Contracts |
| `.Infrastructure` | `WebApi.Data` (EF Core, `TenantDbContext`), Carter, `EnableDynamicLoading` (writes the `.deps.json` the loader needs) | Data, EF Core, Carter, Ardalis |

Host-shipped assemblies are compiled against but excluded from the output, so the package holds only your three
assemblies and your private dependencies. **Do not** add your own `PackageReference` to EF Core, Carter or
Ardalis.Specification: the host's copies are used at runtime whatever version you compile against.

Add the projects to the solution so the IDE and `dotnet build` of the solution see them:

```bash
dotnet sln ModularBlazor.slnx add --solution-folder src/WebApi/Modules/Custom/Notes src/WebApi/Modules/Custom/Notes/*/*.csproj
```

Never add a `ProjectReference` from `WebApi` to a custom module. If the host referenced it, its types would load
into the default context and could never be unloaded or upgraded.

## 3. Domain: the aggregate and its rules

```csharp title="WebApi.Modules.Notes.Domain/Note.cs"
using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.WebApi.Modules.Notes.Domain;

/// <summary>A note of one tenant (aggregate root).</summary>
public sealed class Note : AggregateRoot<int>, ITenantOwned
{
    private Note() { } // EF Core

    public string TenantId { get; set; } = "";   // set by TenantDbContext; never from a request body
    public string Title { get; private set; } = "";
    public string Text { get; private set; } = "";
    public string AuthorId { get; private set; } = "";

    public static Note Create(string authorId, string title, string text, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(title)) throw new DomainException("A note needs a title.");
        if (text.Length > maxLength) throw new DomainException($"A note has at most {maxLength} characters.");
        return new Note { AuthorId = authorId, Title = title.Trim(), Text = text };
    }
}
```

Rules:

- Keep the domain free of EF Core, HTTP and configuration. Invariants throw `DomainException`.
- Implement `ITenantOwned` on every tenant entity. The tenant filter and the `TenantId` value come from the
  `TenantDbContext`.
- Use private setters and factory methods, so the only way to change state is through a rule.

## 4. Application: use cases, permissions, settings

```csharp title="WebApi.Modules.Notes.Application/Notes.cs"
using Ardalis.Specification;
using Microsoft.Extensions.Options;
using soft.square.net.WebApi.Contracts.Security;
using soft.square.net.WebApi.Modules.Notes.Domain;
using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.WebApi.Modules.Notes.Application;

public static class NotesPermissions
{
    public const string Write = "notes.write";

    public static IReadOnlyList<PermissionDefinition> All { get; } = [new(Write, "Create notes in this tenant.")];
}

public sealed class NotesOptions
{
    public int MaxLength { get; set; } = 2000;
}

public sealed record NoteDto(int Id, string Title, string Text, string AuthorId);
public sealed record NewNote(string Title, string Text);

public sealed class NoteListSpec : Specification<Note, NoteDto>
{
    public NoteListSpec()
    {
        Query.OrderByDescending(n => n.Id).AsNoTracking();
        Query.Select(n => new NoteDto(n.Id, n.Title, n.Text, n.AuthorId));
    }
}

public sealed class NoteService(IReadRepository<Note> reader, IRepository<Note> notes, IAccessScopes access, IOptions<NotesOptions> options)
{
    private string Me => access.UserId ?? throw new DomainException("Sign in first.");

    public Task<List<NoteDto>> ListAsync(CancellationToken ct) => reader.ListAsync(new NoteListSpec(), ct);

    public async Task<NoteDto> AddAsync(NewNote request, CancellationToken ct)
    {
        var note = Note.Create(Me, request.Title, request.Text, options.Value.MaxLength);
        await notes.AddAsync(note, ct);  // saves immediately
        return new NoteDto(note.Id, note.Title, note.Text, note.AuthorId);
    }
}
```

- Permissions are plain strings named `<module>.<action>`. Declare **every** one you use; activation fails on an
  undeclared permission.
- Resource-level checks (a press, a category) go through `IAccessScopes.HasPermissionAsync(permission, scopes)`,
  as the Content module does. Never put permissions or scopes in tokens.
- `IAccessScopes` (host-provided, scoped) gives the caller's `UserId` (the token's `sub`) and answers permission
  questions for the current tenant.
- No MediatR, no custom `IAuthorizationRequirement`, no named policies: the host would cache their types and the
  module could never unload. Why, and what to use instead: [Data access and use cases](#data-access-and-use-cases).

## 5. Infrastructure: the module, its database and its endpoints

The Infrastructure assembly is the **entry assembly**: it holds the one `IRuntimeModule`, the `DbContext`, the
migrations and every `ICarterModule` (the runtime maps Carter modules of this assembly only).

```csharp title="WebApi.Modules.Notes.Infrastructure/NotesModule.cs"
public sealed class NotesModule : IRuntimeModule
{
    public ModuleManifest Manifest { get; } = new("notes", "Notes", "1.0.0", "notes")
    {
        Description = "Tenant notes (sample).",
        DefaultSettings = new Dictionary<string, string?> { ["Notes:MaxLength"] = "2000" },
        Permissions = NotesPermissions.All
        // HotUnload = false only if a library you host pins its assemblies.
    };

    public void ConfigureServices(IServiceCollection services, IConfiguration settings)
    {
        services.Configure<NotesOptions>(settings.GetSection("Notes")); // settings = manifest defaults + admin overrides
        services.AddTenantDbContext<NotesDbContext>();                  // + IRepository<T>/IReadRepository<T>, + migrations on activation
        services.AddScoped<NoteService>();
    }
}

public sealed class NotesDbContext(DbContextOptions<NotesDbContext> options, ITenantContext tenant) : TenantDbContext(options, tenant)
{
    protected override string Schema => "notes";

    public DbSet<Note> Notes => Set<Note>();

    protected override void ConfigureModel(ModelBuilder modelBuilder) =>
        modelBuilder.Entity<Note>(note =>
        {
            note.ToTable("notes");
            note.Property(n => n.Title).HasMaxLength(200);
            note.Property(n => n.AuthorId).HasMaxLength(128);
            note.Property(n => n.Text).HasMaxLength(4000); // bounded: see the Oracle note in step 6
        });
}

/// <summary>Design time: dotnet-ef reads the engine from "-- --provider X".</summary>
internal sealed class NotesDesignTimeFactory : IDesignTimeDbContextFactory<NotesDbContext>
{
    public NotesDbContext CreateDbContext(string[] args) =>
        new(TenantDbDesignTime.Options<NotesDbContext>(args), TenantDbDesignTime.Tenant);
}

public sealed class NotesEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var notes = app.MapGroup("").AddEndpointFilter(async (context, next) =>
        {
            try { return await next(context); }
            catch (DomainException e) { return Results.Problem(e.Message, statusCode: StatusCodes.Status409Conflict); }
        });

        notes.MapGet("/", (NoteService s, CancellationToken ct) => s.ListAsync(ct));      // signed in (host fallback policy)
        notes.MapPost("/", async (NewNote request, NoteService s, CancellationToken ct) =>
            {
                var note = await s.AddAsync(request, ct);
                return Results.Created($"notes/{note.Id}", note);
            })
            .RequirePermission(NotesPermissions.Write);
    }
}
```

What the host does for every module endpoint, so you don't have to:

| Concern | Default | Change it with |
| --- | --- | --- |
| Route | `/api/{RoutePrefix}` + your route | The manifest's `RoutePrefix` |
| Authentication | Required (host fallback policy) | `.AllowAnonymous()` for a public route, e.g. Content's `/public/{publicId}` |
| Tenant | Required: from the `X-Tenant` header or the tenant's host name; missing → 400, unknown → 404, suspended → 403 | `.TenantOptional()` for platform routes |
| Permission | None beyond sign-in | `.RequirePermission("a")`, or several: `RequirePermission("a", "b")` |
| OpenAPI | Its own document `/openapi/modules/notes.json`, in Scalar while routed | `.WithSummary(...)` |

Optional extras:

- **Background work:** `services.AddHostedService<T>()`. It runs on every replica of every pool that enables the
  module and starts without a tenant. See [Hosted services](/backend/runtime-modules/#hosted-services).
- **A library with its own middleware:** implement `IModulePipeline`. See
  [Private pipelines](/backend/runtime-modules/#private-pipelines).
- **A private NuGet dependency:** a normal `PackageReference` in the layer that needs it. It is copied next to your
  assemblies and loads into the module's own load context.
- **Secrets:** module settings are stored in plain text in the catalog, so they are not a place for secrets. There
  is no general host-secret mechanism yet (only `elsa` has a hard-coded one); keep secrets out of your module or
  propose that mechanism first.

## 6. Migrations for all four engines

A tenant's database can run on PostgreSQL, SQL Server, MySQL or Oracle, so a module ships **one migration set per
engine** in `Migrations/<Provider>`. The script `src/WebApi/scripts/Add-Migration.ps1` runs `dotnet ef` once per
engine and keeps the four model snapshots apart:

```powershell
./src/WebApi/scripts/Add-Migration.ps1 -Project src/WebApi/Modules/Custom/Notes/WebApi.Modules.Notes.Infrastructure -Name InitialCreate
```

It sets `EfDesignAssets=all` while it runs, because dotnet-ef needs the host-shipped assemblies next to the project.
Check that the model and all four sets agree:

```powershell
$env:EfDesignAssets = 'all'
foreach ($p in 'PostgreSql','SqlServer','MySql','Oracle') {
  dotnet ef migrations has-pending-model-changes --project src/WebApi/Modules/Custom/Notes/WebApi.Modules.Notes.Infrastructure -- --provider $p
}
Remove-Item Env:EfDesignAssets
```

Then **rebuild without** `EfDesignAssets` before you pack (step 7), or the host's assemblies end up in your package.

Engine traps found while writing the Content migrations:

| Trap | Engine | Do this |
| --- | --- | --- |
| An unbounded `string` becomes `NVARCHAR2(2000)` | Oracle | Give every long text a `HasMaxLength`, or map it to `NCLOB` when `Database.ProviderName == "Oracle.EntityFrameworkCore"` |
| `''` is stored as `NULL` | Oracle | A `NOT NULL` column with default `''` cannot be added to a table that has rows: add it nullable, fill it, then make it required |
| A `TEXT`/`longtext` column cannot have a literal default | MySQL | Same pattern: nullable, `UPDATE`, then `AlterColumn` to `NOT NULL` |
| A new unique column on a table with rows | All | Backfill unique values in the migration (`migrationBuilder.Sql(...)`) before `CreateIndex` |

Edits to generated migrations are normal; keep a comment that says why. Migrations run **when the module is
activated**, for every active tenant, and again when a tenant is created. Nothing runs at install time.

## 7. Build and pack

A package is a `.zip` of the **contents** of the Infrastructure project's output folder.

```powershell
Remove-Item Env:EfDesignAssets -ErrorAction SilentlyContinue
$proj = 'src/WebApi/Modules/Custom/Notes/WebApi.Modules.Notes.Infrastructure'
dotnet build $proj -c Release
Compress-Archive -Path "$proj/bin/Release/net10.0/*" -DestinationPath notes-1.0.0.zip -Force
```

The same in bash:

```bash
proj=src/WebApi/Modules/Custom/Notes/WebApi.Modules.Notes.Infrastructure
dotnet build "$proj" -c Release
(cd "$proj/bin/Release/net10.0" && zip -r "$OLDPWD/notes-1.0.0.zip" .)
```

Check what is inside before you upload. A layered module should contain only:

```text
soft.square.net.WebApi.Modules.Notes.Domain.dll
soft.square.net.WebApi.Modules.Notes.Application.dll
soft.square.net.WebApi.Modules.Notes.Infrastructure.dll
soft.square.net.WebApi.Modules.Notes.Infrastructure.deps.json
soft.square.net.WebApi.Modules.Notes.Infrastructure.runtimeconfig.json
(*.pdb, and any private dependencies)
```

If you see `WebApi.Contracts`, `WebApi.Data`, `WebApi.SharedKernel`, `Microsoft.EntityFrameworkCore*`, `Carter` or
`Npgsql`, the build ran with `EfDesignAssets=all`: rebuild without it. Those copies would be ignored at runtime
anyway, but they bloat the package and hide reference mistakes.

| Form | When |
| --- | --- |
| `.zip` | Always for layered modules or modules with dependencies |
| `.dll` | A single-project module with no private dependencies |
| `.nupkg` | `lib/<highest netX.Y>/` is used; its package dependencies are **not** restored |

Bump `Version` in the manifest for every package you ship. A re-upload with the same id is an upgrade (step 13).

## 8. Choose a pool and route it

Every pool runs the same WebApi image. A pool applies a module only if its `Modules:Enabled` list contains the id
(or the list is empty). The gateway decides which pool receives `/api/notes/**`. Both must agree, or requests reach a
pool that never loads the module and get 404.

### Option A: an existing pool

In `src/Aspire/Hybird/AppHost.cs`, add the id to the pool and route the prefix there:

```csharp
var sales = AddPool("sales", role: "Api", replicas: 4, "sales", "greeting", "shifts", "content", "notes");
// in the YARP configuration, before the "/{**catch-all}" route:
yarp.AddRoute("/api/notes/{**catch-all}", salesCluster);
```

Modules that go to the core pool need no gateway route: the catch-all already sends everything else there.

### Option B: a pool of its own

Use it when the module needs its own scaling, a different role, or restarts that must not touch other modules
(always for `HotUnload = false`):

```csharp
var notesPool = AddPool("notes", role: "Api", replicas: 2, "notes");

// in the YARP configuration:
var notesCluster = Cluster(yarp, "notes", notesPool);
yarp.AddRoute("/api/notes/{**catch-all}", notesCluster);
PoolRoute("notes", notesCluster);   // lab only: /pools/notes/** for its admin API, /api/pool and Scalar

// after the configuration, with the other pools:
foreach (var replica in core.Concat(sales).Concat(worker).Concat(workflow).Concat(notesPool))
    gateway.WithReference(replica).WaitFor(replica);
```

`AddPool` already gives every replica the shared catalog folder, the broker, Redis, the tenant store, the tenant
database servers and the identity authority. Add `.WithReference(...)` / `.WithEnvironment(...)` only for what this
module alone needs.

A `Worker` pool loads the module (services, hosted services) without mapping routes. Give it no gateway route.

### Outside the lab

The same three settings per deployment, plus one gateway route:

```text
Modules__Pool=notes
Modules__Role=Api
Modules__Enabled__0=notes
Modules__Path=<the shared catalog all pools use>
```

## 9. Run the lab and get an admin token

```bash
dotnet run --project src/Aspire/Hybird --launch-profile http
```

The admin API needs the `platform.modules.manage` permission, which the `platform-admin` role has. In the lab:

1. Open `http://localhost:5080/scalar/`, choose **Authorize**, and sign in at the identity service with the
   development platform admin `admin@modular.local` (the accounts are listed in
   [Authentication: implementation](/backend/auth-implementation/#data-accounts-and-keys)).
2. Copy the access token Scalar received and keep it in a variable:

```powershell
$TOKEN = '<access token>'
```

For a single WebApi instance without the identity service, use a development token instead:

```bash
dotnet user-jwts create --project src/WebApi/WebApi --name admin --role platform-admin
```

## 10. Upload and activate

**Upload (install).** Any replica of any pool can take the call; the package goes into the shared catalog.

```bash
curl -H "Authorization: Bearer $TOKEN" -F "package=@notes-1.0.0.zip" http://localhost:5080/api/admin/modules
```

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:5080/api/admin/modules `
  -Headers @{ Authorization = "Bearer $TOKEN" } -Form @{ package = Get-Item ./notes-1.0.0.zip }
```

`201 Created` returns the catalog record (`desiredState: "Installed"`). The runtime read the manifest in a throw-away
load context; nothing is loaded yet and no migration has run.

**Activate.**

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:5080/api/admin/modules/notes/activate
```

On every replica of every pool that enables `notes`, the runtime loads the assemblies, builds the module's services,
migrates the `notes` schema into every active tenant database, starts hosted services and maps the routes. The
broadcast on `modules.state` tells the other replicas; each converges on its own.

**Check each pool.**

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:5080/pools/sales/api/admin/modules   # loaded, routes listed
curl -H "Authorization: Bearer $TOKEN" http://localhost:5080/pools/core/api/admin/modules    # enabledInPool: false
```

Each response describes only the replica that answered: `enabledInPool`, `loaded`, `routes`, `hostedServices`, and
`restartRequired` for a `HotUnload = false` module.

**Call it.**

```bash
curl -H "Authorization: Bearer $TOKEN" -H "X-Tenant: acme" http://localhost:5080/api/notes/
```

The first request for a tenant may wait (up to 30 s) while that tenant's migration finishes; a failed migration gives
503 and is retried on the next request.

## 11. Grant the permission

`notes.write` is now in the permission catalog (`GET /api/identity/permissions`). Give it to a user inside one tenant.
The caller needs `access.grants.manage` (platform admin, or that tenant's admin):

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "X-Tenant: acme" -H "Content-Type: application/json" \
  -d '{"userId":"<user sub>","permission":"notes.write","scope":"tenant"}' \
  http://localhost:5080/api/identity/grants
```

`scope` is `tenant` for the whole tenant, or a resource scope your module checks, such as `press:{id}` or
`category:{id}`. Optional `validFrom` / `validTo` make a time-boxed grant. Grants are evaluated on every request, so a
change applies without a new token.

## 12. Change settings

```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"Notes:MaxLength":"5000"}' http://localhost:5080/api/admin/modules/notes/settings
```

The body replaces the settings. Every replica that has the module loaded swaps to a copy built with the new values,
without a 404 window. A `HotUnload = false` module keeps its running copy and reports `restartRequired` instead.

## 13. Upgrade

1. Change the code, add migrations if the model changed (step 6), and **bump the manifest version** (`1.0.1`).
2. Pack again (step 7) and upload the new `.zip` with the same id.

The catalog keeps the module's state and the admin's settings (for keys the new version still has). Every replica
loads the new copy, replaces the routes in one update and only then releases the old copy. New migrations run during
that load. Keep migrations backward compatible (expand, then contract in a later release): during the swap the old
and new copies serve side by side for a moment.

For a `HotUnload = false` module, the upload stores the new version and every replica reports `restartRequired`.
Restart the pool's replicas one at a time.

## 14. Deactivate, unload, uninstall

| Call | Effect | Use it to |
| --- | --- | --- |
| `POST /api/admin/modules/notes/deactivate` | Routes return 404; the module stays loaded | Switch a feature off quickly; activate again is instant |
| `POST /api/admin/modules/notes/unload` | Also stops hosted services, disposes services, unloads assemblies | Free memory, keep the package |
| `DELETE /api/admin/modules/notes` | Unloads everywhere, deletes the package and the catalog entry | Remove the module |

`HotUnload = false` modules answer 409 to unload and uninstall unless you add `?deferred=true`; the routes go now
and the loaded copy at the next restart. Core modules cannot be uninstalled.

Uninstall **does not drop** the module's schema or data in the tenant databases. Remove the pool entry and gateway
route from step 8 as well, or the gateway keeps sending `/api/notes` to a pool that returns 404.

## Data access and use cases

Every module follows the same shape: a thin Carter endpoint calls one application-service method; the method checks
rights, loads an aggregate through a repository, calls a domain method and saves. Reads go through Ardalis
specifications. There is no mediator.

```mermaid
flowchart LR
    E["Carter endpoint<br/>route, RequirePermission,<br/>endpoint filters"] --> S["Application service method<br/>one use case"]
    S -->|reads| Spec["Ardalis specification<br/>IReadRepository&lt;T&gt;"]
    S -->|writes| Agg["Aggregate method<br/>rules, DomainException"]
    Agg --> Repo["IRepository&lt;T&gt;<br/>UpdateAsync saves"]
    Spec --> Db[("Tenant database<br/>module schema")]
    Repo --> Db
```

### Reads: Ardalis specifications

`Ardalis.Specification` is shipped by the host (with `IRepository<T>` and `IReadRepository<T>` in
`WebApi.SharedKernel`), so every module uses the same copy and the Application layer never references EF Core.

| Do | Don't |
| --- | --- |
| Write a specification for every read that has a name or is reused (`PostListSpec`, `DueScheduledSpec`, `StockItemBySkuSpec`) | Wrap a one-off lookup by id in its own class: `GetByIdAsync` is enough |
| Project lists to DTOs with `Query.Select(...)` and add `AsNoTracking()` | Load full aggregates to build a list response |
| Keep `IRepository<T>` for **aggregate roots only** | Add repositories for child entities or a generic repository over every table |
| Put reporting or awkward SQL in the Infrastructure layer, on the `DbContext` | Bend a specification into a query builder |
| Test specifications with the EF Core in-memory or SQLite provider | Assume a specification behaves the same on all four engines without running it |

```csharp
public sealed class NoteListSpec : Specification<Note, NoteDto>
{
    public NoteListSpec(string? authorId = null)
    {
        if (authorId is not null) Query.Where(n => n.AuthorId == authorId);
        Query.OrderByDescending(n => n.Id).AsNoTracking();
        Query.Select(n => new NoteDto(n.Id, n.Title, n.Text, n.AuthorId));
    }
}
```

`Ardalis.Specification` 9.3.1 targets EF Core 9 and runs on the host's EF Core 10 (verified in the lab, but not an
officially supported pairing). Upgrade it in the host when a release for EF Core 10 exists; modules never reference
it themselves.

### Writes: through the aggregate

1. Load the aggregate (`GetByIdAsync` or a single-result specification).
2. Check the caller's rights for **this** resource with `IAccessScopes.HasPermissionAsync(permission, aggregate.Scopes)`.
3. Call the aggregate's method; it enforces the rules and throws `DomainException`.
4. Save with `UpdateAsync` (repositories save immediately). Use a concurrency token (`Version`) on aggregates that
   people edit at the same time, and return 409 on `DbUpdateConcurrencyException`.

Never change state by updating columns from a service, a hosted service or another module.

### Reactions inside the module: domain events

When one change should cause another in the same module (keep a counter, open a follow-up task, write an audit or
outbox row), raise a domain event from the aggregate and handle it, rather than adding the reaction to every service
method that makes the change. The platform has its own small dispatcher for this; there is no MediatR
`INotification`.

| Piece | Where | What |
| --- | --- | --- |
| `IDomainEvent`, `IHasDomainEvents`, `IDomainEventHandler<TEvent>` | `WebApi.SharedKernel` | The contracts. `AggregateRoot<TId>` implements `IHasDomainEvents` and has `protected Raise(...)` |
| `DomainEventDispatcher` | `WebApi.Data` | Finds the handlers in the module's container. Registered by `AddTenantDbContext` |
| `TenantDbContext.SaveChangesAsync` | `WebApi.Data` | Runs the handlers, then stamps the tenant and writes |

```csharp
// Domain
public sealed record NoteArchived(int NoteId, string AuthorId) : IDomainEvent;

// in Note (with a new IsArchived property)
public void Archive()
{
    if (IsArchived) throw new DomainException("The note is already archived.");
    IsArchived = true;
    Raise(new NoteArchived(Id, AuthorId));
}

// Application
public sealed class CountArchivedNotes(NotesDbContext db) : IDomainEventHandler<NoteArchived>
{
    public async Task HandleAsync(NoteArchived e, CancellationToken cancellationToken)
    {
        var stats = await db.AuthorStats.FindAsync([e.AuthorId], cancellationToken);
        stats?.RecordArchived();   // a tracked change: the save that raised the event writes it
    }
}

// NotesModule.ConfigureServices
services.AddScoped<IDomainEventHandler<NoteArchived>, CountArchivedNotes>();
```

How a save runs:

```mermaid
sequenceDiagram
    participant S as Service
    participant C as TenantDbContext
    participant H as Handlers
    participant D as Tenant database
    S->>C: UpdateAsync / SaveChangesAsync
    loop until no aggregate has events (at most 8 rounds)
        C->>C: take the events of tracked aggregates
        C->>H: HandleAsync(event), in the same scope
        H->>C: change or add tracked entities (may raise more events)
    end
    C->>C: stamp the tenant
    C->>D: one write: the change and every handler's changes
```

Rules:

- **Handlers run before the write, in the same save.** Either everything is written or nothing is. This is the
  difference from the common "publish after `SaveChanges`" pattern, where a failing handler leaves the change saved
  and the request failed, and every handler that writes needs a second save.
- **Handlers never save.** They change tracked entities through the module's `DbContext`. Calling `SaveChangesAsync`
  from a handler throws, and so do `IRepository<T>` `AddAsync`, `UpdateAsync` and `DeleteAsync`, because Ardalis
  repositories save at once. Reading with `IReadRepository<T>` or the `DbContext` is fine.
- **Save asynchronously.** `SaveChanges()` (synchronous) throws while an aggregate has pending events.
- **Events stay inside the module.** A handler reaches only the module's own database. For mail, the broker or
  another module, have a handler write an outbox row in the same save, and publish the rows after the commit from a
  [module hosted service](/backend/runtime-modules/#hosted-services). The outbox is not built into the platform yet,
  and modules cannot consume broker messages yet.
- **It stays unloadable.** Neither the dispatcher nor the context caches anything in statics or uses `dynamic`;
  handler lookups are cached only by the module's container, which is disposed when the module unloads.

### Use cases: application services, not MediatR

Use cases are methods on application services registered in the module's container (`AddScoped<NoteService>()`).
**Do not add MediatR**:

- **It breaks unloading.** MediatR caches request handlers in static, process-wide dictionaries keyed by request type.
  If the host shipped it, those caches would hold every module's types forever, so modules could not unload or be
  upgraded in place. If each module shipped its own copy, you would have one mediator per module, which removes the
  point of having one.
- **It adds nothing here.** Each thing teams usually adopt it for is already covered:

| Reason teams use MediatR | What this architecture uses |
| --- | --- |
| Thin endpoints | Carter endpoints that call one service method |
| Cross-cutting behaviour (validation, logging, transactions, idempotency) | Endpoint filters on the module's route group, host middleware, OpenTelemetry |
| Authorization pipeline | `RequirePermission` on routes; `IAccessScopes` for resource-level checks |
| Notifications (`INotification`) inside a module | [Domain events](#reactions-inside-the-module-domain-events), handled in the same save |
| Decoupling between modules | Modules talk over HTTP or the broker, never in-process |
| One handler per use case | One service method per use case, or plain handler classes in the module's container |

- **Licence.** MediatR 13 and later needs a paid commercial licence above a certain company size.

When a service grows large (the Content module's `PostService` is near that point), split it by use-case group,
such as `PostAuthoringService`, `PostReviewService` and `PostDeskService`, or move to one small handler class per use
case registered in the module's container. Neither needs a mediator.

### Cross-cutting concerns: endpoint filters

Put shared behaviour on the module's route group once, instead of in every handler:

```csharp
var notes = app.MapGroup("")
    .AddEndpointFilter(async (context, next) =>
    {
        try { return await next(context); }
        catch (DomainException e) { return Results.Problem(e.Message, statusCode: StatusCodes.Status409Conflict); }
        catch (DbUpdateConcurrencyException) { return Results.Problem("Changed by someone else; reload and retry.", statusCode: StatusCodes.Status409Conflict); }
    });
```

Use the same mechanism for request validation (return 400 with a problem-details `errors` map, not 409), idempotency
keys on retried commands, and audit logging. Filters are module code, built in the module's container, so they
unload with it.

## Typed clients for the module

Every module gets its own client, generated from its own OpenAPI document. There is no shared client for all
modules: one would tie every module release to a host release. `Content` is the working example.

```mermaid
flowchart LR
    E["Carter endpoints<br/>.WithName(&quot;Content_ListPosts&quot;)"] -->|Export-ModuleOpenApi.ps1| D["Content/openapi/content.json<br/>committed: the API contract"]
    D -->|"NSwag, on build"| C["WebApi.Modules.Content.Client<br/>ContentClient : IContentClient"]
    D -->|openapi-typescript| T["Astro islands<br/>(TypeScript types)"]
    C --> B["Blazor client module<br/>ships the client dll"]
```

### 1. Name every endpoint

The endpoint name is the OpenAPI operation id, and NSwag turns `Content_ListPosts` into
`ContentClient.ListPostsAsync`. Without names, methods come out as `PostsGET2`.

```csharp
content.MapGet("/presses", (TaxonomyService taxonomy, CancellationToken ct) => taxonomy.PressesAsync(ct))
    .WithName("Content_ListPresses");
```

- Prefix with the module (`Content_`): names must be unique across the whole host.
- Routes mapped twice (Content's `/articles` and `/works` compatibility routes) are named once and the copies are left
  out of the document with `.ExcludeFromDescription()`.
- `Results.Created(...)` hides the response type: add `.Produces<PostDetail>(StatusCodes.Status201Created)`.
- Enums the API sends by name need `[JsonConverter(typeof(JsonStringEnumConverter<T>))]`, query-string enums too
  (`PostView`), or clients see a bare integer.

### 2. Export the document

```powershell
./src/WebApi/scripts/Export-ModuleOpenApi.ps1 -Project src/WebApi/Modules/Custom/Content/WebApi.Modules.Content.Infrastructure -ModuleId content
```

A module's document exists only while the module is routed, so the script builds the host and the module, starts a
throwaway host (Development, no tenants, no database, no lab), installs and activates the module with a
`dotnet user-jwts` admin token, saves `/openapi/modules/content.json` to `Content/openapi/content.json` and stops the
host. Commit the file: reviews then show every API change as a diff.

In CI, `-Check` exports to a temporary file and exits with 1 when it differs from the committed one.

The host shapes module documents for generators (`ModularOpenApi`):

| Raw ASP.NET Core 10 output | Written as | Why |
| --- | --- | --- |
| `"type": ["integer", "string"]` with a digits pattern (web JSON defaults accept quoted numbers) | `"type": "integer"` | Generators read the string alternative as "any type"; NSwag made every id `object` |
| `"enum": ["Article", …]` with no type | `"type": "string"` added | NSwag otherwise emits no string converter and the client cannot read `"News"` |
| A module service (`PostService`) listed as a second request body next to the real one | The service is dropped (`ModuleServiceParameterFilter`) | With two bodies, the document had no request body at all |

### 3. Generate the C# client

`Content/WebApi.Modules.Content.Client` is a plain class library: no reference to the WebApi, and no runtime
dependency beyond `HttpClient` and `System.Text.Json`, so a Blazor client module can reference it and ship it inside
its own package. NSwag (`NSwag.MSBuild`) runs on build when `content.json` or `nswag.json` changed, and writes
`Generated/ContentClient.g.cs`, which is committed.

The settings that matter in `nswag.json`:

| Setting | Value | Effect |
| --- | --- | --- |
| `className`, `operationGenerationMode` | `{controller}Client`, `MultipleClientsFromOperationId` | `Content_ListPosts` becomes `ContentClient.ListPostsAsync` |
| `injectHttpClient`, `useBaseUrl` | `true`, `false` | Relative URLs on the `HttpClient` you pass, which carries the gateway address, the token and `X-Tenant` |
| `anyType`, `excludedTypeNames` | `System.Text.Json.JsonElement`, `["JsonElement"]` | Post document `content` and `style` stay raw JSON instead of an empty class |
| `exceptionClass` | `ContentApiException` | Non-success responses throw it, with the status code and the problem-details body |

In a Blazor client module:

```csharp
@inject IHttpClientFactory HttpClients

private IContentClient Content => new ContentClient(HttpClients.CreateClient("ModularBlazor.API")); // ApiClientNames.Authenticated

var desk = await Content.ListPostsAsync(PostView.Desk);
try { await Content.PublishPostAsync(post.Id, new VersionRequest { Version = post.Version }); }
catch (ContentApiException e) when (e.StatusCode == 409) { /* someone else changed it: reload */ }
```

### 4. Add the next module

Copy `WebApi.Modules.Content.Client` next to the module's other projects, rename it, set the namespace, the exception
class and the document path in `nswag.json` and the `.csproj`, export the document, and build.

A **single-project** module (like Greeting or Pulse) has no folder of its own around the project, so the client goes
next to it as `WebApi.Modules.<Name>.Client` (never inside the module's folder, where the module would compile it).
Pass `-Output` to the export so the document lands in the module's folder:

```powershell
./src/WebApi/scripts/Export-ModuleOpenApi.ps1 -Project src/WebApi/Modules/Custom/WebApi.Modules.Greeting `
  -ModuleId greeting -Output src/WebApi/Modules/Custom/WebApi.Modules.Greeting/openapi/greeting.json
```

Every custom module has a client today:

| Module | Document | Client project | Clients |
| --- | --- | --- | --- |
| Content | `Content/openapi/content.json` | `Content/WebApi.Modules.Content.Client` | `ContentClient` (21 operations) |
| Shifts | `Shifts/openapi/shifts.json` | `Shifts/WebApi.Modules.Shifts.Client` | `ShiftsClient` (15) |
| Inventory | `Inventory/openapi/inventory.json` | `Inventory/WebApi.Modules.Inventory.Client` | `InventoryClient` (4) |
| Greeting | `WebApi.Modules.Greeting/openapi/greeting.json` | `WebApi.Modules.Greeting.Client` | `GreetingClient` (3) |
| Pulse | `WebApi.Modules.Pulse/openapi/pulse.json` | `WebApi.Modules.Pulse.Client` | `PulseClient` (1: `/status`) |

Core modules work the same way, with two differences. They are active as soon as the host starts, so the export
installs nothing: `Export-ModuleOpenApi.ps1 -CoreModuleId tenancy` writes
`Modules/Core/WebApi.Modules.Core.Tenancy/openapi/tenancy.json`. And their clients live in `Modules/Core.Clients/`,
because the WebApi build ships every `Modules/Core/*/*.csproj` as a core module. Today that is
`WebApi.Modules.Core.Tenancy.Client` (`TenancyClient`, 13 operations: tenants, activate and suspend, provisioning,
subscriptions and the subscription report).

Routes served by a module's private pipeline (`IModulePipeline`, like Pulse's `/ping`, `/whoami`, `/beats` and `/echo`)
sit behind one catch-all endpoint that the host leaves out of OpenAPI, so they get no client methods. Expose a route as a
Carter endpoint when a client needs it.

### The host's own client: module management

The host's built-in endpoints (the module admin API, `/api/pool`, `/health`) have their own document and client, built
the same way. The project is `src/WebApi/WebApi.Client`, and the document is `src/WebApi/openapi/webapi.json`. Export it
with `-HostDocument` (no module is installed):

```powershell
./src/WebApi/scripts/Export-ModuleOpenApi.ps1 -HostDocument          # add -Check in CI
```

| Client | Methods |
| --- | --- |
| `ModulesClient` | `ListAsync`, `ListUnloadingAsync`, `InstallAsync(FileParameter)`, `ActivateAsync`, `DeactivateAsync`, `UnloadAsync(id, deferred)`, `UpdateSettingsAsync`, `UninstallAsync(id, deferred)` |
| `PoolClient` | `GetAsync` (`PoolInfo`: pool, role, enabled modules, instance) |
| `HealthClient` | `GetAsync` (throws `WebApiException` with status 503 when the replica is unhealthy) |

```csharp
var modules = new ModulesClient(http);   // http: the "ModularBlazor.API" client, signed in as a platform admin
await using var zip = File.OpenRead("greeting.zip");
var record = await modules.InstallAsync(new FileParameter(zip, "greeting.zip", "application/zip"));
var status = await modules.ActivateAsync(record.Id!);   // status.Routes: the live routes on the replica that answered
```

Lifecycle errors (unknown module, prefix in use, `HotUnload = false` without `deferred`) arrive as `WebApiException`
with the status code and the problem-details body. Uploads are described inline as `"format": "binary"` (the host's
OpenAPI setup does this for every `IFormFile`), which is what makes NSwag generate `FileParameter`.

### Why NSwag

| Option | Runtime dependencies in a client module | Verdict |
| --- | --- | --- |
| **NSwag** | None beyond the BCL | Chosen: client modules are DLLs loaded into WebAssembly at runtime, and every library they need must ship inside each module or be shared by the host at one version |
| Refit (with Refitter) | `Refit`, which the host would have to share | Neat interfaces; adds a shared dependency |
| Kiota | Several `Microsoft.Kiota.*` packages | The heaviest; worth it for many languages from one tool |
| A shared DTO project | A server project referenced by the client | No OpenAPI contract, so nothing for TypeScript clients |

For TypeScript (Astro islands), generate types from the same document with `openapi-typescript` and call the API
with `openapi-fetch`.

The old `src/ModularBlazor.Abstractions/Api/ApiClient.cs` was generated from the previous API
(`http://localhost:5100/openapi/v1.json`) and does not cover the runtime modules. The hand-written `IModuleAdminApi`
behind the Blazor "Module Management" page also calls the previous API (`/api/v1/modules/...`); the runtime lifecycle
is in `WebApi.Client`'s `ModulesClient`.

## Making it a core module instead

A core module ships inside every WebApi release:

1. Put a **single project** in `src/WebApi/Modules/Core/<Project>/` (the WebApi build picks up
   `Modules/Core/*/*.csproj`). `Core/Directory.Build.props` sets `EnableDynamicLoading`, references Contracts and Carter
   without shipping them, and marks it as core.
2. Build WebApi. The module's output is copied to `CoreModules/<AssemblyName>/` in the build and publish output.
3. On startup each replica seeds it into the catalog as `Active`, upgrades it when the shipped version is newer, and
   never downgrades it.

Core modules can be deactivated, unloaded and configured, but not uninstalled or replaced by an upload (409).

## Checklist

- [ ] Id and route prefix chosen; lowercase; unique among installed modules.
- [ ] Project names end in `.Domain`, `.Application`, `.Infrastructure`; no reference from `WebApi` to the module.
- [ ] Exactly one public `IRuntimeModule` with a parameterless constructor, in the Infrastructure project.
- [ ] Every `RequirePermission` name is declared in `Manifest.Permissions`.
- [ ] Every tenant entity implements `ITenantOwned`; the `DbContext` derives from `TenantDbContext` with its own `Schema`.
- [ ] Migrations exist for PostgreSQL, SQL Server, MySQL and Oracle; `has-pending-model-changes` says "No changes" for all four.
- [ ] Built in Release **without** `EfDesignAssets`; the `.zip` holds only module assemblies and private dependencies.
- [ ] The id is in the right pool's `Modules:Enabled`, and the gateway routes `/api/<prefix>/**` to that pool.
- [ ] No secrets in `DefaultSettings`.
- [ ] Every endpoint has a `<Module>_<Action>` name; `openapi/<id>.json` re-exported and the client rebuilt.
- [ ] Version bumped for every release.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| 400 on upload: no `IRuntimeModule` | Zipped the folder instead of its contents, or uploaded the Domain/Application dll | Zip the contents of the Infrastructure `bin/Release/net10.0` |
| 400 on activate: undeclared permission | `RequirePermission("x")` without `x` in the manifest | Add it to `Permissions` |
| 400 on activate: authorization requirement or named policy | The module defines an `IAuthorizationRequirement` or uses `RequireAuthorization("policy")` | Use `RequirePermission` and `IAccessScopes` |
| 409 on activate: route prefix in use | Another module has the same `RoutePrefix` | Choose another prefix |
| 404 on `/api/notes` through the gateway | The gateway sends the prefix to a pool that does not enable the module, or the module is not `Active` | Align `Modules:Enabled` and the YARP route; check `/pools/<pool>/api/admin/modules` |
| 400 "tenant required" | No `X-Tenant` header or tenant host name | Send the tenant, or mark platform routes `.TenantOptional()` |
| 503 on the first request | The tenant's migration failed or is still running | Read the replica's log in the Aspire dashboard; fix the migration and retry |
| 500 "A domain event handler must not save" | A handler called `SaveChangesAsync` or an `IRepository<T>` write method | Change tracked entities and return; the outer save writes them |
| 500 "save with SaveChangesAsync" | Synchronous `SaveChanges()` while an aggregate has pending events | Save asynchronously |
| 500 "still being raised after 8 rounds" | Handlers keep raising events for each other | Break the cycle; an event should describe something that happened once |
| `TypeLoadException` / `MissingMethodException` | Compiled against a different version of a host-shipped assembly | Build against the repository's projects and package versions; don't add your own EF Core or Carter |
| Works on PostgreSQL, fails on Oracle or MySQL | Engine trap from step 6 | Fix the mapping or the migration for that engine |
| Memory still used after unload | Something pins the module (static cache, host singleton, timer) | Check `/api/admin/modules/unloading`; see [Unloading runtime modules](/backend/runtime-module-unloading/) |
| 409 on unload or uninstall | `HotUnload = false` | Add `?deferred=true` and restart the pool |
