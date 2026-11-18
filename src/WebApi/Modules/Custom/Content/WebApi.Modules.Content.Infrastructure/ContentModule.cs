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
/// Contents module (starter): presses, categories and Posts with the newsroom workflow of the auth design. Tenant
/// data (schema "content" in each tenant's database). Rights come from grants: standing ones (author, editor) from
/// admins, shift ones (accept, assign, transfer, return, review, publish) from the shifts module's rota, so they
/// hold only while the shift runs.
/// </summary>
public sealed class ContentModule : IRuntimeModule
{
    public ModuleManifest Manifest { get; } = new("content", "Content", "0.1.0", "content")
    {
        Description = "Newsroom posts (article, news, video, reportage, and other post kinds), taxonomy, review and publishing workflow.",
        DefaultSettings = new Dictionary<string, string?> { ["Content:OwnerEditWindow"] = "1.00:00:00" },
        Permissions = ContentPermissions.All
    };

    public void ConfigureServices(IServiceCollection services, IConfiguration settings)
    {
        services.Configure<ContentOptions>(settings.GetSection("Content"));
        services.AddTenantDbContext<ContentDbContext>(); // IRepository<T> / IReadRepository<T> for Post, Press, Category
        services.AddScoped<PostService>();
        services.AddScoped<TaxonomyService>();
    }
}

public sealed class ContentDbContext(DbContextOptions<ContentDbContext> options, ITenantContext tenant) : TenantDbContext(options, tenant)
{
    protected override string Schema => "content";

    public DbSet<Press> Presses => Set<Press>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Post> Posts => Set<Post>();

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

        modelBuilder.Entity<Post>(post =>
        {
            // Retain deployed table/column names until an explicit data migration is planned.
            post.ToTable("articles");
            post.Property(a => a.PressId).HasMaxLength(64);
            post.Property(a => a.CategoryId).HasMaxLength(64);
            post.Property(a => a.Title).HasMaxLength(300);
            post.Property(a => a.OwnerId).HasMaxLength(128);
            post.Property(a => a.State).HasConversion<string>().HasMaxLength(32);
            post.Property(a => a.PostKind).HasColumnName("Type").HasConversion<string>().HasMaxLength(32).HasDefaultValue(PostKind.Article);
            post.Property(a => a.PublicId).HasMaxLength(32);
            post.Property(a => a.SchemaId).HasMaxLength(128).HasDefaultValue("legacy.basic");
            post.Property(a => a.SchemaVersion).HasDefaultValue(1);
            post.Property(a => a.DocumentJson).HasDefaultValue("{}");
            post.Property(a => a.PublishedDocumentJson);
            if (Database.ProviderName == "Oracle.EntityFrameworkCore")
            {
                // Oracle maps an unbounded string to NVARCHAR2(2000); Post documents may be up to 2 MB.
                post.Property(a => a.DocumentJson).HasColumnType("NCLOB");
                post.Property(a => a.PublishedDocumentJson).HasColumnType("NCLOB");
            }
            post.Property(a => a.PublishedTitle).HasMaxLength(300);
            post.Property(a => a.Version).IsConcurrencyToken();
            foreach (var user in new[] { nameof(Post.AcceptedBy), nameof(Post.AssigneeId), nameof(Post.ReviewerId), nameof(Post.ScheduledBy), nameof(Post.PublishedBy) })
                post.Property(user).HasMaxLength(128);
            post.Property(a => a.AssignedShiftId).HasMaxLength(64);
            post.Property(a => a.TransferredFromShift).HasMaxLength(64);
            post.Ignore(a => a.Scopes);
            post.HasIndex(a => new { a.State, a.CategoryId });
            post.HasIndex(a => a.OwnerId);
            post.HasIndex(a => a.AssigneeId);
            post.HasIndex(a => a.PublicId).IsUnique();
            post.HasMany(a => a.History).WithOne().HasForeignKey("ArticleId").OnDelete(DeleteBehavior.Cascade);
            post.Navigation(a => a.History).UsePropertyAccessMode(PropertyAccessMode.Field);
        });

