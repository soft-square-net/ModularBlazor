using Ardalis.Specification;
using Microsoft.Extensions.Options;
using soft.square.net.WebApi.Contracts.Security;
using soft.square.net.WebApi.Modules.Shifts.Domain;
using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.WebApi.Modules.Shifts.Application;

public static class ShiftPermissions
{
    public const string View = "shifts.view";
    public const string Manage = "shifts.manage";

    public static IReadOnlyList<PermissionDefinition> All { get; } =
    [
        new(View, "See sections, shifts and rotas."),
        new(Manage, "Manage sections, plan and publish shifts, check shifts out.")
    ];
}

/// <summary>
/// What each rota role grants for the section's categories while the shift runs. The permission names belong to the
/// content module (see its ContentPermissions); they are plain strings, so neither module references the other.
/// </summary>
public static class RoleTemplates
{
    public static IReadOnlyDictionary<ShiftRole, string[]> Permissions { get; } = new Dictionary<ShiftRole, string[]>
    {
        [ShiftRole.Manager] = ["content.accept", "content.assign", "content.transfer", "content.return"],
        [ShiftRole.Desk] = ["content.publish", "content.return"],
        [ShiftRole.Editor] = ["content.review"]
    };
}

/// <summary>Module settings (section <c>Shifts</c>); sections may override them.</summary>
public sealed class ShiftOptions
{
    /// <summary>How long the manager has to assign an accepted article before the workflow assigns it. Default 5 minutes.</summary>
    public TimeSpan AutoAssignDelay { get; set; } = TimeSpan.FromMinutes(5);
    /// <summary>How long after its scheduled end a shift that nobody checked out is checked out automatically. Default 15 minutes.</summary>
    public TimeSpan CheckoutGrace { get; set; } = TimeSpan.FromMinutes(15);
}

public sealed class ShiftAccessDeniedException(string message) : Exception(message);

public sealed class ShiftNotFoundException(string message) : Exception(message);

public sealed record SectionRequest(string Name, IReadOnlyList<string> Categories, int? AutoAssignDelayMinutes, int? CheckoutGraceMinutes);

public sealed record SectionDto(int Id, string Name, IReadOnlyList<string> Categories, int? AutoAssignDelayMinutes, int? CheckoutGraceMinutes);

public sealed record SectionSettings(int SectionId, TimeSpan AutoAssignDelay, TimeSpan CheckoutGrace);

public sealed record RotaEntry(string UserId, ShiftRole Role);

public sealed record ShiftRequest(int SectionId, DateTimeOffset StartsAt, DateTimeOffset EndsAt, IReadOnlyList<RotaEntry> Rota);

public sealed record RotaMemberDto(string UserId, ShiftRole Role, DateTimeOffset? CheckedOutAt, DateTimeOffset AccessEnds);

public sealed record ShiftDto(int Id, int SectionId, string Section, IReadOnlyList<string> Categories, DateTimeOffset StartsAt, DateTimeOffset EndsAt,
    bool Published, bool Running, DateTimeOffset? CheckedOutAt, string? CheckedOutBy, string GrantSource, IReadOnlyList<RotaMemberDto> Rota);

public sealed class SectionWithCategoriesSpec : Specification<Section>
{
    public SectionWithCategoriesSpec(int? id = null)
    {
        if (id is { } sectionId) Query.Where(s => s.Id == sectionId);
        Query.Include(s => s.Categories);
    }
}

public sealed class ShiftsSpec : Specification<Shift>
{
    public ShiftsSpec(int? id = null, int? sectionId = null, DateTimeOffset? from = null, DateTimeOffset? to = null, string? memberId = null,
        bool? overdueAt = null, DateTimeOffset? now = null)
    {
        if (id is { } shiftId) Query.Where(s => s.Id == shiftId);
        if (sectionId is { } section) Query.Where(s => s.SectionId == section);
        if (from is { } start) Query.Where(s => s.EndsAt > start);
        if (to is { } end) Query.Where(s => s.StartsAt < end);
        if (memberId is not null) Query.Where(s => s.Members.Any(m => m.UserId == memberId));
        if (overdueAt == true && now is { } at) Query.Where(s => s.Published && s.CheckedOutAt == null && s.EndsAt <= at);
        Query.Include(s => s.Members).OrderBy(s => s.StartsAt);
    }
}

