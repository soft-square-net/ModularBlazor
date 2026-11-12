using System.Linq.Expressions;
using Ardalis.Specification;
using Microsoft.Extensions.Options;
using soft.square.net.WebApi.Contracts.Security;
using soft.square.net.WebApi.Modules.Content.Domain;
using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.WebApi.Modules.Content.Application;

public sealed record ArticleSummary(int Id, string PressId, string CategoryId, string Title, string OwnerId, ArticleState State, int Version,
    string? AssigneeId, DateTimeOffset? SubmittedAt, DateTimeOffset? ScheduledFor, string? TransferredFromShift, DateTimeOffset UpdatedAt);

public sealed record ArticleEventDto(DateTimeOffset At, string Actor, string Action, ArticleState State, string? Detail);

public sealed record ArticleDetail(int Id, string PressId, string CategoryId, string Title, string Body, string OwnerId, ArticleState State,
    int Version, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? SubmittedAt, bool OwnerMayEdit, string? AcceptedBy,
    string? AssigneeId, string? AssignedShiftId, string? ReviewerId, DateTimeOffset? ScheduledFor, string? ScheduledBy,
    DateTimeOffset? PublishedAt, string? PublishedBy, string? TransferredFromShift, IReadOnlyList<ArticleEventDto> History);

public sealed record NewArticle(string CategoryId, string Title, string? Body);

public sealed record ArticleEdit(int Version, string Title, string? Body);

public sealed record Assignment(int Version, string AssigneeId, string? ShiftId);

/// <summary>Which list: the caller's own, the queue (accept/assign), their reviews, or the Desk's (approved and scheduled).</summary>
public enum ArticleView { Mine, Queue, Review, Desk }

/// <summary>The article with this id, tracked (for a change); history is appended without loading it.</summary>
public sealed class ArticleByIdSpec : SingleResultSpecification<Article>
{
    public ArticleByIdSpec(int id) => Query.Where(a => a.Id == id);
}

/// <summary>The article with its history, untracked (for reading).</summary>
public sealed class ArticleDetailSpec : SingleResultSpecification<Article>
{
    public ArticleDetailSpec(int id) => Query.Where(a => a.Id == id).Include(a => a.History).AsNoTracking();
}

public sealed class ArticleListSpec : Specification<Article, ArticleSummary>
{
    /// <param name="filters">Combined with AND.</param>
    public ArticleListSpec(params Expression<Func<Article, bool>>[] filters)
    {
        foreach (var filter in filters) Query.Where(filter);
        Query.OrderByDescending(a => a.UpdatedAt).Take(200).AsNoTracking();
        Query.Select(a => new ArticleSummary(a.Id, a.PressId, a.CategoryId, a.Title, a.OwnerId, a.State, a.Version, a.AssigneeId,
            a.SubmittedAt, a.ScheduledFor, a.TransferredFromShift, a.UpdatedAt));
    }
}

public sealed class DueScheduledSpec : Specification<Article>
{
    public DueScheduledSpec(DateTimeOffset now) => Query.Where(a => a.State == ArticleState.Scheduled && a.ScheduledFor <= now).Take(100);
}

