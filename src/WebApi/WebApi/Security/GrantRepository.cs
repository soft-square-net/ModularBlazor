using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using soft.square.net.WebApi.Contracts.Security;
using soft.square.net.WebApi.Data;

namespace soft.square.net.WebApi.Security;

/// <summary>Grant storage with the tenant explicit (the host's own view; modules see the tenant-bound <see cref="IGrantStore"/>).</summary>
internal interface IGrantRepository
{
    Task<IReadOnlyList<AccessGrant>> ListAsync(string tenantId, string? userId, string? source, CancellationToken ct);
    Task AddAsync(AccessGrant grant, CancellationToken ct);
    /// <summary>The removed grant's user, or null when there was none.</summary>
    Task<string?> RemoveAsync(string tenantId, Guid id, CancellationToken ct);
    Task<int> EndAsync(string tenantId, string userId, string source, DateTimeOffset at, CancellationToken ct);
    /// <summary>Replaces a source's grants; returns the users whose grants changed (old and new).</summary>
    Task<IReadOnlyCollection<string>> ReplaceSourceAsync(string tenantId, string source, IReadOnlyCollection<AccessGrant> grants, CancellationToken ct);
}

/// <summary>Grants in the tenant store (<c>platform.access_grants</c>), migrated with the store on startup.</summary>
internal sealed class EfGrantRepository(TenantStoreDbContext db) : IGrantRepository
{
    public async Task<IReadOnlyList<AccessGrant>> ListAsync(string tenantId, string? userId, string? source, CancellationToken ct)
    {
        var query = db.AccessGrants.AsNoTracking().Where(g => g.TenantId == tenantId);
        if (userId is not null) query = query.Where(g => g.UserId == userId);
        if (source is not null) query = query.Where(g => g.Source == source);
        return (await query.ToListAsync(ct)).Select(ToGrant).OrderBy(g => g.UserId).ThenBy(g => g.Permission).ToArray();
    }

    public async Task AddAsync(AccessGrant grant, CancellationToken ct)
    {
        db.AccessGrants.Add(ToRecord(grant));
        await db.SaveChangesAsync(ct);
    }

    public async Task<string?> RemoveAsync(string tenantId, Guid id, CancellationToken ct)
    {
        var record = await db.AccessGrants.FirstOrDefaultAsync(g => g.TenantId == tenantId && g.Id == id, ct);
        if (record is null) return null;
        db.AccessGrants.Remove(record);
        await db.SaveChangesAsync(ct);
        return record.UserId;
    }

    public async Task<int> EndAsync(string tenantId, string userId, string source, DateTimeOffset at, CancellationToken ct)
    {
        var records = await db.AccessGrants
            .Where(g => g.TenantId == tenantId && g.UserId == userId && g.Source == source)
            .ToListAsync(ct);
        var ended = 0;
        foreach (var record in records.Where(r => r.ValidTo is null || r.ValidTo > at))
        {
            record.ValidTo = at;
            ended++;
        }
        await db.SaveChangesAsync(ct);
        return ended;
    }

    public async Task<IReadOnlyCollection<string>> ReplaceSourceAsync(string tenantId, string source, IReadOnlyCollection<AccessGrant> grants, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var old = await db.AccessGrants.Where(g => g.TenantId == tenantId && g.Source == source).ToListAsync(ct);
        db.AccessGrants.RemoveRange(old);
        db.AccessGrants.AddRange(grants.Select(ToRecord));
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return old.Select(g => g.UserId).Concat(grants.Select(g => g.UserId)).Distinct(StringComparer.Ordinal).ToArray();
    }

    private static AccessGrant ToGrant(AccessGrantRecord r) =>
        new(r.Id, r.TenantId, r.UserId, r.Permission, r.Scope, r.ValidFrom, r.ValidTo, r.Source, r.CreatedAt, r.CreatedBy);

    private static AccessGrantRecord ToRecord(AccessGrant g) => new()
    {
        Id = g.Id, TenantId = g.TenantId, UserId = g.UserId, Permission = g.Permission, Scope = g.Scope,
        ValidFrom = g.ValidFrom, ValidTo = g.ValidTo, Source = g.Source, CreatedAt = g.CreatedAt, CreatedBy = g.CreatedBy
    };
}

/// <summary>
/// Without a tenant store (a single local instance): grants live in memory, seeded from
/// <c>Access:Grants:N:{Tenant, UserId, Permission, Scope}</c>. Writes are lost on restart and not shared.
/// </summary>
internal sealed class InMemoryGrantRepository : IGrantRepository
{
    private readonly ConcurrentDictionary<Guid, AccessGrant> _grants = new();

    public InMemoryGrantRepository(IConfiguration configuration)
    {
        foreach (var section in configuration.GetSection("Access:Grants").GetChildren())
        {
            var grant = new AccessGrant(Guid.NewGuid(), section["Tenant"] ?? "", section["UserId"] ?? "", section["Permission"] ?? "",
                section["Scope"] ?? AccessScope.Tenant, null, null, section["Source"] ?? GrantSources.Standing, DateTimeOffset.UtcNow, "configuration");
            if (grant.TenantId.Length > 0 && grant.UserId.Length > 0 && grant.Permission.Length > 0) _grants[grant.Id] = grant;
        }
    }

    public Task<IReadOnlyList<AccessGrant>> ListAsync(string tenantId, string? userId, string? source, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<AccessGrant>>(_grants.Values
            .Where(g => g.TenantId == tenantId && (userId is null || g.UserId == userId) && (source is null || g.Source == source))
            .OrderBy(g => g.UserId).ThenBy(g => g.Permission).ToArray());

    public Task AddAsync(AccessGrant grant, CancellationToken ct)
    {
        _grants[grant.Id] = grant;
        return Task.CompletedTask;
    }

    public Task<string?> RemoveAsync(string tenantId, Guid id, CancellationToken ct) =>
        Task.FromResult(_grants.TryGetValue(id, out var grant) && grant.TenantId == tenantId && _grants.TryRemove(id, out _) ? grant.UserId : null);

    public Task<int> EndAsync(string tenantId, string userId, string source, DateTimeOffset at, CancellationToken ct)
    {
        var ended = 0;
        foreach (var grant in _grants.Values.Where(g => g.TenantId == tenantId && g.UserId == userId && g.Source == source && (g.ValidTo is null || g.ValidTo > at)))
        {
            _grants[grant.Id] = grant with { ValidTo = at };
            ended++;
        }
        return Task.FromResult(ended);
    }

    public Task<IReadOnlyCollection<string>> ReplaceSourceAsync(string tenantId, string source, IReadOnlyCollection<AccessGrant> grants, CancellationToken ct)
    {
        var old = _grants.Values.Where(g => g.TenantId == tenantId && g.Source == source).ToArray();
        foreach (var grant in old) _grants.TryRemove(grant.Id, out _);
        foreach (var grant in grants) _grants[grant.Id] = grant;
        return Task.FromResult<IReadOnlyCollection<string>>(old.Select(g => g.UserId).Concat(grants.Select(g => g.UserId)).Distinct().ToArray());
    }
}