        modelBuilder.Entity<PostEvent>(e =>
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
            catch (DbUpdateConcurrencyException) { return Results.Problem("Someone else changed this Post first; reload it and try again.", statusCode: StatusCodes.Status409Conflict); }
            catch (DomainException e) { return Results.Problem(e.Message, statusCode: StatusCodes.Status409Conflict); }
        });

        // Endpoint names are the OpenAPI operation ids: "Content_ListPosts" becomes ContentClient.ListPostsAsync in the
        // generated client. They must be unique across the whole host, hence the module prefix.
        content.MapGet("/presses", (TaxonomyService taxonomy, CancellationToken ct) => taxonomy.PressesAsync(ct))
            .WithName("Content_ListPresses");
        content.MapPost("/presses", (PressDto press, TaxonomyService taxonomy, CancellationToken ct) => taxonomy.AddPressAsync(press, ct))
            .RequirePermission(ContentPermissions.Manage)
            .WithName("Content_AddPress");
        content.MapGet("/categories", (string? pressId, TaxonomyService taxonomy, CancellationToken ct) => taxonomy.CategoriesAsync(pressId, ct))
            .WithName("Content_ListCategories");
        content.MapPost("/categories", (CategoryDto category, TaxonomyService taxonomy, CancellationToken ct) => taxonomy.AddCategoryAsync(category, ct))
            .RequirePermission(ContentPermissions.Manage)
            .WithName("Content_AddCategory");

        MapPosts(content.MapGroup("/posts"), "posts", documented: true);
        // Compatibility routes: the same handlers, left out of the OpenAPI document so generated clients only use /posts.
        MapPosts(content.MapGroup("/articles").ExcludeFromDescription(), "articles", documented: false);
        MapPosts(content.MapGroup("/works").ExcludeFromDescription(), "works", documented: false);
        content.MapGet("/public/{publicId}", (string publicId, PostService service, CancellationToken ct) => service.GetPublishedAsync(publicId, ct))
            .AllowAnonymous() // readers are not signed in; the tenant still comes from the host name or the X-Tenant header
            .WithName("Content_GetPublishedPost")
            .WithSummary("Resolve the permanent Post URL; only the immutable published snapshot is returned.");
    }

    /// <summary>Maps the Post routes under one resource segment. Only the documented copy is named (names are unique).</summary>
    private static void MapPosts(RouteGroupBuilder posts, string resourceSegment, bool documented)
    {
        RouteHandlerBuilder Named(RouteHandlerBuilder endpoint, string name) =>
            documented ? endpoint.WithName("Content_" + name) : endpoint;

        Named(posts.MapGet("/", (PostView? view, PostService service, CancellationToken ct) => service.ListAsync(view ?? PostView.Mine, ct)), "ListPosts")
            .WithSummary("Posts by post kind: article, news, video, reportage, and more. ?view=Mine | Queue | Review | Desk.");
        Named(posts.MapGet("/{id:int}", (int id, PostService service, CancellationToken ct) => service.GetAsync(id, ct)), "GetPost");
        Named(posts.MapPost("/", async (NewPost request, PostService service, CancellationToken ct) =>
            {
                var post = await service.CreateAsync(request, ct);
                return Results.Created($"{resourceSegment}/{post.Id}", post);
            }), "CreatePost")
            .Produces<PostDetail>(StatusCodes.Status201Created) // Results.Created hides the type from OpenAPI
            .RequirePermission(ContentPermissions.Author);
        Named(posts.MapPut("/{id:int}", (int id, PostEdit edit, PostService service, CancellationToken ct) => service.EditAsync(id, edit, ct)), "EditPost");

        Named(posts.MapPost("/{id:int}/submit", (int id, VersionRequest r, PostService s, CancellationToken ct) => s.SubmitAsync(id, r.Version, ct)), "SubmitPost");
        Named(posts.MapPost("/{id:int}/accept", (int id, AcceptRequest r, PostService s, CancellationToken ct) => s.AcceptAsync(id, r, ct)), "AcceptPost")
            .RequirePermission(ContentPermissions.Accept);
        Named(posts.MapPost("/{id:int}/assign", (int id, Assignment r, PostService s, CancellationToken ct) => s.AssignAsync(id, r, ct)), "AssignPost")
            .RequirePermission(ContentPermissions.Assign);
        Named(posts.MapPost("/{id:int}/approve", (int id, VersionRequest r, PostService s, CancellationToken ct) => s.ApproveAsync(id, r.Version, ct)), "ApprovePost")
            .RequirePermission(ContentPermissions.Review);
        Named(posts.MapPost("/{id:int}/return", (int id, ReturnRequest r, PostService s, CancellationToken ct) => s.ReturnAsync(id, r.Version, r.Reason, ct)), "ReturnPost")
            .RequirePermission(ContentPermissions.Return);
        Named(posts.MapPost("/{id:int}/transfer", (int id, TransferRequest r, PostService s, CancellationToken ct) => s.TransferAsync(id, r.Version, r.FromShift, ct)), "TransferPost")
            .RequirePermission(ContentPermissions.Transfer);
        Named(posts.MapPost("/{id:int}/schedule", (int id, ScheduleRequest r, PostService s, CancellationToken ct) => s.ScheduleAsync(id, r.Version, r.PublishAt, ct)), "SchedulePost")
            .RequirePermission(ContentPermissions.Publish);
        Named(posts.MapPost("/{id:int}/publish", (int id, VersionRequest r, PostService s, CancellationToken ct) => s.PublishAsync(id, r.Version, ct)), "PublishPost")
            .RequirePermission(ContentPermissions.Publish);
        Named(posts.MapPost("/publish-due", (PostService s, CancellationToken ct) => s.PublishDueAsync(ct)), "PublishDuePosts")
            .RequirePermission(ContentPermissions.Publish);
    }
}

public sealed class ContentAutomationEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        app.MapGet("/automation/accepted", (PostService service, CancellationToken ct) => service.AcceptedForAutomationAsync(ct))
            .RequirePermission(ContentPermissions.Assign)
            .WithName("Content_ListAcceptedForAutomation")
            .WithSummary("Accepted works available for Elsa's durable assignment-delay workflow.");
        app.MapPost("/automation/accepted/{id:int}/assign", (int id, PostService service, CancellationToken ct) => service.AutoAssignAsync(id, ct))
            .RequirePermission(ContentPermissions.Assign)
            .WithName("Content_AutoAssignPost")
            .WithSummary("Assign the accepted work to an eligible editor on an active shift; concurrency conflicts preserve a manager's assignment.");
        app.MapPost("/automation/shifts/{shiftId}/handover", (string shiftId, PostService service, CancellationToken ct) => service.TransferShiftWorkAsync(shiftId, ct))
            .RequirePermission(ContentPermissions.Transfer)
            .WithName("Content_HandOverShiftWork")
            .WithSummary("Return all unfinished review work from the outgoing shift to the queue; safe to repeat after recovery.");
    }
}
