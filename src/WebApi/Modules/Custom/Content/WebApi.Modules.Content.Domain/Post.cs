using System.Text.Json;
using System.Text.Json.Serialization;
using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.WebApi.Modules.Content.Domain;

/// <summary>
/// Workflow states (see the auth design, "Content workflow"):
/// <code>
/// Draft → Submitted ─(Manager accepts)→ Accepted ─(assign)→ InReview ─(approve)→ Approved → Scheduled → Published
/// Returned ← Manager or Desk;  an edit while Approved/Scheduled → AwaitingDeskReapproval (schedule cancelled)
/// </code>
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<PostState>))]
public enum PostState { Draft, Submitted, Accepted, InReview, Returned, Approved, Scheduled, AwaitingDeskReapproval, Published }

[JsonConverter(typeof(JsonStringEnumConverter<PostKind>))]
public enum PostKind { Article, News, Video, Reportage, PhotoStory, Other }

/// <summary>One nested content item. Nodes share the root Post's workflow and permanent URL.</summary>
public sealed record PostNode(
    string NodeId,
    PostKind PostKind,
    string SchemaId,
    int SchemaVersion,
    JsonElement Content,
    JsonElement Style,
    IReadOnlyList<PostNode> Children);

/// <summary>
/// Versioned Post form data and composition. Content and Style are independent JSON objects;
/// nodes form one semantic tree shared by all viewports, with responsive values in Style.
/// </summary>
public sealed record PostDocument(
    string SchemaId,
    int SchemaVersion,
    JsonElement Content,
    JsonElement Style,
    IReadOnlyList<PostNode> Children)
{
    public static PostDocument FromLegacy(string title, string body)
    {
        using var content = JsonDocument.Parse(JsonSerializer.Serialize(new { title, body }));
        using var style = JsonDocument.Parse("{}");
        return new PostDocument("legacy.basic", 1, content.RootElement.Clone(), style.RootElement.Clone(), []);
    }
}

/// <summary>
/// A Post of one press and category (aggregate root). The aggregate enforces the state rules; who may call each
/// operation (grants, scopes, shifts) is decided in the application layer. Every change bumps <see cref="Version"/>
/// (optimistic concurrency: the second of two racing assignments gets a conflict) and is recorded in <see cref="History"/>.
/// </summary>
public sealed class Post : AggregateRoot<int>, ITenantOwned
{
    private readonly List<PostEvent> _history = [];

    private Post() { } // EF Core

