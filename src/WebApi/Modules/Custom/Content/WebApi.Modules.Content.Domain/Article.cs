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
[JsonConverter(typeof(JsonStringEnumConverter<ArticleState>))]
public enum ArticleState { Draft, Submitted, Accepted, InReview, Returned, Approved, Scheduled, AwaitingDeskReapproval, Published }

/// <summary>
/// An article of one press and category (aggregate root). The aggregate enforces the state rules; who may call each
/// operation (grants, scopes, shifts) is decided in the application layer. Every change bumps <see cref="Version"/>
/// (optimistic concurrency: the second of two racing assignments gets a conflict) and is recorded in <see cref="History"/>.
/// </summary>
public sealed class Article : AggregateRoot<int>, ITenantOwned
{
    private readonly List<ArticleEvent> _history = [];

    private Article() { } // EF Core

    public string TenantId { get; set; } = "";
    public string PressId { get; private set; } = "";
    public string CategoryId { get; private set; } = "";
    public string Title { get; private set; } = "";
    public string Body { get; private set; } = "";
    public string OwnerId { get; private set; } = "";
    public ArticleState State { get; private set; }
    public int Version { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public DateTimeOffset? SubmittedAt { get; private set; }
    public string? AcceptedBy { get; private set; }
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
    /// <summary>Set when unfinished work moved to the next shift's queue at check-out.</summary>
    public string? TransferredFromShift { get; private set; }

    public IReadOnlyList<ArticleEvent> History => _history;

    /// <summary>The grant scopes of this article: its press and its category.</summary>
    public IReadOnlyCollection<string> Scopes => [$"press:{PressId}", $"category:{CategoryId}"];

    public static Article Create(string ownerId, Category category, string title, string body, DateTimeOffset now)
    {
        var article = new Article
        {
            OwnerId = Require(ownerId, "an owner"),
            PressId = category.PressId,
            CategoryId = category.Id,
            State = ArticleState.Draft,
            CreatedAt = now,
            UpdatedAt = now
        };
        article.SetText(title, body);
        article.Record(ownerId, "created", now, $"{category.PressId}/{category.Id}");
        return article;
    }

    /// <summary>The owner may edit a draft or a returned article, and a submitted one within the edit window until it is accepted or assigned.</summary>
    public bool OwnerMayEdit(DateTimeOffset now, TimeSpan editWindow) =>
        State is ArticleState.Draft or ArticleState.Returned
        || (State == ArticleState.Submitted && SubmittedAt is { } submitted && now < submitted + editWindow);

    public void EditByOwner(string actor, string title, string body, DateTimeOffset now, TimeSpan editWindow)
    {
        if (actor != OwnerId) throw new DomainException("Only the owner edits through this path.");
        if (!OwnerMayEdit(now, editWindow))
            throw new DomainException(State == ArticleState.Submitted
                ? "The edit window after submission has closed; the article is locked until review sends it back."
                : $"The owner cannot edit an article that is {State}.");
        Change(actor, "edited", now, () => SetText(title, body));
    }

    /// <summary>The assigned reviewer edits during review (the caller has checked the reviewer's shift grant).</summary>
    public void EditInReview(string actor, string title, string body, DateTimeOffset now)
    {
        if (State != ArticleState.InReview || AssigneeId != actor) throw new DomainException("Only the assigned reviewer edits an article in review.");
        Change(actor, "edited in review", now, () => SetText(title, body));
    }

    /// <summary>Desk edits an approved or scheduled article: any schedule is cancelled and Desk must re-approve.</summary>
    public void EditByDesk(string actor, string title, string body, DateTimeOffset now)
    {
        if (State is not (ArticleState.Approved or ArticleState.Scheduled or ArticleState.AwaitingDeskReapproval))
            throw new DomainException($"Desk edits approved or scheduled articles, not {State} ones.");
        Change(actor, State == ArticleState.Scheduled ? "edited; schedule cancelled" : "edited by desk", now, () =>
        {
            SetText(title, body);
            ClearSchedule();
            State = ArticleState.AwaitingDeskReapproval;
        });
    }

    public void Submit(string actor, DateTimeOffset now)
    {
        if (actor != OwnerId) throw new DomainException("Only the owner submits an article.");
        Expect("submit", ArticleState.Draft, ArticleState.Returned);
        Change(actor, "submitted", now, () =>
        {
            State = ArticleState.Submitted;
            SubmittedAt = now;
        });
    }

    /// <summary>The shift manager accepts the submission: the owner is locked out from now on.</summary>
    public void Accept(string actor, DateTimeOffset now)
    {
        Expect("accept", ArticleState.Submitted);
        Change(actor, "accepted", now, () =>
        {
            State = ArticleState.Accepted;
            AcceptedBy = actor;
        });
    }

    /// <summary>Assigns a reviewer (the manager, or the workflow after the manager's delay). Locks the owner out.</summary>
    public void Assign(string actor, string assigneeId, string? shiftId, DateTimeOffset now)
    {
        Expect("assign", ArticleState.Submitted, ArticleState.Accepted);
        Change(actor, "assigned", now, () =>
        {
            State = ArticleState.InReview;
            AssigneeId = Require(assigneeId, "an assignee");
            AssignedShiftId = shiftId;
            ReviewerId = null;
        }, $"to {assigneeId}" + (shiftId is null ? "" : $" in shift {shiftId}"));
    }

    public void Approve(string actor, DateTimeOffset now)
    {
        if (State != ArticleState.InReview || AssigneeId != actor) throw new DomainException("Only the assigned reviewer approves an article in review.");
        Change(actor, "approved", now, () =>
        {
            State = ArticleState.Approved;
            ReviewerId = actor;
            ApprovedVersion = Version + 1; // the version this change produces
        });
    }

    /// <summary>Back to the author (Manager or Desk). The owner can edit and submit again.</summary>
    public void Return(string actor, string? reason, DateTimeOffset now)
    {
        Expect("return", ArticleState.Submitted, ArticleState.Accepted, ArticleState.InReview, ArticleState.Approved,
            ArticleState.Scheduled, ArticleState.AwaitingDeskReapproval);
        Change(actor, "returned", now, () =>
        {
            State = ArticleState.Returned;
            AssigneeId = null;
            AssignedShiftId = null;
            ClearSchedule();
        }, reason);
    }

    /// <summary>Handover: unfinished review work goes back to the queue for the next shift's manager.</summary>
    public void Transfer(string actor, string? fromShift, DateTimeOffset now)
    {
        Expect("transfer", ArticleState.InReview);
        Change(actor, "transferred", now, () =>
        {
            TransferredFromShift = fromShift ?? AssignedShiftId;
            State = ArticleState.Accepted;
            AssigneeId = null;
            AssignedShiftId = null;
        }, fromShift);
    }

    /// <summary>Desk schedules the current version; any later edit cancels the schedule.</summary>
    public void Schedule(string actor, DateTimeOffset publishAt, DateTimeOffset now)
    {
        Expect("schedule", ArticleState.Approved, ArticleState.AwaitingDeskReapproval, ArticleState.Scheduled);
        if (publishAt <= now) throw new DomainException("A scheduled publish time must be in the future.");
        Change(actor, "scheduled", now, () =>
        {
            State = ArticleState.Scheduled;
            ScheduledFor = publishAt;
            ScheduledBy = actor;
            ScheduledVersion = Version + 1;
        }, publishAt.ToString("O"));
    }

    public void Publish(string actor, DateTimeOffset now)
    {
        Expect("publish", ArticleState.Approved, ArticleState.AwaitingDeskReapproval, ArticleState.Scheduled);
        Change(actor, "published", now, MarkPublished(actor, now));
    }

    /// <summary>
    /// Publishes a scheduled article whose time has come, if it is still the version Desk scheduled (its right was
    /// checked when it was scheduled). False when nothing is due.
    /// </summary>
    public bool PublishIfDue(string actor, DateTimeOffset now)
    {
        if (State != ArticleState.Scheduled || ScheduledFor is not { } due || due > now || ScheduledVersion != Version) return false;
        Change(actor, "published (scheduled)", now, MarkPublished(ScheduledBy ?? actor, now), $"scheduled by {ScheduledBy}");
        return true;
    }

    private Action MarkPublished(string publisher, DateTimeOffset now) => () =>
    {
        State = ArticleState.Published;
        PublishedAt = now;
        PublishedBy = publisher;
    };

    private void ClearSchedule()
    {
        ScheduledFor = null;
        ScheduledBy = null;
        ScheduledVersion = null;
    }

    private void SetText(string title, string body)
    {
        if (string.IsNullOrWhiteSpace(title) || title.Trim().Length > 300) throw new DomainException("An article needs a title (at most 300 characters).");
        Title = title.Trim();
        Body = body ?? "";
    }

    private void Expect(string action, params ArticleState[] states)
    {
        if (!states.Contains(State)) throw new DomainException($"Cannot {action} an article that is {State}.");
    }

    private void Change(string actor, string action, DateTimeOffset now, Action apply, string? detail = null)
    {
        apply();
        Version++;
        UpdatedAt = now;
        Record(actor, action, now, detail);
    }

    private void Record(string actor, string action, DateTimeOffset now, string? detail) =>
        _history.Add(new ArticleEvent(now, actor, action, State, detail));

    private static string Require(string value, string what) =>
        !string.IsNullOrWhiteSpace(value) ? value : throw new DomainException($"An article needs {what}.");
}

/// <summary>One entry of an article's audit trail: who did what, when, and the state it led to.</summary>
public sealed class ArticleEvent : EntityBase<int>
{
    private ArticleEvent() { } // EF Core

    public ArticleEvent(DateTimeOffset at, string actor, string action, ArticleState state, string? detail)
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
    public ArticleState State { get; private set; }
    public string? Detail { get; private set; }
}
