using Microsoft.EntityFrameworkCore;
using soft.square.net.WebApi.Contracts.Tenancy;

namespace soft.square.net.WebApi.Data;

/// <summary>A subscription change the rules refuse; <see cref="Kind"/> says how the API answers.</summary>
public sealed class TenantSubscriptionException(TenantSubscriptionException.Reason kind, string message) : Exception(message)
{
    public enum Reason { NotFound, Invalid, Conflict }

    public Reason Kind { get; } = kind;
}

/// <summary>
/// Tenant subscriptions in the tenant store (scoped). Rules: a period has a positive length; a tenant's subscriptions
/// that are not cancelled never overlap; an extension only moves the end later; a cancelled subscription stays as
/// history and no longer counts. Informational: nothing here suspends a tenant.
/// </summary>
public sealed class TenantSubscriptions(TenantStoreDbContext db, TimeProvider clock)
{
    public async Task<IReadOnlyList<TenantSubscription>> ListAsync(string tenantId, CancellationToken ct)
    {
        await RequireTenantAsync(tenantId, ct);
        var now = clock.GetUtcNow();
        var rows = await db.Subscriptions.AsNoTracking().Where(s => s.TenantId == tenantId).ToListAsync(ct);
        return rows.OrderBy(s => s.StartsAt).Select(s => s.ToContract(now)).ToArray();
    }

    public async Task<TenantSubscription> AddAsync(string tenantId, DateTimeOffset startsAt, DateTimeOffset endsAt,
        string? plan, string? notes, string? createdBy, CancellationToken ct)
    {
        await RequireTenantAsync(tenantId, ct);
        RequirePeriod(startsAt, endsAt);
        await RequireNoOverlapAsync(tenantId, null, startsAt, endsAt, ct);

        var record = new TenantSubscriptionRecord
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            StartsAt = startsAt.ToUniversalTime(),
            EndsAt = endsAt.ToUniversalTime(),
            Plan = Blank(plan),
            Notes = Blank(notes),
            CreatedAt = clock.GetUtcNow(),
            CreatedBy = createdBy
        };
        db.Subscriptions.Add(record);
        await db.SaveChangesAsync(ct);
        return record.ToContract(clock.GetUtcNow());
    }

    /// <summary>Moves the end later (a renewal of the same period). Not for cancelled subscriptions.</summary>
    public async Task<TenantSubscription> ExtendAsync(string tenantId, Guid id, DateTimeOffset endsAt, CancellationToken ct)
    {
        var record = await FindAsync(tenantId, id, ct);
        if (record.CancelledAt is not null)
            throw new TenantSubscriptionException(TenantSubscriptionException.Reason.Conflict, "The subscription is cancelled; add a new one instead.");
        if (endsAt <= record.EndsAt)
            throw new TenantSubscriptionException(TenantSubscriptionException.Reason.Invalid, $"The new end must be after the current end ({record.EndsAt:u}).");
        await RequireNoOverlapAsync(tenantId, id, record.StartsAt, endsAt, ct);
        record.EndsAt = endsAt.ToUniversalTime();
        await db.SaveChangesAsync(ct);
        return record.ToContract(clock.GetUtcNow());
    }

    /// <summary>Marks the subscription cancelled: it stays in the history and frees its period for another one.</summary>
    public async Task<TenantSubscription> CancelAsync(string tenantId, Guid id, string? reason, string? cancelledBy, CancellationToken ct)
    {
        var record = await FindAsync(tenantId, id, ct);
        if (record.CancelledAt is not null)
            throw new TenantSubscriptionException(TenantSubscriptionException.Reason.Conflict, "The subscription is cancelled already.");
        record.CancelledAt = clock.GetUtcNow();
        record.CancelledBy = cancelledBy;
        record.CancelReason = Blank(reason);
        await db.SaveChangesAsync(ct);
        return record.ToContract(clock.GetUtcNow());
    }

    /// <summary>
    /// Every tenant with its current and next subscription. <paramref name="endingWithin"/> decides when a covered
    /// tenant counts as ending soon (<see cref="TenantSubscriptionStatus.NeedsAttention"/>).
    /// </summary>
    public async Task<IReadOnlyList<TenantSubscriptionStatus>> ReportAsync(TimeSpan endingWithin, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var tenants = await db.Tenants.AsNoTracking().OrderBy(t => t.Id).ToListAsync(ct);
        var subscriptions = (await db.Subscriptions.AsNoTracking().Where(s => s.CancelledAt == null).ToListAsync(ct))
            .ToLookup(s => s.TenantId);

        return tenants.Select(tenant =>
        {
            var periods = subscriptions[tenant.Id].OrderBy(s => s.StartsAt).ToList();
            var current = periods.FirstOrDefault(s => s.StartsAt <= now && now < s.EndsAt);
            var next = periods.FirstOrDefault(s => s.StartsAt > now);

            // Covered until: follow subscriptions that start exactly where the previous one ends.
            DateTimeOffset? endsAt = current?.EndsAt;
            if (endsAt is not null)
                foreach (var period in periods.Where(s => s.StartsAt > now))
                    if (period.StartsAt <= endsAt) endsAt = period.EndsAt > endsAt ? period.EndsAt : endsAt;
                    else break;

            int? daysLeft = endsAt is { } end ? (int)Math.Floor((end - now).TotalDays) : null;
            var lastEnded = periods.Where(s => s.EndsAt <= now).Select(s => (DateTimeOffset?)s.EndsAt).Max();
            var needsAttention = tenant.Status == TenantStatus.Active && (endsAt is null || endsAt.Value - now <= endingWithin);

            return new TenantSubscriptionStatus(tenant.Id, tenant.Name, tenant.Status, current?.ToContract(now), next?.ToContract(now),
                endsAt, daysLeft, lastEnded, needsAttention);
        }).ToArray();
    }

    private async Task RequireTenantAsync(string tenantId, CancellationToken ct)
    {
        if (!await db.Tenants.AnyAsync(t => t.Id == tenantId, ct))
            throw new TenantSubscriptionException(TenantSubscriptionException.Reason.NotFound, $"Tenant '{tenantId}' does not exist.");
    }

    private async Task<TenantSubscriptionRecord> FindAsync(string tenantId, Guid id, CancellationToken ct) =>
        await db.Subscriptions.FirstOrDefaultAsync(s => s.Id == id && s.TenantId == tenantId, ct)
        ?? throw new TenantSubscriptionException(TenantSubscriptionException.Reason.NotFound, $"Tenant '{tenantId}' has no subscription {id}.");

    private static void RequirePeriod(DateTimeOffset startsAt, DateTimeOffset endsAt)
    {
        if (endsAt <= startsAt)
            throw new TenantSubscriptionException(TenantSubscriptionException.Reason.Invalid, "The end must be after the start.");
    }

    private async Task RequireNoOverlapAsync(string tenantId, Guid? except, DateTimeOffset startsAt, DateTimeOffset endsAt, CancellationToken ct)
    {
        // [a, b) and [c, d) overlap when a < d and c < b. Compared in memory: providers differ on offset comparisons.
        var others = await db.Subscriptions.AsNoTracking()
            .Where(s => s.TenantId == tenantId && s.CancelledAt == null && s.Id != except)
            .ToListAsync(ct);
        var clash = others.Where(s => s.StartsAt < endsAt && startsAt < s.EndsAt).OrderBy(s => s.StartsAt).FirstOrDefault();
        if (clash is not null)
            throw new TenantSubscriptionException(TenantSubscriptionException.Reason.Conflict,
                $"Overlaps subscription {clash.Id} ({clash.StartsAt:u} to {clash.EndsAt:u}).");
    }

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
