using System.Linq.Expressions;
using System.Text.Json;
using Ardalis.Specification;
using Microsoft.Extensions.Options;
using soft.square.net.WebApi.Contracts.Security;
using soft.square.net.WebApi.Modules.Content.Domain;
using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.WebApi.Modules.Content.Application;

public sealed record PostSummary(int Id, PostKind PostKind, string PressId, string CategoryId, string Title, string OwnerId, PostState State, int Version,
    DateTimeOffset? AcceptedAt, string? AcceptedShiftId,
    string? AssigneeId, DateTimeOffset? SubmittedAt, DateTimeOffset? ScheduledFor, string? TransferredFromShift, DateTimeOffset UpdatedAt);

public sealed record PostEventDto(DateTimeOffset At, string Actor, string Action, PostState State, string? Detail);

public sealed record PostDetail(int Id, PostKind PostKind, string PressId, string CategoryId, string Title, string Body, string OwnerId, PostState State,
    int Version, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? SubmittedAt, bool OwnerMayEdit, string? AcceptedBy,
    DateTimeOffset? AcceptedAt, string? AcceptedShiftId,
    string? AssigneeId, string? AssignedShiftId, string? ReviewerId, DateTimeOffset? ScheduledFor, string? ScheduledBy,
    DateTimeOffset? PublishedAt, string? PublishedBy, string? PublishedTitle, string? PublishedBody,
    string? TransferredFromShift, IReadOnlyList<PostEventDto> History, string PublicId, string Permalink,
    string SchemaId, int SchemaVersion, PostDocument Document);

public sealed record NewPost(string CategoryId, string Title, string? Body, PostKind PostKind = PostKind.Article, PostDocument? Document = null);

public sealed record AcceptRequest(int Version, string ShiftId);

public sealed record PostEdit(int Version, string Title, string? Body, PostDocument? Document = null);

public sealed record PublishedPost(int Id, string PublicId, string Permalink, PostKind PostKind, string PressId,
    string CategoryId, string Title, DateTimeOffset PublishedAt, string SchemaId, int SchemaVersion, PostDocument Document);

public sealed record Assignment(int Version, string AssigneeId, string? ShiftId);

/// <summary>Which list: the caller's own, the queue (accept/assign), their reviews, or the Desk's (approved and scheduled).</summary>
public enum PostView { Mine, Queue, Review, Desk }

/// <summary>The Post with this id, tracked (for a change); history is appended without loading it.</summary>
public sealed class PostByIdSpec : SingleResultSpecification<Post>
{
    public PostByIdSpec(int id) => Query.Where(a => a.Id == id);
}

/// <summary>The Post with its history, untracked (for reading).</summary>
public sealed class PostDetailSpec : SingleResultSpecification<Post>
{
    public PostDetailSpec(int id) => Query.Where(a => a.Id == id).Include(a => a.History).AsNoTracking();
}

public sealed class PublishedPostByPublicIdSpec : SingleResultSpecification<Post>
{
    public PublishedPostByPublicIdSpec(string publicId) => Query.Where(p => p.PublicId == publicId && p.State == PostState.Published).AsNoTracking();
}

public sealed class PublishedPostByLegacyIdSpec : SingleResultSpecification<Post>
{
    public PublishedPostByLegacyIdSpec(int id) => Query.Where(p => p.Id == id && p.State == PostState.Published).AsNoTracking();
}

public sealed class PostListSpec : Specification<Post, PostSummary>
{
    /// <param name="filters">Combined with AND.</param>
    public PostListSpec(params Expression<Func<Post, bool>>[] filters)
    {
        foreach (var filter in filters) Query.Where(filter);
        Query.OrderByDescending(a => a.UpdatedAt).Take(200).AsNoTracking();
        Query.Select(a => new PostSummary(a.Id, a.PostKind, a.PressId, a.CategoryId, a.Title, a.OwnerId, a.State, a.Version,
            a.AcceptedAt, a.AcceptedShiftId, a.AssigneeId,
            a.SubmittedAt, a.ScheduledFor, a.TransferredFromShift, a.UpdatedAt));
    }
}