    public string TenantId { get; set; } = "";
    /// <summary>Stable identifier used by the public permalink; never changes when the title or slug changes.</summary>
    public string PublicId { get; private set; } = "";
    public string StablePublicId => string.IsNullOrWhiteSpace(PublicId) ? $"legacy-{Id}" : PublicId;
    public string PressId { get; private set; } = "";
    public string CategoryId { get; private set; } = "";
    public string Title { get; private set; } = "";
    public string Body { get; private set; } = "";
    /// <summary>Authoring document; schema ID/version are retained so edits can use the original field contract.</summary>
    public string SchemaId { get; private set; } = "legacy.basic";
    public int SchemaVersion { get; private set; } = 1;
    public string DocumentJson { get; private set; } = "{}";
    public PostKind PostKind { get; private set; } = PostKind.Article;
    public string OwnerId { get; private set; } = "";
    public PostState State { get; private set; }
    public int Version { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public DateTimeOffset? SubmittedAt { get; private set; }
    public string? AcceptedBy { get; private set; }
    public DateTimeOffset? AcceptedAt { get; private set; }
    public string? AcceptedShiftId { get; private set; }
    public string? AssigneeId { get; private set; }
    /// <summary>The shift the assignment was made in (informational; access itself comes from the assignee's grants).</summary>
    public string? AssignedShiftId { get; private set; }
    public string? ReviewerId { get; private set; }
    public int? ApprovedVersion { get; private set; }
    public DateTimeOffset? ScheduledFor { get; private set; }
    public string? ScheduledBy { get; private set; }
    public int? ScheduledVersion { get; private set; }
    public DateTimeOffset? PublishedAt { get; private set; }
    public string? PublishedBy { get; private set; }
    /// <summary>Snapshot of the live version, retained when a later edit waits for Desk approval.</summary>
    public string? PublishedTitle { get; private set; }
    public string? PublishedBody { get; private set; }
    /// <summary>Immutable document snapshot for the currently published version.</summary>
    public string? PublishedDocumentJson { get; private set; }
    /// <summary>Set when unfinished work moved to the next shift's queue at check-out.</summary>
    public string? TransferredFromShift { get; private set; }

    public IReadOnlyList<PostEvent> History => _history;

    /// <summary>The grant scopes of this Post: its press and its category.</summary>
    public IReadOnlyCollection<string> Scopes => [$"press:{PressId}", $"category:{CategoryId}"];

    public static Post Create(string ownerId, Category category, string title, string body, DateTimeOffset now, PostKind postKind = PostKind.Article,
        PostDocument? document = null)
    {
        if (!Enum.IsDefined(postKind)) throw new DomainException($"Unsupported postKind '{postKind}'.");
        var post = new Post
        {
            OwnerId = Require(ownerId, "an owner"),
            PublicId = Guid.NewGuid().ToString("N"),
            PressId = category.PressId,
            CategoryId = category.Id,
            PostKind = postKind,
            State = PostState.Draft,
            CreatedAt = now,
            UpdatedAt = now
        };
        post.SetText(title, body);
        post.SetDocument(document ?? PostDocument.FromLegacy(title, body));
        post.Record(ownerId, "created", now, $"{category.PressId}/{category.Id}");
        return post;
    }

    /// <summary>The owner may edit a draft or a returned Post, and a submitted one within the edit window until it is accepted or assigned.</summary>
    public bool OwnerMayEdit(DateTimeOffset now, TimeSpan editWindow) =>
        State is PostState.Draft or PostState.Returned
        || (State == PostState.Submitted && SubmittedAt is { } submitted && now < submitted + editWindow);

    public void EditByOwner(string actor, string title, string body, DateTimeOffset now, TimeSpan editWindow, PostDocument? document = null)
    {
        if (actor != OwnerId) throw new DomainException("Only the owner edits through this path.");
        if (!OwnerMayEdit(now, editWindow))
            throw new DomainException(State == PostState.Submitted
                ? "The edit window after submission has closed; the Post is locked until review sends it back."
                : $"The owner cannot edit a Post that is {State}.");
        Change(actor, "edited", now, () => { SetText(title, body); if (document is not null) SetDocument(document); });
    }

    /// <summary>The assigned reviewer edits during review (the caller has checked the reviewer's shift grant).</summary>
    public void EditInReview(string actor, string title, string body, DateTimeOffset now, PostDocument? document = null)
    {
        if (State != PostState.InReview || AssigneeId != actor) throw new DomainException("Only the assigned reviewer edits a Post in review.");
        Change(actor, "edited in review", now, () => { SetText(title, body); if (document is not null) SetDocument(document); });
    }

    /// <summary>Desk edits an approved or scheduled Post: any schedule is cancelled and Desk must re-approve.</summary>
    public void EditByDesk(string actor, string title, string body, DateTimeOffset now, PostDocument? document = null)
    {
        if (State is not (PostState.Approved or PostState.Scheduled or PostState.AwaitingDeskReapproval or PostState.Published))
            throw new DomainException($"Desk edits approved or scheduled Posts, not {State} ones.");
        Change(actor, State == PostState.Scheduled ? "edited; schedule cancelled" : State == PostState.Published
            ? "edited after publication; live version retained" : "edited by desk", now, () =>
        {
            SetText(title, body);
            if (document is not null) SetDocument(document);
            ClearSchedule();
            State = PostState.AwaitingDeskReapproval;
        });
    }

    public void Submit(string actor, DateTimeOffset now)
    {
        if (actor != OwnerId) throw new DomainException("Only the owner submits a Post.");
        Expect("submit", PostState.Draft, PostState.Returned);
        Change(actor, "submitted", now, () =>
        {
            State = PostState.Submitted;
            SubmittedAt = now;
        });
    }

    /// <summary>The shift manager accepts the submission: the owner is locked out from now on.</summary>
    public void Accept(string actor, string shiftId, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(shiftId)) throw new DomainException("Accepting a submission requires its active shift id.");
        Expect("accept", PostState.Submitted);
        Change(actor, "accepted", now, () =>
        {
            State = PostState.Accepted;
            AcceptedBy = actor;
            AcceptedAt = now;
            AcceptedShiftId = shiftId;
        });
    }

