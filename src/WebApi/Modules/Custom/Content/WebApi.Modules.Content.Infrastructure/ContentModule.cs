using Carter;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.WebApi.Contracts;
using soft.square.net.WebApi.Contracts.Security;
using soft.square.net.WebApi.Contracts.Tenancy;
using soft.square.net.WebApi.Data;
using soft.square.net.WebApi.Modules.Content.Application;
using soft.square.net.WebApi.Modules.Content.Domain;
using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.WebApi.Modules.Content.Infrastructure;

/// <summary>
/// Content module (starter): presses, categories and articles with the newsroom workflow of the auth design. Tenant
/// data (schema "content" in each tenant's database). Rights come from grants: standing ones (author, editor) from
/// admins, shift ones (accept, assign, transfer, return, review, publish) from the shifts module's rota, so they
/// hold only while the shift runs.
/// </summary>
public sealed class ContentModule : IRuntimeModule
{
    public ModuleManifest Manifest { get; } = new("content", "Content", "0.1.0", "content")
    {
        Description = "Newsroom content (starter): presses, categories, articles and their review and publishing workflow.",
        DefaultSettings = new Dictionary<string, string?> { ["Content:OwnerEditWindow"] = "1.00:00:00" },
        Permissions = ContentPermissions.All
    };

    public void ConfigureServices(IServiceCollection services, IConfiguration settings)
    {
        services.Configure<ContentOptions>(settings.GetSection("Content"));
        services.AddTenantDbContext<ContentDbContext>(); // IRepository<T> / IReadRepository<T> for Article, Press, Category
        services.AddScoped<ArticleService>();
        services.AddScoped<TaxonomyService>();
    }
}

public sealed class ContentDbContext(DbContextOptions<ContentDbContext> options, ITenantContext tenant) : TenantDbContext(options, tenant)
{
    protected override string Schema => "content";

    public DbSet<Press> Presses => Set<Press>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Article> Articles => Set<Article>();

    protected override void ConfigureModel(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Press>(press =>
        {
            press.ToTable("presses");
            press.Property(p => p.Id).HasMaxLength(64);
            press.Property(p => p.Name).HasMaxLength(200);
        });

        modelBuilder.Entity<Category>(category =>
        {
            category.ToTable("categories");
            category.Property(c => c.Id).HasMaxLength(64);
            category.Property(c => c.PressId).HasMaxLength(64);
            category.Property(c => c.Name).HasMaxLength(200);
            category.HasIndex(c => c.PressId);
        });

        modelBuilder.Entity<Article>(article =>
        {
            article.ToTable("articles");
            article.Property(a => a.PressId).HasMaxLength(64);
            article.Property(a => a.CategoryId).HasMaxLength(64);
            article.Property(a => a.Title).HasMaxLength(300);
            article.Property(a => a.OwnerId).HasMaxLength(128);
            article.Property(a => a.State).HasConversion<string>().HasMaxLength(32);
            article.Property(a => a.Version).IsConcurrencyToken();
            foreach (var user in new[] { nameof(Article.AcceptedBy), nameof(Article.AssigneeId), nameof(Article.ReviewerId), nameof(Article.ScheduledBy), nameof(Article.PublishedBy) })
                article.Property(user).HasMaxLength(128);
            article.Property(a => a.AssignedShiftId).HasMaxLength(64);
            article.Property(a => a.TransferredFromShift).HasMaxLength(64);
            article.Ignore(a => a.Scopes);
            article.HasIndex(a => new { a.State, a.CategoryId });
            article.HasIndex(a => a.OwnerId);
            article.HasIndex(a => a.AssigneeId);
            article.HasMany(a => a.History).WithOne().HasForeignKey("ArticleId").OnDelete(DeleteBehavior.Cascade);
            article.Navigation(a => a.History).UsePropertyAccessMode(PropertyAccessMode.Field);
        });

        modelBuilder.Entity<ArticleEvent>(e =>
        {
            e.ToTable("article_history");
            e.Property(x => x.Actor).HasMaxLength(128);
            e.Property(x => x.Action).HasMaxLength(64);
            e.Property(x => x.State).HasConversion<string>().HasMaxLength(32);
            e.Property(x => x.Detail).HasMaxLength(500);
        });
    }
}

/// <summary>Design time, one migration set per engine (Migrations/&lt;Provider&gt;): add migrations with src/WebApi/scripts/Add-Migration.ps1.</summary>
internal sealed class ContentDesignTimeFactory : IDesignTimeDbContextFactory<ContentDbContext>
{
    public ContentDbContext CreateDbContext(string[] args) =>
        new(TenantDbDesignTime.Options<ContentDbContext>(args), TenantDbDesignTime.Tenant);
}

public sealed record VersionRequest(int Version);

public sealed record ReturnRequest(int Version, string? Reason);

public sealed record TransferRequest(int Version, string? FromShift);

public sealed record ScheduleRequest(int Version, DateTimeOffset PublishAt);

