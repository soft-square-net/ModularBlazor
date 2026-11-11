using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using soft.square.net.WebApi.Contracts.Tenancy;

namespace soft.square.net.WebApi.Data;

/// <summary>A tenant row in the tenant store (schema "platform", table "tenants").</summary>
public sealed class TenantRecord
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public TenantStatus Status { get; set; } = TenantStatus.Active;
    public List<string> Hosts { get; set; } = [];
    public string DatabaseServer { get; set; } = "";
    public string DatabaseName { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public TenantInfo ToInfo() => new(Id, Name, Status, Hosts.ToArray(), DatabaseServer, DatabaseName);
}

/// <summary>
/// The tenant store: the registry of tenants (ConnectionStrings:TenantStore). Its schema belongs to the host, which
/// reads it on every replica of every pool and migrates it on startup; the tenancy core module writes to it.
/// </summary>
public sealed class TenantStoreDbContext(DbContextOptions<TenantStoreDbContext> options) : DbContext(options)
{
    public const string Schema = "platform";

    public DbSet<TenantRecord> Tenants => Set<TenantRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.Entity<TenantRecord>(tenant =>
        {
            tenant.ToTable("tenants");
            tenant.HasKey(t => t.Id);
            tenant.Property(t => t.Id).HasMaxLength(64);
            tenant.Property(t => t.Name).HasMaxLength(200);
            tenant.Property(t => t.Status).HasConversion<string>().HasMaxLength(20);
            tenant.Property(t => t.DatabaseServer).HasMaxLength(100);
            tenant.Property(t => t.DatabaseName).HasMaxLength(63);
        });
    }

    public static void Configure(DbContextOptionsBuilder options, string connectionString) =>
        options.UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable("__EFMigrationsHistory", Schema));
}

/// <summary>Writes to the tenant store (scoped). Callers then call <see cref="ITenantDirectory.NotifyChangedAsync"/>.</summary>
public sealed class TenantRegistry(TenantStoreDbContext db)
{
    public async Task<IReadOnlyList<TenantInfo>> ListAsync(CancellationToken ct) =>
        (await db.Tenants.AsNoTracking().OrderBy(t => t.Id).ToListAsync(ct)).Select(t => t.ToInfo()).ToArray();

    /// <summary>Adds the tenant; false when one with this id exists already.</summary>
    public async Task<bool> AddAsync(TenantInfo tenant, CancellationToken ct)
    {
        if (await db.Tenants.AnyAsync(t => t.Id == tenant.Id, ct)) return false;
        var now = DateTimeOffset.UtcNow;
        db.Tenants.Add(new TenantRecord
        {
            Id = tenant.Id,
            Name = tenant.Name,
            Status = tenant.Status,
            Hosts = tenant.Hosts.ToList(),
            DatabaseServer = tenant.DatabaseServer,
            DatabaseName = tenant.DatabaseName,
            CreatedAt = now,
            UpdatedAt = now
        });
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            if (await db.Tenants.AsNoTracking().AnyAsync(t => t.Id == tenant.Id, ct)) return false; // another request won
            throw;
        }
        return true;
    }

    /// <summary>Changes name, hosts or status; null when the tenant does not exist. The database cannot be moved here.</summary>
    public async Task<TenantInfo?> UpdateAsync(string id, string? name, IReadOnlyList<string>? hosts, TenantStatus? status, CancellationToken ct)
    {
        var record = await db.Tenants.FirstOrDefaultAsync(t => t.Id == id, ct);
        if (record is null) return null;
        if (name is not null) record.Name = name;
        if (hosts is not null) record.Hosts = hosts.ToList();
        if (status is not null) record.Status = status.Value;
        record.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return record.ToInfo();
    }
}

/// <summary>For <c>dotnet ef migrations add ... --project src/WebApi/WebApi.Data</c>.</summary>
internal sealed class TenantStoreDesignTimeFactory : IDesignTimeDbContextFactory<TenantStoreDbContext>
{
    public TenantStoreDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<TenantStoreDbContext>();
        TenantStoreDbContext.Configure(options, "Host=localhost;Database=design_time");
        return new TenantStoreDbContext(options.Options);
    }
}