    /// <summary>Assigns a reviewer (the manager, or the workflow after the manager's delay). Locks the owner out.</summary>
    public void Assign(string actor, string assigneeId, string? shiftId, DateTimeOffset now)
    {
        Expect("assign", PostState.Submitted, PostState.Accepted);
        Change(actor, "assigned", now, () =>
        {
            State = PostState.InReview;
            AssigneeId = Require(assigneeId, "an assignee");
            AssignedShiftId = shiftId;
            ReviewerId = null;
        }, $"to {assigneeId}" + (shiftId is null ? "" : $" in shift {shiftId}"));
    }

    public void Approve(string actor, DateTimeOffset now)
    {
        if (State != PostState.InReview || AssigneeId != actor) throw new DomainException("Only the assigned reviewer approves a Post in review.");
        Change(actor, "approved", now, () =>
        {
            State = PostState.Approved;
            ReviewerId = actor;
            ApprovedVersion = Version + 1; // the version this change produces
        });
    }

    /// <summary>Back to the author (Manager or Desk). The owner can edit and submit again.</summary>
    public void Return(string actor, string? reason, DateTimeOffset now)
    {
        Expect("return", PostState.Submitted, PostState.Accepted, PostState.InReview, PostState.Approved,
            PostState.Scheduled, PostState.AwaitingDeskReapproval);
        Change(actor, "returned", now, () =>
        {
            State = PostState.Returned;
            AssigneeId = null;
            AssignedShiftId = null;
            ClearSchedule();
        }, reason);
    }

    /// <summary>Handover: unfinished review work goes back to the queue for the next shift's manager.</summary>
    public void Transfer(string actor, string? fromShift, DateTimeOffset now)
    {
        Expect("transfer", PostState.InReview);
        Change(actor, "transferred", now, () =>
        {
            TransferredFromShift = fromShift ?? AssignedShiftId;
            State = PostState.Accepted;
            AssigneeId = null;
            AssignedShiftId = null;
        }, fromShift);
    }

    /// <summary>Desk schedules the current version; any later edit cancels the schedule.</summary>
    public void Schedule(string actor, DateTimeOffset publishAt, DateTimeOffset now)
    {
        Expect("schedule", PostState.Approved, PostState.AwaitingDeskReapproval, PostState.Scheduled);
        if (publishAt <= now) throw new DomainException("A scheduled publish time must be in the future.");
        Change(actor, "scheduled", now, () =>
        {
            State = PostState.Scheduled;
            ScheduledFor = publishAt;
            ScheduledBy = actor;
            ScheduledVersion = Version + 1;
        }, publishAt.ToString("O"));
    }

    public void Publish(string actor, DateTimeOffset now)
    {
        Expect("publish", PostState.Approved, PostState.AwaitingDeskReapproval, PostState.Scheduled);
        Change(actor, "published", now, MarkPublished(actor, now));
    }

    /// <summary>
    /// Publishes a scheduled Post whose time has come, if it is still the version Desk scheduled (its right was
    /// checked when it was scheduled). False when nothing is due.
    /// </summary>
    public bool PublishIfDue(string actor, DateTimeOffset now)
    {
        if (State != PostState.Scheduled || ScheduledFor is not { } due || due > now || ScheduledVersion != Version) return false;
        Change(actor, "published (scheduled)", now, MarkPublished(ScheduledBy ?? actor, now), $"scheduled by {ScheduledBy}");
        return true;
    }

    private Action MarkPublished(string publisher, DateTimeOffset now) => () =>
    {
        State = PostState.Published;
        PublishedAt = now;
        PublishedBy = publisher;
        PublishedTitle = Title;
        PublishedBody = Body;
        PublishedDocumentJson = DocumentJson;
    };

    private void ClearSchedule()
    {
        ScheduledFor = null;
        ScheduledBy = null;
        ScheduledVersion = null;
    }