/// <summary>
/// Article use cases. Endpoint-level checks are coarse (the caller holds the permission somewhere); every operation
/// here checks the permission for this article's scopes (its press and category), using the caller's grants as they
/// are right now: shift grants count only while the shift runs, so access ends on the clock.
/// </summary>
public sealed class ArticleService(
    IRepository<Article> articles,
    IReadRepository<Article> reader,
    IReadRepository<Category> categories,
    IAccessScopes access,
    IOptions<ContentOptions> options,
    TimeProvider clock)
{
    private DateTimeOffset Now => clock.GetUtcNow();

    private string Me => access.UserId ?? throw new ContentAccessDeniedException("Sign in first.");

    public async Task<ArticleDetail> CreateAsync(NewArticle request, CancellationToken ct)
    {
        var category = await categories.GetByIdAsync(request.CategoryId, ct)
                       ?? throw new DomainException($"Unknown category '{request.CategoryId}'.");
        var scopes = new[] { AccessScope.Press(category.PressId), AccessScope.Category(category.Id) };
        await RequireAsync(ContentPermissions.Author, scopes, "write in this category", ct);
        var article = Article.Create(Me, category, request.Title, request.Body ?? "", Now);
        await articles.AddAsync(article, ct);
        return await GetAsync(article.Id, ct);
    }

    public async Task<ArticleDetail> GetAsync(int id, CancellationToken ct)
    {
        var article = await reader.FirstOrDefaultAsync(new ArticleDetailSpec(id), ct) ?? throw NotFound(id);
        if (article.OwnerId != Me && article.AssigneeId != Me && !await SeesAsync(article.Scopes, ct)) throw NotFound(id);
        return ToDetail(article);
    }

    public async Task<IReadOnlyList<ArticleSummary>> ListAsync(ArticleView view, CancellationToken ct)
    {
        var me = Me;
        switch (view)
        {
            case ArticleView.Mine:
                return await reader.ListAsync(new ArticleListSpec(a => a.OwnerId == me), ct);
            case ArticleView.Review:
                return await reader.ListAsync(new ArticleListSpec(a => a.AssigneeId == me && a.State == ArticleState.InReview), ct);
            case ArticleView.Queue:
            {
                var scope = await ScopeFilterAsync([ContentPermissions.Accept, ContentPermissions.Assign], ct);
                return scope is null ? [] : await reader.ListAsync(new ArticleListSpec(
                    a => a.State == ArticleState.Submitted || a.State == ArticleState.Accepted, scope), ct);
            }
            default:
            {
                var scope = await ScopeFilterAsync([ContentPermissions.Publish], ct);
                return scope is null ? [] : await reader.ListAsync(new ArticleListSpec(
                    a => a.State == ArticleState.Approved || a.State == ArticleState.Scheduled || a.State == ArticleState.AwaitingDeskReapproval, scope), ct);
            }
        }
    }

    /// <summary>Owner (draft, returned, or submitted within the window), assigned reviewer (in review, on shift), or Desk (approved or scheduled).</summary>
    public Task<ArticleDetail> EditAsync(int id, ArticleEdit edit, CancellationToken ct) => ChangeAsync(id, edit.Version, async article =>
    {
        var now = Now;
        if (article.OwnerId == Me && article.OwnerMayEdit(now, options.Value.OwnerEditWindow))
            article.EditByOwner(Me, edit.Title, edit.Body ?? "", now, options.Value.OwnerEditWindow);
        else if (article.State == ArticleState.InReview && article.AssigneeId == Me)
        {
            await RequireAsync(ContentPermissions.Review, article.Scopes, "review in this category now (is your shift over?)", ct);
            article.EditInReview(Me, edit.Title, edit.Body ?? "", now);
        }
        else if (article.State is ArticleState.Approved or ArticleState.Scheduled or ArticleState.AwaitingDeskReapproval)
        {
            await RequireAsync(ContentPermissions.Publish, article.Scopes, "edit as Desk in this category", ct);
            article.EditByDesk(Me, edit.Title, edit.Body ?? "", now);
        }
        else if (article.OwnerId == Me)
            article.EditByOwner(Me, edit.Title, edit.Body ?? "", now, options.Value.OwnerEditWindow); // explains why not
        else
            throw new ContentAccessDeniedException($"You cannot edit this article while it is {article.State}.");
    }, ct);

    public Task<ArticleDetail> SubmitAsync(int id, int version, CancellationToken ct) =>
        ChangeAsync(id, version, article => { article.Submit(Me, Now); return Task.CompletedTask; }, ct);

    public Task<ArticleDetail> AcceptAsync(int id, int version, CancellationToken ct) => ChangeAsync(id, version, async article =>
    {
        await RequireAsync(ContentPermissions.Accept, article.Scopes, "accept submissions in this category now", ct);
        article.Accept(Me, Now);
    }, ct);

    /// <summary>The assignee must hold the review right for this article right now (an Editor on an active shift covering it).</summary>
    public Task<ArticleDetail> AssignAsync(int id, Assignment assignment, CancellationToken ct) => ChangeAsync(id, assignment.Version, async article =>
    {
        await RequireAsync(ContentPermissions.Assign, article.Scopes, "assign in this category now", ct);
        if (!await access.UserHasPermissionAsync(assignment.AssigneeId, ContentPermissions.Review, article.Scopes, ct))
            throw new DomainException($"'{assignment.AssigneeId}' is not an editor on an active shift covering this article.");
        article.Assign(Me, assignment.AssigneeId, assignment.ShiftId, Now);
    }, ct);

    public Task<ArticleDetail> ApproveAsync(int id, int version, CancellationToken ct) => ChangeAsync(id, version, async article =>
    {
        await RequireAsync(ContentPermissions.Review, article.Scopes, "review in this category now (is your shift over?)", ct);
        article.Approve(Me, Now);
    }, ct);

    public Task<ArticleDetail> ReturnAsync(int id, int version, string? reason, CancellationToken ct) => ChangeAsync(id, version, async article =>
    {
        await RequireAsync(ContentPermissions.Return, article.Scopes, "send articles back in this category now", ct);
        article.Return(Me, reason, Now);
    }, ct);

    public Task<ArticleDetail> TransferAsync(int id, int version, string? fromShift, CancellationToken ct) => ChangeAsync(id, version, async article =>
    {
        await RequireAsync(ContentPermissions.Transfer, article.Scopes, "hand over work in this category now", ct);
        article.Transfer(Me, fromShift, Now);
    }, ct);

    public Task<ArticleDetail> ScheduleAsync(int id, int version, DateTimeOffset publishAt, CancellationToken ct) => ChangeAsync(id, version, async article =>
    {
        await RequirePublisherAsync(article, ct);
        article.Schedule(Me, publishAt.ToUniversalTime(), Now);
    }, ct);

    public Task<ArticleDetail> PublishAsync(int id, int version, CancellationToken ct) => ChangeAsync(id, version, async article =>
    {
        await RequirePublisherAsync(article, ct);
        article.Publish(Me, Now);
    }, ct);

    /// <summary>
    /// Publishes every scheduled article that is due and unchanged since it was scheduled (called by the workflow
    /// module; the caller needs the publish right tenant-wide). Returns the ids published.
    /// </summary>
    public async Task<IReadOnlyList<int>> PublishDueAsync(CancellationToken ct)
    {
        if (!(await access.ScopesAsync(ContentPermissions.Publish, ct)).Contains(AccessScope.Tenant))
            throw new ContentAccessDeniedException("Publishing due articles needs the publish right for the whole tenant.");
        var published = new List<int>();
        foreach (var article in await articles.ListAsync(new DueScheduledSpec(Now), ct))
        {
            if (!article.PublishIfDue(Me, Now)) continue;
            await articles.UpdateAsync(article, ct);
            published.Add(article.Id);
        }
        return published;
    }

    /// <summary>Desk on shift; publishing your own or self-reviewed article also needs the standing editor right on its category.</summary>
    private async Task RequirePublisherAsync(Article article, CancellationToken ct)
    {
        await RequireAsync(ContentPermissions.Publish, article.Scopes, "publish in this category now", ct);
        if ((article.OwnerId == Me || article.ReviewerId == Me) && !await access.HasPermissionAsync(ContentPermissions.Editor, [AccessScope.Category(article.CategoryId)], ct))
            throw new ContentAccessDeniedException("You wrote or reviewed this article: publishing it yourself needs the standing editor right on its category.");
    }

    private async Task<ArticleDetail> ChangeAsync(int id, int version, Func<Article, Task> change, CancellationToken ct)
    {
        var article = await articles.FirstOrDefaultAsync(new ArticleByIdSpec(id), ct) ?? throw NotFound(id);
        if (article.Version != version)
            throw new ContentVersionConflictException($"Article {id} is at version {article.Version}, not {version}; reload it and try again.");
        await change(article);
        await articles.UpdateAsync(article, ct); // the version is a concurrency token: a racing change loses with 409
        return await GetAsync(id, ct);
    }

    private async Task RequireAsync(string permission, IReadOnlyCollection<string> scopes, string what, CancellationToken ct)
    {
        if (!await access.HasPermissionAsync(permission, scopes, ct))
            throw new ContentAccessDeniedException($"You may not {what} ({permission}).");
    }

    private async Task<bool> SeesAsync(IReadOnlyCollection<string> scopes, CancellationToken ct)
    {
        foreach (var permission in new[] { ContentPermissions.Accept, ContentPermissions.Assign, ContentPermissions.Return, ContentPermissions.Publish, ContentPermissions.Editor, ContentPermissions.Manage })
            if (await access.HasPermissionAsync(permission, scopes, ct)) return true;
        return false;
    }

    /// <summary>Rows in any scope where the caller holds one of the permissions now; null when none at all.</summary>
    private async Task<Expression<Func<Article, bool>>?> ScopeFilterAsync(string[] permissions, CancellationToken ct)
    {
        var scopes = new HashSet<string>();
        foreach (var permission in permissions) scopes.UnionWith(await access.ScopesAsync(permission, ct));
        if (scopes.Contains(AccessScope.Tenant)) return _ => true;
        var presses = scopes.Where(s => s.StartsWith("press:")).Select(s => s["press:".Length..]).ToArray();
        var cats = scopes.Where(s => s.StartsWith("category:")).Select(s => s["category:".Length..]).ToArray();
        if (presses.Length == 0 && cats.Length == 0) return null;
        return a => presses.Contains(a.PressId) || cats.Contains(a.CategoryId);
    }

    private ArticleDetail ToDetail(Article a) => new(a.Id, a.PressId, a.CategoryId, a.Title, a.Body, a.OwnerId, a.State, a.Version,
        a.CreatedAt, a.UpdatedAt, a.SubmittedAt, a.OwnerMayEdit(Now, options.Value.OwnerEditWindow), a.AcceptedBy, a.AssigneeId,
        a.AssignedShiftId, a.ReviewerId, a.ScheduledFor, a.ScheduledBy, a.PublishedAt, a.PublishedBy, a.TransferredFromShift,
        a.History.OrderBy(e => e.At).ThenBy(e => e.Id).Select(e => new ArticleEventDto(e.At, e.Actor, e.Action, e.State, e.Detail)).ToArray());

    private static ContentNotFoundException NotFound(int id) => new($"Article {id} was not found.");
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
