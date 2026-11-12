using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace soft.square.net.WebApi.Identity.Server.Data;

/// <summary>One global account per person. Tenants are reached through <see cref="TenantMembership"/>.</summary>
public sealed class ApplicationUser : IdentityUser
{
    public string? DisplayName { get; set; }
}

public enum MembershipStatus { Invited = 0, Active = 1, Suspended = 2 }

/// <summary>Role of a member inside one tenant. Not a permission: grants live in the WebApi host.</summary>
public static class MembershipRoles
{
    public const string Member = "member";
    public const string Admin = "tenant-admin";
}

/// <summary>A user's membership in one tenant. A token for that tenant is issued only while it is Active.</summary>
public sealed class TenantMembership
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string UserId { get; set; } = "";
    public string TenantId { get; set; } = "";
    public MembershipStatus Status { get; set; }
    public string Role { get; set; } = MembershipRoles.Member;
    /// <summary>Global user id (sub) of whoever invited the member; null for seeded or self-service rows.</summary>
    public string? InvitedBy { get; set; }
    public DateTimeOffset InvitedAt { get; set; } = DateTimeOffset.UtcNow;
    /// <summary>When the invitation was accepted; null while Invited.</summary>
    public DateTimeOffset? JoinedAt { get; set; }

    public ApplicationUser? User { get; set; }
}

/// <summary>What a user looks like inside one tenant (the tenant admin sees this, not the global account).</summary>
public sealed class TenantProfile
{
    public string UserId { get; set; } = "";
    public string TenantId { get; set; } = "";
    public string? DisplayName { get; set; }
    public string? JobTitle { get; set; }
}

/// <summary>
/// The identity service's view of a tenant: its display name for the tenant picker and its security policy.
/// The tenant directory itself belongs to the WebApi host (TenantStore); ids must match it.
/// </summary>
public sealed class TenantSettings
{
    public string TenantId { get; set; } = "";
    public string DisplayName { get; set; } = "";
    /// <summary>Tokens for this tenant are only issued to users who signed in with MFA.</summary>
    public bool RequireMfa { get; set; }
}

public sealed class IdentityDb(DbContextOptions<IdentityDb> options) : IdentityDbContext<ApplicationUser>(options)
{
    public const string Schema = "identity";

    public DbSet<TenantMembership> TenantMemberships => Set<TenantMembership>();
    public DbSet<TenantProfile> TenantProfiles => Set<TenantProfile>();
    public DbSet<TenantSettings> Tenants => Set<TenantSettings>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.HasDefaultSchema(Schema);
        builder.UseOpenIddict();

        builder.Entity<TenantMembership>(e =>
        {
            e.ToTable("TenantMemberships");
            e.HasKey(m => m.Id);
            e.HasIndex(m => new { m.UserId, m.TenantId }).IsUnique();
            e.HasIndex(m => m.TenantId);
            e.Property(m => m.TenantId).HasMaxLength(64);
            e.Property(m => m.Role).HasMaxLength(32);
            e.Property(m => m.Status).HasConversion<string>().HasMaxLength(16);
            e.HasOne(m => m.User).WithMany().HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<TenantProfile>(e =>
        {
            e.ToTable("TenantProfiles");
            e.HasKey(p => new { p.UserId, p.TenantId });
            e.Property(p => p.TenantId).HasMaxLength(64);
            e.HasOne<ApplicationUser>().WithMany().HasForeignKey(p => p.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<TenantSettings>(e =>
        {
            e.ToTable("Tenants");
            e.HasKey(t => t.TenantId);
            e.Property(t => t.TenantId).HasMaxLength(64);
            e.Property(t => t.DisplayName).HasMaxLength(200);
        });
    }
}