    private void SetText(string title, string body)
    {
        if (string.IsNullOrWhiteSpace(title) || title.Trim().Length > 300) throw new DomainException("A Post needs a title (at most 300 characters).");
        Title = title.Trim();
        Body = body ?? "";
    }

    private void SetDocument(PostDocument? document)
    {
        if (document is null) return;
        PostDocumentRules.Validate(document);
        SchemaId = document.SchemaId.Trim();
        SchemaVersion = document.SchemaVersion;
        DocumentJson = JsonSerializer.Serialize(document, PostJson.Options);
    }

    private void Expect(string action, params PostState[] states)
    {
        if (!states.Contains(State)) throw new DomainException($"Cannot {action} a Post that is {State}.");
    }

    private void Change(string actor, string action, DateTimeOffset now, Action apply, string? detail = null)
    {
        apply();
        Version++;
        UpdatedAt = now;
        Record(actor, action, now, detail);
    }

    private void Record(string actor, string action, DateTimeOffset now, string? detail) =>
        _history.Add(new PostEvent(now, actor, action, State, detail));

    private static string Require(string value, string what) =>
        !string.IsNullOrWhiteSpace(value) ? value : throw new DomainException($"A Post needs {what}.");
}

/// <summary>Structural safety checks. Dynamic Fields performs schema-specific validation through its module contract.</summary>
public static class PostDocumentRules
{
    private const int MaxNodes = 500;
    private const int MaxDepth = 12;
    private const int MaxJsonBytes = 2_000_000;

    public static void Validate(PostDocument document)
    {
        if (string.IsNullOrWhiteSpace(document.SchemaId) || document.SchemaId.Length > 128)
            throw new DomainException("A Post document needs a schema id (at most 128 characters).");
        if (document.SchemaVersion < 1) throw new DomainException("A Post schema version must be positive.");
        RequireObject(document.Content, "Content");
        RequireObject(document.Style, "Style");
        var count = 0;
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var child in document.Children ?? []) ValidateNode(child, 1, ids, ref count);
        if (JsonSerializer.SerializeToUtf8Bytes(document, PostJson.Options).Length > MaxJsonBytes)
            throw new DomainException("The Post document exceeds the 2 MB limit.");
    }

    private static void ValidateNode(PostNode node, int depth, HashSet<string> ids, ref int count)
    {
        if (++count > MaxNodes) throw new DomainException($"A Post can contain at most {MaxNodes} nested nodes.");
        if (depth > MaxDepth) throw new DomainException($"Post composition nesting cannot exceed {MaxDepth} levels.");
        if (string.IsNullOrWhiteSpace(node.NodeId) || node.NodeId.Length > 64)
            throw new DomainException("Every Post node needs a node id (at most 64 characters).");
        if (!ids.Add(node.NodeId)) throw new DomainException($"Post node id '{node.NodeId}' is duplicated.");
        if (!Enum.IsDefined(node.PostKind)) throw new DomainException($"Unsupported postKind '{node.PostKind}'.");
        if (string.IsNullOrWhiteSpace(node.SchemaId) || node.SchemaId.Length > 128 || node.SchemaVersion < 1)
            throw new DomainException("Every Post node needs a valid schema id and positive version.");
        RequireObject(node.Content, "Node Content");
        RequireObject(node.Style, "Node Style");
        foreach (var child in node.Children ?? []) ValidateNode(child, depth + 1, ids, ref count);
    }

    private static void RequireObject(JsonElement value, string name)
    {
        if (value.ValueKind != JsonValueKind.Object) throw new DomainException($"{name} must be a JSON object.");
    }
}

internal static class PostJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
}

/// <summary>One entry of a Post's audit trail: who did what, when, and the state it led to.</summary>
public sealed class PostEvent : EntityBase<int>
{
    private PostEvent() { } // EF Core

    public PostEvent(DateTimeOffset at, string actor, string action, PostState state, string? detail)
    {
        At = at;
        Actor = actor;
        Action = action;
        State = state;
        Detail = detail;
    }

    public DateTimeOffset At { get; private set; }
    public string Actor { get; private set; } = "";
    public string Action { get; private set; } = "";
    public PostState State { get; private set; }
    public string? Detail { get; private set; }
}