/// <summary>
/// Sections, shifts and rotas. Publishing a shift (and every later change to it, its rota, a check-out or its
/// section's categories) rewrites the shift's grants in one go: <see cref="IGrantStore.ReplaceSourceAsync"/> with
/// source <c>shift:{id}</c>. Access then starts and ends on the clock: the host evaluates each grant's window per request.
/// </summary>
public sealed class ShiftService(
    IRepository<Section> sections,
    IRepository<Shift> shifts,
    IGrantStore grants,
    IAccessScopes access,
    IOptions<ShiftOptions> options,
    TimeProvider clock)
{
    private DateTimeOffset Now => clock.GetUtcNow();

    private string Me => access.UserId ?? throw new ShiftAccessDeniedException("Sign in first.");

    public async Task<IReadOnlyList<SectionDto>> SectionsAsync(CancellationToken ct) =>
        (await sections.ListAsync(new SectionWithCategoriesSpec(), ct)).OrderBy(s => s.Name).Select(ToDto).ToArray();

    public async Task<SectionDto> AddSectionAsync(SectionRequest request, CancellationToken ct)
    {
        var section = Section.Create(request.Name, request.Categories, request.AutoAssignDelayMinutes, request.CheckoutGraceMinutes);
        await sections.AddAsync(section, ct);
        return ToDto(section);
    }

    /// <summary>Changing the categories rewrites the grants of the section's published shifts that have not ended.</summary>
    public async Task<SectionDto> UpdateSectionAsync(int id, SectionRequest request, CancellationToken ct)
    {
        var section = await SectionAsync(id, ct);
        section.Update(request.Name, request.Categories, request.AutoAssignDelayMinutes, request.CheckoutGraceMinutes);
        await sections.UpdateAsync(section, ct);
        foreach (var shift in await shifts.ListAsync(new ShiftsSpec(sectionId: id, from: Now), ct))
            await WriteGrantsAsync(shift, section, ct);
        return ToDto(section);
    }

    public async Task<SectionSettings> SettingsAsync(int sectionId, CancellationToken ct)
    {
        var section = await SectionAsync(sectionId, ct);
        return new SectionSettings(section.Id,
            section.AutoAssignDelayMinutes is { } delay ? TimeSpan.FromMinutes(delay) : options.Value.AutoAssignDelay,
            section.CheckoutGraceMinutes is { } grace ? TimeSpan.FromMinutes(grace) : options.Value.CheckoutGrace);
    }

    public async Task<IReadOnlyList<ShiftDto>> ShiftsAsync(int? sectionId, DateTimeOffset? from, DateTimeOffset? to, CancellationToken ct) =>
        await ToDtosAsync(await shifts.ListAsync(new ShiftsSpec(sectionId: sectionId, from: from ?? Now.AddDays(-1), to: to ?? Now.AddDays(7)), ct), ct);

    /// <summary>The caller's shifts that have not ended (running and upcoming).</summary>
    public async Task<IReadOnlyList<ShiftDto>> MineAsync(CancellationToken ct) =>
        await ToDtosAsync(await shifts.ListAsync(new ShiftsSpec(memberId: Me, from: Now, to: Now.AddDays(7)), ct), ct);

    /// <summary>Published shifts past their end that nobody checked out (the workflow checks them out after the grace period).</summary>
    public async Task<IReadOnlyList<ShiftDto>> OverdueAsync(CancellationToken ct) =>
        await ToDtosAsync(await shifts.ListAsync(new ShiftsSpec(overdueAt: true, now: Now), ct), ct);

    public async Task<ShiftDto> GetAsync(int id, CancellationToken ct) => (await ToDtosAsync([await ShiftAsync(id, ct)], ct))[0];

    public async Task<ShiftDto> AddShiftAsync(ShiftRequest request, CancellationToken ct)
    {
        await SectionAsync(request.SectionId, ct);
        var shift = Shift.Create(request.SectionId, request.StartsAt, request.EndsAt, request.Rota.Select(r => (r.UserId, r.Role)));
        await shifts.AddAsync(shift, ct);
        return await GetAsync(shift.Id, ct);
    }

    public Task<ShiftDto> UpdateShiftAsync(int id, ShiftRequest request, CancellationToken ct) => ChangeAsync(id, shift =>
    {
        if (shift.SectionId != request.SectionId) throw new DomainException("A shift cannot move to another section; delete it and plan a new one.");
        shift.Reschedule(request.StartsAt, request.EndsAt);
        shift.SetRota(request.Rota.Select(r => (r.UserId, r.Role)));
    }, ct);

    /// <summary>Writes the rota's grants; from now on the members' rights follow the shift's clock.</summary>
    public Task<ShiftDto> PublishAsync(int id, CancellationToken ct) => ChangeAsync(id, shift => shift.Publish(), ct);

    /// <summary>The whole shift checks out: the shift's manager while it runs, or a shift admin (the workflow after the grace period).</summary>
    public Task<ShiftDto> CheckOutAsync(int id, CancellationToken ct) => ChangeAsync(id, async shift =>
    {
        if (!(shift.IsManager(Me) && shift.IsRunning(Now)) && !await access.HasPermissionAsync(ShiftPermissions.Manage, ct))
            throw new ShiftAccessDeniedException("Only the shift's manager (while it runs) or a shift admin checks a shift out.");
        shift.CheckOut(Me, Now);
    }, ct);

    /// <summary>One member checks out early: themselves, the shift's manager, or a shift admin.</summary>
    public Task<ShiftDto> CheckOutMemberAsync(int id, string userId, CancellationToken ct) => ChangeAsync(id, async shift =>
    {
        if (userId != Me && !shift.IsManager(Me) && !await access.HasPermissionAsync(ShiftPermissions.Manage, ct))
            throw new ShiftAccessDeniedException("Members check themselves out; the shift's manager or a shift admin can check anyone out.");
        shift.CheckOutMember(userId, Now);
    }, ct);

    /// <summary>Deletes a shift and its grants.</summary>
    public async Task DeleteAsync(int id, CancellationToken ct)
    {
        var shift = await ShiftAsync(id, ct);
        await grants.ReplaceSourceAsync(shift.GrantSource, [], ct);
        await shifts.DeleteAsync(shift, ct);
    }

    private Task<ShiftDto> ChangeAsync(int id, Action<Shift> change, CancellationToken ct) =>
        ChangeAsync(id, shift => { change(shift); return Task.CompletedTask; }, ct);

    private async Task<ShiftDto> ChangeAsync(int id, Func<Shift, Task> change, CancellationToken ct)
    {
        var shift = await ShiftAsync(id, ct);
        await change(shift);
        await shifts.UpdateAsync(shift, ct);
        await WriteGrantsAsync(shift, await SectionAsync(shift.SectionId, ct), ct);
        return await GetAsync(id, ct);
    }

    /// <summary>The rota as grants: each member's role permissions × the section's categories, valid from the start to the member's end.</summary>
    private Task WriteGrantsAsync(Shift shift, Section section, CancellationToken ct)
    {
        if (!shift.Published) return Task.CompletedTask;
        var rows = shift.Members
            .Where(m => shift.EndOf(m) > shift.StartsAt)
            .SelectMany(m => RoleTemplates.Permissions[m.Role].SelectMany(permission => section.Scopes.Select(scope =>
                new NewGrant(m.UserId, permission, scope, shift.StartsAt, shift.EndOf(m)))))
            .Distinct()
            .ToArray();
        return grants.ReplaceSourceAsync(shift.GrantSource, rows, ct);
    }

    private async Task<Section> SectionAsync(int id, CancellationToken ct) =>
        await sections.FirstOrDefaultAsync(new SectionWithCategoriesSpec(id), ct) ?? throw new ShiftNotFoundException($"Section {id} was not found.");

    private async Task<Shift> ShiftAsync(int id, CancellationToken ct) =>
        await shifts.FirstOrDefaultAsync(new ShiftsSpec(id: id), ct) ?? throw new ShiftNotFoundException($"Shift {id} was not found.");

    private async Task<IReadOnlyList<ShiftDto>> ToDtosAsync(IReadOnlyList<Shift> list, CancellationToken ct)
    {
        var bySection = (await sections.ListAsync(new SectionWithCategoriesSpec(), ct)).ToDictionary(s => s.Id);
        var now = Now;
        return list.Select(shift =>
        {
            var section = bySection.GetValueOrDefault(shift.SectionId);
            return new ShiftDto(shift.Id, shift.SectionId, section?.Name ?? "?", section?.Categories.Select(c => c.CategoryId).ToArray() ?? [],
                shift.StartsAt, shift.EndsAt, shift.Published, shift.IsRunning(now), shift.CheckedOutAt, shift.CheckedOutBy, shift.GrantSource,
                shift.Members.OrderBy(m => m.Role).ThenBy(m => m.UserId).Select(m => new RotaMemberDto(m.UserId, m.Role, m.CheckedOutAt, shift.EndOf(m))).ToArray());
        }).ToArray();
    }

    private static SectionDto ToDto(Section s) =>
        new(s.Id, s.Name, s.Categories.Select(c => c.CategoryId).ToArray(), s.AutoAssignDelayMinutes, s.CheckoutGraceMinutes);
}
