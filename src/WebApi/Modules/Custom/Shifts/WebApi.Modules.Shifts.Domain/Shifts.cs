using System.Text.Json.Serialization;
using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.WebApi.Modules.Shifts.Domain;

/// <summary>
/// A shift section: the desk that manages a set of categories (possibly of several presses). Its categories become
/// the scopes of the rota's grants. Optional overrides of the module's settings apply to its shifts.
/// </summary>
public sealed class Section : AggregateRoot<int>, ITenantOwned
{
    private readonly List<SectionCategory> _categories = [];

    private Section() { } // EF Core

    public string TenantId { get; set; } = "";
    public string Name { get; private set; } = "";
    /// <summary>Override of the manager's assignment delay before the workflow assigns on its own (minutes).</summary>
    public int? AutoAssignDelayMinutes { get; private set; }
    /// <summary>Override of the grace period before an un-checked-out shift is checked out automatically (minutes).</summary>
    public int? CheckoutGraceMinutes { get; private set; }

    public IReadOnlyList<SectionCategory> Categories => _categories;

    public static Section Create(string name, IEnumerable<string> categoryIds, int? autoAssignDelayMinutes, int? checkoutGraceMinutes)
    {
        var section = new Section();
        section.Update(name, categoryIds, autoAssignDelayMinutes, checkoutGraceMinutes);
        return section;
    }

    public void Update(string name, IEnumerable<string> categoryIds, int? autoAssignDelayMinutes, int? checkoutGraceMinutes)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 200) throw new DomainException("A section needs a name (at most 200 characters).");
        var ids = categoryIds.Where(c => !string.IsNullOrWhiteSpace(c)).Select(c => c.Trim()).Distinct().ToArray();
        if (ids.Length == 0) throw new DomainException("A section covers at least one category.");
        if (autoAssignDelayMinutes is < 0 || checkoutGraceMinutes is < 0) throw new DomainException("Delays cannot be negative.");

        Name = name.Trim();
        AutoAssignDelayMinutes = autoAssignDelayMinutes;
        CheckoutGraceMinutes = checkoutGraceMinutes;
        _categories.RemoveAll(c => !ids.Contains(c.CategoryId));
        foreach (var id in ids.Where(id => _categories.All(c => c.CategoryId != id))) _categories.Add(new SectionCategory(id));
    }

    /// <summary>The grant scopes the section covers (<c>category:{id}</c>).</summary>
    public IReadOnlyList<string> Scopes => _categories.Select(c => $"category:{c.CategoryId}").ToArray();
}

public sealed class SectionCategory : EntityBase<int>
{
    private SectionCategory() { } // EF Core

    public SectionCategory(string categoryId) => CategoryId = categoryId;

    public string CategoryId { get; private set; } = "";
}

[JsonConverter(typeof(JsonStringEnumConverter<ShiftRole>))]
public enum ShiftRole { Manager, Desk, Editor }

/// <summary>
/// A shift of one section on the clock (UTC) with its rota. Once published, every member's grants are written from
/// it (shifts module → <c>IGrantStore</c>, source <c>shift:{id}</c>); they are valid from the start to the member's
/// effective end: the scheduled end, or earlier when the member or the whole shift checked out.
/// </summary>
public sealed class Shift : AggregateRoot<int>, ITenantOwned
{
    private readonly List<ShiftMember> _members = [];

    private Shift() { } // EF Core

    public string TenantId { get; set; } = "";
    public int SectionId { get; private set; }
    public DateTimeOffset StartsAt { get; private set; }
    public DateTimeOffset EndsAt { get; private set; }
    public bool Published { get; private set; }
    public DateTimeOffset? CheckedOutAt { get; private set; }
    public string? CheckedOutBy { get; private set; }

    public IReadOnlyList<ShiftMember> Members => _members;

    /// <summary>The grant source of this shift's rota.</summary>
    public string GrantSource => $"shift:{Id}";

    public static Shift Create(int sectionId, DateTimeOffset startsAt, DateTimeOffset endsAt, IEnumerable<(string UserId, ShiftRole Role)> rota)
    {
        var shift = new Shift { SectionId = sectionId };
        shift.Reschedule(startsAt, endsAt);
        shift.SetRota(rota);
        return shift;
    }

    public void Reschedule(DateTimeOffset startsAt, DateTimeOffset endsAt)
    {
        if (CheckedOutAt is not null) throw new DomainException("The shift is checked out.");
        startsAt = startsAt.ToUniversalTime();
        endsAt = endsAt.ToUniversalTime();
        if (endsAt <= startsAt) throw new DomainException("A shift ends after it starts.");
        if (endsAt - startsAt > TimeSpan.FromHours(24)) throw new DomainException("A shift lasts at most 24 hours.");
        StartsAt = startsAt;
        EndsAt = endsAt;
    }

    /// <summary>Replaces the rota. A person may hold several roles; a shift needs exactly one manager.</summary>
    public void SetRota(IEnumerable<(string UserId, ShiftRole Role)> rota)
    {
        if (CheckedOutAt is not null) throw new DomainException("The shift is checked out.");
        var entries = rota.Where(r => !string.IsNullOrWhiteSpace(r.UserId)).Select(r => (UserId: r.UserId.Trim(), r.Role)).Distinct().ToArray();
        if (entries.Count(e => e.Role == ShiftRole.Manager) != 1) throw new DomainException("A shift has exactly one manager.");
        _members.RemoveAll(m => !entries.Contains((m.UserId, m.Role)));
        foreach (var entry in entries.Where(e => !_members.Any(m => m.UserId == e.UserId && m.Role == e.Role)))
            _members.Add(new ShiftMember(entry.UserId, entry.Role));
    }

    public void Publish() => Published = true;

    public bool IsRunning(DateTimeOffset now) => CheckedOutAt is null && StartsAt <= now && now < EndsAt;

    public bool IsManager(string userId) => _members.Any(m => m.UserId == userId && m.Role == ShiftRole.Manager);

    /// <summary>One member leaves early: their grants end now.</summary>
    public void CheckOutMember(string userId, DateTimeOffset now)
    {
        var members = _members.Where(m => m.UserId == userId && m.CheckedOutAt is null).ToArray();
        if (members.Length == 0) throw new DomainException($"'{userId}' is not on this shift, or has checked out already.");
        if (now < StartsAt) throw new DomainException("The shift has not started yet.");
        foreach (var member in members) member.CheckOut(now < EndsAt ? now : EndsAt);
    }

    /// <summary>The whole shift checks out (the manager at handover, or the workflow after the grace period): every grant ends now.</summary>
    public void CheckOut(string actor, DateTimeOffset now)
    {
        if (CheckedOutAt is not null) throw new DomainException("The shift is checked out already.");
        if (now < StartsAt) throw new DomainException("The shift has not started yet.");
        CheckedOutAt = now < EndsAt ? now : EndsAt;
        CheckedOutBy = actor;
    }

    /// <summary>When a member's access ends: the scheduled end, or earlier on check-out.</summary>
    public DateTimeOffset EndOf(ShiftMember member) =>
        new[] { EndsAt, member.CheckedOutAt ?? EndsAt, CheckedOutAt ?? EndsAt }.Min();
}

public sealed class ShiftMember : EntityBase<int>
{
    private ShiftMember() { } // EF Core

    public ShiftMember(string userId, ShiftRole role)
    {
        UserId = userId;
        Role = role;
    }

    public string UserId { get; private set; } = "";
    public ShiftRole Role { get; private set; }
    public DateTimeOffset? CheckedOutAt { get; private set; }

    internal void CheckOut(DateTimeOffset at) => CheckedOutAt = at;
}