public sealed class DueScheduledSpec : Specification<Post>
{
    public DueScheduledSpec(DateTimeOffset now) => Query.Where(a => a.State == PostState.Scheduled && a.ScheduledFor <= now).Take(100);
}

public sealed class AcceptedPostsSpec : Specification<Post, PostSummary>
{
    public AcceptedPostsSpec() => Query.Where(a => a.State == PostState.Accepted && a.AcceptedAt != null)
        .OrderBy(a => a.AcceptedAt).Take(200).AsNoTracking()
        .Select(a => new PostSummary(a.Id, a.PostKind, a.PressId, a.CategoryId, a.Title, a.OwnerId, a.State, a.Version,
            a.AcceptedAt, a.AcceptedShiftId, a.AssigneeId, a.SubmittedAt, a.ScheduledFor, a.TransferredFromShift, a.UpdatedAt));
}

public sealed class AssignedShiftPostsSpec : Specification<Post>
{
    public AssignedShiftPostsSpec(string shiftId) => Query
        .Where(a => a.State == PostState.InReview && a.AssignedShiftId == shiftId)
        .OrderBy(a => a.Id).Take(500);
}

/// <summary>
/// Post use cases. Endpoint-level checks are coarse (the caller holds the permission somewhere); every operation
/// here checks the permission for this Post's scopes (its press and category), using the caller's grants as they
/// are right now: shift grants count only while the shift runs, so access ends on the clock.
/// </summary>
public sealed class PostService(
    IRepository<Post> posts,
    IReadRepository<Post> reader,
    IReadRepository<Category> categories,
    IGrantStore grants,
    IAccessScopes access,
    IOptions<ContentOptions> options,
    TimeProvider clock)
{
    private DateTimeOffset Now => clock.GetUtcNow();

    private string Me => access.UserId ?? throw new ContentAccessDeniedException("Sign in first.");

    public async Task<PostDetail> CreateAsync(NewPost request, CancellationToken ct)
    {
        var category = await categories.GetByIdAsync(request.CategoryId, ct)
                       ?? throw new DomainException($"Unknown category '{request.CategoryId}'.");
        var scopes = new[] { AccessScope.Press(category.PressId), AccessScope.Category(category.Id) };
        await RequireAsync(ContentPermissions.Author, scopes, "write in this category", ct);
        var post = Post.Create(Me, category, request.Title, request.Body ?? "", Now, request.PostKind, request.Document);
        await posts.AddAsync(post, ct);
        return await GetAsync(post.Id, ct);
    }

    public async Task<PostDetail> GetAsync(int id, CancellationToken ct)
    {
        var post = await reader.FirstOrDefaultAsync(new PostDetailSpec(id), ct) ?? throw NotFound(id);
        if (post.OwnerId != Me && post.AssigneeId != Me && !await SeesAsync(post.Scopes, ct)) throw NotFound(id);
        return ToDetail(post);
    }

    /// <summary>Public lookup serves only the immutable published snapshot, never the current draft.</summary>
    public async Task<PublishedPost> GetPublishedAsync(string publicId, CancellationToken ct)
    {
        var post = (publicId.StartsWith("legacy-", StringComparison.Ordinal) && int.TryParse(publicId.AsSpan("legacy-".Length), out var legacyId)
            ? await reader.FirstOrDefaultAsync(new PublishedPostByLegacyIdSpec(legacyId), ct)
            : await reader.FirstOrDefaultAsync(new PublishedPostByPublicIdSpec(publicId), ct))
            ?? throw new ContentNotFoundException("Published Post was not found.");
        if (post.PublishedAt is null)
            throw new ContentNotFoundException("Published Post was not found.");
        var document = string.IsNullOrWhiteSpace(post.PublishedDocumentJson)
            ? PostDocument.FromLegacy(post.PublishedTitle ?? post.Title, post.PublishedBody ?? post.Body)
            : JsonSerializer.Deserialize<PostDocument>(post.PublishedDocumentJson, new JsonSerializerOptions(JsonSerializerDefaults.Web))
              ?? throw new InvalidOperationException("The published Post document is invalid.");
        return new PublishedPost(post.Id, post.StablePublicId, Permalink(post.StablePublicId), post.PostKind, post.PressId,
            post.CategoryId, post.PublishedTitle ?? post.Title, post.PublishedAt.Value, document.SchemaId, document.SchemaVersion, document);
    }

    public async Task<IReadOnlyList<PostSummary>> ListAsync(PostView view, CancellationToken ct)
    {
        var me = Me;
        switch (view)
        {
            case PostView.Mine:
                return await reader.ListAsync(new PostListSpec(a => a.OwnerId == me), ct);
            case PostView.Review:
                return await reader.ListAsync(new PostListSpec(a => a.AssigneeId == me && a.State == PostState.InReview), ct);
            case PostView.Queue:
            {
                var scope = await ScopeFilterAsync([ContentPermissions.Accept, ContentPermissions.Assign], ct);
                return scope is null ? [] : await reader.ListAsync(new PostListSpec(
                    a => a.State == PostState.Submitted || a.State == PostState.Accepted, scope), ct);
            }
            default:
            {
                var scope = await ScopeFilterAsync([ContentPermissions.Publish], ct);
                return scope is null ? [] : await reader.ListAsync(new PostListSpec(
                    a => a.State == PostState.Approved || a.State == PostState.Scheduled || a.State == PostState.AwaitingDeskReapproval, scope), ct);
            }
        }
    }

    /// <summary>Durable polling view for Elsa; only the workflow workload gets tenant-wide assignment permission.</summary>
    public async Task<IReadOnlyList<PostSummary>> AcceptedForAutomationAsync(CancellationToken ct)
    {
        if (!(await access.ScopesAsync(ContentPermissions.Assign, ct)).Contains(AccessScope.Tenant))
            throw new ContentAccessDeniedException("Workflow polling needs tenant-wide content.assign.");
        return await reader.ListAsync(new AcceptedPostsSpec(), ct);
    }

    /// <summary>
    /// Auto-assign an accepted work to an editor whose category grant is active now. The database version check makes
    /// this safe against a manager assigning at the same time; an already assigned work is never overwritten.
    /// </summary>
    public async Task<PostDetail> AutoAssignAsync(int id, CancellationToken ct)
    {
        var post = await posts.FirstOrDefaultAsync(new PostByIdSpec(id), ct) ?? throw NotFound(id);
        if (post.State != PostState.Accepted)
            throw new ContentVersionConflictException("The work is no longer waiting for assignment.");

        await RequireAsync(ContentPermissions.Assign, post.Scopes, "auto-assign in this category", ct);
        var now = Now;
        var candidates = (await grants.ListAsync(ct: ct))
            .Where(g => g.Permission == ContentPermissions.Review && g.IsActiveAt(now)
                        && g.Source.StartsWith("shift:", StringComparison.Ordinal)
                        && g.Covers(post.Scopes) && g.UserId != post.OwnerId)
            .Select(g => (g.UserId, ShiftId: g.Source["shift:".Length..]))
            .Distinct()
            .OrderBy(x => x.UserId, StringComparer.Ordinal)
            .ThenBy(x => x.ShiftId, StringComparer.Ordinal)
            .ToArray();
        if (candidates.Length == 0) throw new ContentAccessDeniedException("There is no eligible editor on an active shift for this category.");

        var candidate = candidates[(int)((uint)id % (uint)candidates.Length)];
        return await AssignAsync(id, new Assignment(post.Version, candidate.UserId, candidate.ShiftId), ct);
    }

    /// <summary>At automatic shift checkout, return every unfinished review to the incoming shift's queue.</summary>
    public async Task<int> TransferShiftWorkAsync(string shiftId, CancellationToken ct)
    {
        if (!(await access.ScopesAsync(ContentPermissions.Transfer, ct)).Contains(AccessScope.Tenant))
            throw new ContentAccessDeniedException("Automatic handover needs tenant-wide content.transfer.");
        var pending = await posts.ListAsync(new AssignedShiftPostsSpec(shiftId), ct);
        foreach (var post in pending)
        {
            post.Transfer(Me, shiftId, Now);
            await posts.UpdateAsync(post, ct);
        }
        return pending.Count;
    }

    /// <summary>Owner (draft, returned, or submitted within the window), assigned reviewer (in review, on shift), or Desk (approved or scheduled).</summary>
    public Task<PostDetail> EditAsync(int id, PostEdit edit, CancellationToken ct) => ChangeAsync(id, edit.Version, async post =>
    {
        var now = Now;
        if (post.OwnerId == Me && post.OwnerMayEdit(now, options.Value.OwnerEditWindow))
            post.EditByOwner(Me, edit.Title, edit.Body ?? "", now, options.Value.OwnerEditWindow, edit.Document);
        else if (post.State == PostState.InReview && post.AssigneeId == Me)
        {
            await RequireAsync(ContentPermissions.Review, post.Scopes, "review in this category now (is your shift over?)", ct);
            post.EditInReview(Me, edit.Title, edit.Body ?? "", now, edit.Document);
        }
        else if (post.State is PostState.Approved or PostState.Scheduled or PostState.AwaitingDeskReapproval)
        {
            await RequireAsync(ContentPermissions.Publish, post.Scopes, "edit as Desk in this category", ct);
            post.EditByDesk(Me, edit.Title, edit.Body ?? "", now, edit.Document);
        }
        else if (post.OwnerId == Me)
            post.EditByOwner(Me, edit.Title, edit.Body ?? "", now, options.Value.OwnerEditWindow, edit.Document); // explains why not
        else
            throw new ContentAccessDeniedException($"You cannot edit this Post while it is {post.State}.");
    }, ct);

    public Task<PostDetail> SubmitAsync(int id, int version, CancellationToken ct) =>
        ChangeAsync(id, version, post => { post.Submit(Me, Now); return Task.CompletedTask; }, ct);

    public Task<PostDetail> AcceptAsync(int id, AcceptRequest request, CancellationToken ct) => ChangeAsync(id, request.Version, async post =>
    {
        await RequireShiftPermissionAsync(ContentPermissions.Accept, post.Scopes, request.ShiftId, ct);
        post.Accept(Me, request.ShiftId, Now);
    }, ct);

    /// <summary>The assignee must hold the review right for this Post right now (an Editor on an active shift covering it).</summary>
    public Task<PostDetail> AssignAsync(int id, Assignment assignment, CancellationToken ct) => ChangeAsync(id, assignment.Version, async post =>
    {
        if (string.IsNullOrWhiteSpace(assignment.ShiftId))
            throw new ContentAccessDeniedException("Assignment must name the active shift that grants the editor access.");
        await RequireShiftPermissionAsync(ContentPermissions.Assign, post.Scopes, assignment.ShiftId, ct);
        var targetIsEditor = (await grants.ListAsync(assignment.AssigneeId, $"shift:{assignment.ShiftId}", ct)).Any(g =>
            g.Permission == ContentPermissions.Review && g.IsActiveAt(Now) && g.Covers(post.Scopes));
        if (!targetIsEditor)
            throw new DomainException($"'{assignment.AssigneeId}' is not an editor on an active shift covering this post.");
        post.Assign(Me, assignment.AssigneeId, assignment.ShiftId, Now);
    }, ct);

    public Task<PostDetail> ApproveAsync(int id, int version, CancellationToken ct) => ChangeAsync(id, version, async post =>
    {
        await RequireAsync(ContentPermissions.Review, post.Scopes, "review in this category now (is your shift over?)", ct);
        post.Approve(Me, Now);
    }, ct);

    public Task<PostDetail> ReturnAsync(int id, int version, string? reason, CancellationToken ct) => ChangeAsync(id, version, async post =>
    {
        await RequireAsync(ContentPermissions.Return, post.Scopes, "send posts back in this category now", ct);
        post.Return(Me, reason, Now);
    }, ct);

    public Task<PostDetail> TransferAsync(int id, int version, string? fromShift, CancellationToken ct) => ChangeAsync(id, version, async post =>
    {
        await RequireAsync(ContentPermissions.Transfer, post.Scopes, "hand over work in this category now", ct);
        post.Transfer(Me, fromShift, Now);
    }, ct);

    public Task<PostDetail> ScheduleAsync(int id, int version, DateTimeOffset publishAt, CancellationToken ct) => ChangeAsync(id, version, async post =>
    {
        await RequirePublisherAsync(post, ct);
        post.Schedule(Me, publishAt.ToUniversalTime(), Now);
    }, ct);

    public Task<PostDetail> PublishAsync(int id, int version, CancellationToken ct) => ChangeAsync(id, version, async post =>
    {
        await RequirePublisherAsync(post, ct);
        post.Publish(Me, Now);
    }, ct);

    /// <summary>
    /// Publishes every scheduled Post that is due and unchanged since it was scheduled (called by the workflow
    /// module; the caller needs the publish right tenant-wide). Returns the ids published.
    /// </summary>
    public async Task<IReadOnlyList<int>> PublishDueAsync(CancellationToken ct)
    {
        if (!(await access.ScopesAsync(ContentPermissions.Publish, ct)).Contains(AccessScope.Tenant))
            throw new ContentAccessDeniedException("Publishing due posts needs the publish right for the whole tenant.");
        var published = new List<int>();
        foreach (var post in await posts.ListAsync(new DueScheduledSpec(Now), ct))
        {
            if (!post.PublishIfDue(Me, Now)) continue;
            await posts.UpdateAsync(post, ct);
            published.Add(post.Id);
        }
        return published;
    }

    /// <summary>Desk on shift; publishing your own or self-reviewed Post also needs the standing editor right on its category.</summary>
    private async Task RequirePublisherAsync(Post post, CancellationToken ct)
    {
        await RequireAsync(ContentPermissions.Publish, post.Scopes, "publish in this category now", ct);
        if ((post.OwnerId == Me || post.ReviewerId == Me) && !await access.HasPermissionAsync(ContentPermissions.Editor, [AccessScope.Category(post.CategoryId)], ct))
            throw new ContentAccessDeniedException("You wrote or reviewed this Post: publishing it yourself needs the standing editor right on its category.");
    }

    private async Task<PostDetail> ChangeAsync(int id, int version, Func<Post, Task> change, CancellationToken ct)
    {
        var post = await posts.FirstOrDefaultAsync(new PostByIdSpec(id), ct) ?? throw NotFound(id);
        if (post.Version != version)
            throw new ContentVersionConflictException($"Post {id} is at version {post.Version}, not {version}; reload it and try again.");
        await change(post);
        await posts.UpdateAsync(post, ct); // the version is a concurrency token: a racing change loses with 409
        return await GetAsync(id, ct);
    }

    private async Task RequireAsync(string permission, IReadOnlyCollection<string> scopes, string what, CancellationToken ct)
    {
        if (!await access.HasPermissionAsync(permission, scopes, ct))
            throw new ContentAccessDeniedException($"You may not {what} ({permission}).");
    }

    private async Task RequireShiftPermissionAsync(string permission, IReadOnlyCollection<string> scopes, string shiftId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(shiftId)) throw new ContentAccessDeniedException("An active shift is required for this action.");
        var now = Now;
        var valid = (await grants.ListAsync(Me, $"shift:{shiftId}", ct)).Any(g =>
            g.Permission == permission && g.IsActiveAt(now) && g.Covers(scopes));
        if (!valid) throw new ContentAccessDeniedException($"You do not hold {permission} in active shift '{shiftId}' for this category.");
    }

    private async Task<bool> SeesAsync(IReadOnlyCollection<string> scopes, CancellationToken ct)
    {
        foreach (var permission in new[] { ContentPermissions.Accept, ContentPermissions.Assign, ContentPermissions.Return, ContentPermissions.Publish, ContentPermissions.Editor, ContentPermissions.Manage })
            if (await access.HasPermissionAsync(permission, scopes, ct)) return true;
        return false;
    }

    /// <summary>Rows in any scope where the caller holds one of the permissions now; null when none at all.</summary>
    private async Task<Expression<Func<Post, bool>>?> ScopeFilterAsync(string[] permissions, CancellationToken ct)
    {
        var scopes = new HashSet<string>();
        foreach (var permission in permissions) scopes.UnionWith(await access.ScopesAsync(permission, ct));
        if (scopes.Contains(AccessScope.Tenant)) return _ => true;
        var presses = scopes.Where(s => s.StartsWith("press:")).Select(s => s["press:".Length..]).ToArray();
        var cats = scopes.Where(s => s.StartsWith("category:")).Select(s => s["category:".Length..]).ToArray();
        if (presses.Length == 0 && cats.Length == 0) return null;
        return a => presses.Contains(a.PressId) || cats.Contains(a.CategoryId);
    }

    private PostDetail ToDetail(Post a) => new(a.Id, a.PostKind, a.PressId, a.CategoryId, a.Title, a.Body, a.OwnerId, a.State, a.Version,
        a.CreatedAt, a.UpdatedAt, a.SubmittedAt, a.OwnerMayEdit(Now, options.Value.OwnerEditWindow), a.AcceptedBy,
        a.AcceptedAt, a.AcceptedShiftId, a.AssigneeId,
        a.AssignedShiftId, a.ReviewerId, a.ScheduledFor, a.ScheduledBy, a.PublishedAt, a.PublishedBy,
        a.PublishedTitle, a.PublishedBody, a.TransferredFromShift,
        a.History.OrderBy(e => e.At).ThenBy(e => e.Id).Select(e => new PostEventDto(e.At, e.Actor, e.Action, e.State, e.Detail)).ToArray(),
        a.StablePublicId, Permalink(a.StablePublicId), a.SchemaId, a.SchemaVersion,
        string.IsNullOrWhiteSpace(a.DocumentJson) || a.DocumentJson == "{}"
            ? PostDocument.FromLegacy(a.Title, a.Body)
            : JsonSerializer.Deserialize<PostDocument>(a.DocumentJson, new JsonSerializerOptions(JsonSerializerDefaults.Web))
              ?? throw new InvalidOperationException($"Post {a.Id} has an invalid document."));

    private static string Permalink(string publicId) => $"/api/content/public/{Uri.EscapeDataString(publicId)}";

    private static ContentNotFoundException NotFound(int id) => new($"Post {id} was not found.");
}