public sealed class ContentEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var content = app.MapGroup("").AddEndpointFilter(async (context, next) =>
        {
            try { return await next(context); }
            catch (ContentNotFoundException e) { return Results.Problem(e.Message, statusCode: StatusCodes.Status404NotFound); }
            catch (ContentAccessDeniedException e) { return Results.Problem(e.Message, statusCode: StatusCodes.Status403Forbidden); }
            catch (ContentVersionConflictException e) { return Results.Problem(e.Message, statusCode: StatusCodes.Status409Conflict); }
            catch (DbUpdateConcurrencyException) { return Results.Problem("Someone else changed this article first; reload it and try again.", statusCode: StatusCodes.Status409Conflict); }
            catch (DomainException e) { return Results.Problem(e.Message, statusCode: StatusCodes.Status409Conflict); }
        });

        content.MapGet("/presses", (TaxonomyService taxonomy, CancellationToken ct) => taxonomy.PressesAsync(ct));
        content.MapPost("/presses", (PressDto press, TaxonomyService taxonomy, CancellationToken ct) => taxonomy.AddPressAsync(press, ct))
            .RequirePermission(ContentPermissions.Manage);
        content.MapGet("/categories", (string? pressId, TaxonomyService taxonomy, CancellationToken ct) => taxonomy.CategoriesAsync(pressId, ct));
        content.MapPost("/categories", (CategoryDto category, TaxonomyService taxonomy, CancellationToken ct) => taxonomy.AddCategoryAsync(category, ct))
            .RequirePermission(ContentPermissions.Manage);

        var articles = content.MapGroup("/articles");

        articles.MapGet("/", (ArticleView? view, ArticleService service, CancellationToken ct) => service.ListAsync(view ?? ArticleView.Mine, ct))
            .WithSummary("?view=Mine (default) | Queue (accept/assign, on shift) | Review (assigned to you) | Desk (approved and scheduled).");
        articles.MapGet("/{id:int}", (int id, ArticleService service, CancellationToken ct) => service.GetAsync(id, ct))
            .WithSummary("The article with its history; visible to its owner, its assignee and those with a shift or editor right on its category.");
        articles.MapPost("/", async (NewArticle request, ArticleService service, CancellationToken ct) =>
            {
                var article = await service.CreateAsync(request, ct);
                return Results.Created($"articles/{article.Id}", article);
            })
            .RequirePermission(ContentPermissions.Author)
            .WithSummary("A draft in a category where you hold content.author.");
        articles.MapPut("/{id:int}", (int id, ArticleEdit edit, ArticleService service, CancellationToken ct) => service.EditAsync(id, edit, ct))
            .WithSummary("Owner (draft, returned, or within the edit window after submitting), assigned reviewer on shift, or Desk (cancels a schedule).");

        articles.MapPost("/{id:int}/submit", (int id, VersionRequest r, ArticleService s, CancellationToken ct) => s.SubmitAsync(id, r.Version, ct));
        articles.MapPost("/{id:int}/accept", (int id, VersionRequest r, ArticleService s, CancellationToken ct) => s.AcceptAsync(id, r.Version, ct))
            .RequirePermission(ContentPermissions.Accept);
        articles.MapPost("/{id:int}/assign", (int id, Assignment r, ArticleService s, CancellationToken ct) => s.AssignAsync(id, r, ct))
            .RequirePermission(ContentPermissions.Assign)
            .WithSummary("The assignee must be an Editor on an active shift covering the article; a racing assignment gets 409.");
        articles.MapPost("/{id:int}/approve", (int id, VersionRequest r, ArticleService s, CancellationToken ct) => s.ApproveAsync(id, r.Version, ct))
            .RequirePermission(ContentPermissions.Review);
        articles.MapPost("/{id:int}/return", (int id, ReturnRequest r, ArticleService s, CancellationToken ct) => s.ReturnAsync(id, r.Version, r.Reason, ct))
            .RequirePermission(ContentPermissions.Return);
        articles.MapPost("/{id:int}/transfer", (int id, TransferRequest r, ArticleService s, CancellationToken ct) => s.TransferAsync(id, r.Version, r.FromShift, ct))
            .RequirePermission(ContentPermissions.Transfer);
        articles.MapPost("/{id:int}/schedule", (int id, ScheduleRequest r, ArticleService s, CancellationToken ct) => s.ScheduleAsync(id, r.Version, r.PublishAt, ct))
            .RequirePermission(ContentPermissions.Publish);
        articles.MapPost("/{id:int}/publish", (int id, VersionRequest r, ArticleService s, CancellationToken ct) => s.PublishAsync(id, r.Version, ct))
            .RequirePermission(ContentPermissions.Publish);
        articles.MapPost("/publish-due", (ArticleService s, CancellationToken ct) => s.PublishDueAsync(ct))
            .RequirePermission(ContentPermissions.Publish)
            .WithSummary("Publishes scheduled articles that are due and unchanged (for the workflow module; needs publish tenant-wide).");
    }
}