public sealed record PressDto(string Id, string Name);

public sealed record CategoryDto(string Id, string PressId, string Name);

public sealed class TaxonomyService(IRepository<Press> presses, IRepository<Category> categories, IAccessScopes access)
{
    public async Task<IReadOnlyList<PressDto>> PressesAsync(CancellationToken ct) =>
        (await presses.ListAsync(ct)).OrderBy(p => p.Id).Select(p => new PressDto(p.Id, p.Name)).ToArray();

    public async Task<IReadOnlyList<CategoryDto>> CategoriesAsync(string? pressId, CancellationToken ct) =>
        (await categories.ListAsync(ct)).Where(c => pressId is null || c.PressId == pressId)
            .OrderBy(c => c.PressId).ThenBy(c => c.Id).Select(c => new CategoryDto(c.Id, c.PressId, c.Name)).ToArray();

    public async Task<PressDto> AddPressAsync(PressDto request, CancellationToken ct)
    {
        await RequireManageAsync(ct);
        if (await presses.GetByIdAsync(request.Id, ct) is not null) throw new DomainException($"Press '{request.Id}' exists already.");
        var press = await presses.AddAsync(Press.Create(request.Id, request.Name), ct);
        return new PressDto(press.Id, press.Name);
    }

    public async Task<CategoryDto> AddCategoryAsync(CategoryDto request, CancellationToken ct)
    {
        await RequireManageAsync(ct);
        if (await presses.GetByIdAsync(request.PressId, ct) is null) throw new DomainException($"Unknown press '{request.PressId}'.");
        if (await categories.GetByIdAsync(request.Id, ct) is not null) throw new DomainException($"Category '{request.Id}' exists already.");
        var category = await categories.AddAsync(Category.Create(request.Id, request.PressId, request.Name), ct);
        return new CategoryDto(category.Id, category.PressId, category.Name);
    }

    private async Task RequireManageAsync(CancellationToken ct)
    {
        if (!(await access.ScopesAsync(ContentPermissions.Manage, ct)).Contains(AccessScope.Tenant))
            throw new ContentAccessDeniedException("Managing presses and categories needs content.manage for the whole tenant.");
    }
}
