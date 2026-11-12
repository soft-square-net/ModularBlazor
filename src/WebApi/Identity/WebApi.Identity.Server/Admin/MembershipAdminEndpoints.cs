using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using OpenIddict.Abstractions;
using OpenIddict.Validation.AspNetCore;
using soft.square.net.WebApi.Identity.Server.Auth;
using soft.square.net.WebApi.Identity.Server.Data;
using static OpenIddict.Abstractions.OpenIddictConstants;

namespace soft.square.net.WebApi.Identity.Server.Admin;

public sealed record InviteMember(string Email, string? Role, string? DisplayName);
public sealed record MemberView(string UserId, string? Email, string? DisplayName, string Status, string Role,
    string? InvitedBy, DateTimeOffset InvitedAt, DateTimeOffset? JoinedAt);
public sealed record TenantSettingsInput(string? DisplayName, bool RequireMfa);

/// <summary>
/// Minimal membership admin API, called with a bearer token from this service (audience modular-webapi).
/// Allowed for the platform role, or for an active tenant-admin member whose token is for the same tenant.
/// A tenant admin sees only that tenant's memberships, never the user's other tenants.
/// </summary>
public static class MembershipAdminEndpoints
{
    public const string Policy = "identity-admin";

    public static void MapMembershipAdmin(this IEndpointRouteBuilder app)
    {
        var tenants = app.MapGroup("/api/admin/tenants/{tenant}")
            .RequireAuthorization(Policy)
            .WithTags("Membership admin");

        tenants.MapGet("/members", ListAsync);
        tenants.MapPost("/members", InviteAsync);
        tenants.MapPost("/members/{userId}/suspend", (string tenant, string userId, ClaimsPrincipal caller, IdentityDb db,
            TenantAuthorizations auth, CancellationToken ct) => SetStatusAsync(tenant, userId, MembershipStatus.Suspended, caller, db, auth, ct));
        tenants.MapPost("/members/{userId}/activate", (string tenant, string userId, ClaimsPrincipal caller, IdentityDb db,
            TenantAuthorizations auth, CancellationToken ct) => SetStatusAsync(tenant, userId, MembershipStatus.Active, caller, db, auth, ct));
        tenants.MapDelete("/members/{userId}", RemoveAsync);
        // Tenant security policy: platform role only.
        tenants.MapPut("/", PutTenantAsync);
    }

    public static void AddMembershipAdmin(this IServiceCollection services) =>
        services.AddAuthorizationBuilder().AddPolicy(Policy, p => p
            .AddAuthenticationSchemes(OpenIddictValidationAspNetCoreDefaults.AuthenticationScheme)
            .RequireAuthenticatedUser());

    private static IResult Denied => Results.Problem("Requires the platform-admin role or an active tenant-admin membership in this tenant (token for the same tenant).", statusCode: StatusCodes.Status403Forbidden);

    private static bool IsPlatformAdmin(ClaimsPrincipal caller) => caller.HasClaim(Claims.Role, IdentityClaims.PlatformAdmin);

    private static async Task<bool> CanAdministerAsync(ClaimsPrincipal caller, string tenant, IdentityDb db, CancellationToken ct)
    {
        if (IsPlatformAdmin(caller)) return true;
        var sub = caller.GetClaim(Claims.Subject);
        if (sub is null || !string.Equals(caller.GetClaim(IdentityClaims.Tenant), tenant, StringComparison.Ordinal)) return false;
        return await db.TenantMemberships.AnyAsync(m => m.UserId == sub && m.TenantId == tenant &&
            m.Status == MembershipStatus.Active && m.Role == MembershipRoles.Admin, ct);
    }

    private static async Task<IResult> ListAsync(string tenant, ClaimsPrincipal caller, IdentityDb db, CancellationToken ct)
    {
        if (!await CanAdministerAsync(caller, tenant, db, ct)) return Denied;
        var members = await db.TenantMemberships.AsNoTracking()
            .Where(m => m.TenantId == tenant)
            .Select(m => new
            {
                m,
                m.User!.Email,
                Profile = db.TenantProfiles.Where(p => p.UserId == m.UserId && p.TenantId == tenant).Select(p => p.DisplayName).FirstOrDefault(),
            })
            .ToListAsync(ct);
        return Results.Ok(members.Select(x => new MemberView(x.m.UserId, x.Email, x.Profile, x.m.Status.ToString(), x.m.Role,
            x.m.InvitedBy, x.m.InvitedAt, x.m.JoinedAt)));
    }

    /// <summary>
    /// Invites an account into the tenant (status Invited until the user accepts on /Account/Invitations). An unknown
    /// email gets a new account without a password. TODO: send the invitation email and a set-password link.
    /// </summary>
    private static async Task<IResult> InviteAsync(string tenant, InviteMember input, ClaimsPrincipal caller, IdentityDb db,
        UserManager<ApplicationUser> users, CancellationToken ct)
    {
        if (!await CanAdministerAsync(caller, tenant, db, ct)) return Denied;
        if (!await db.Tenants.AnyAsync(t => t.TenantId == tenant, ct))
            return Results.Problem($"Tenant '{tenant}' is not known to the identity service.", statusCode: StatusCodes.Status404NotFound);
        var role = input.Role ?? MembershipRoles.Member;
        if (role is not (MembershipRoles.Member or MembershipRoles.Admin))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["role"] = [$"Use '{MembershipRoles.Member}' or '{MembershipRoles.Admin}'."] });

        var user = await users.FindByEmailAsync(input.Email);
        if (user is null)
        {
            user = new ApplicationUser { UserName = input.Email, Email = input.Email, DisplayName = input.DisplayName };
            var created = await users.CreateAsync(user);
            if (!created.Succeeded)
                return Results.ValidationProblem(created.Errors.GroupBy(e => e.Code).ToDictionary(g => g.Key, g => g.Select(e => e.Description).ToArray()));
        }

        if (await db.TenantMemberships.AnyAsync(m => m.UserId == user.Id && m.TenantId == tenant, ct))
            return Results.Conflict(new { error = "already_member", userId = user.Id });

        db.TenantMemberships.Add(new TenantMembership
        {
            UserId = user.Id, TenantId = tenant, Status = MembershipStatus.Invited, Role = role,
            InvitedBy = caller.GetClaim(Claims.Subject),
        });
        if (input.DisplayName is not null)
            db.TenantProfiles.Add(new TenantProfile { UserId = user.Id, TenantId = tenant, DisplayName = input.DisplayName });
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/admin/tenants/{tenant}/members/{user.Id}", new { userId = user.Id, status = nameof(MembershipStatus.Invited) });
    }

    private static async Task<IResult> SetStatusAsync(string tenant, string userId, MembershipStatus status, ClaimsPrincipal caller,
        IdentityDb db, TenantAuthorizations auth, CancellationToken ct)
    {
        if (!await CanAdministerAsync(caller, tenant, db, ct)) return Denied;
        var membership = await db.TenantMemberships.FirstOrDefaultAsync(m => m.UserId == userId && m.TenantId == tenant, ct);
        if (membership is null) return Results.NotFound();
        if (status == MembershipStatus.Active && membership.Status == MembershipStatus.Invited)
            return Results.Conflict(new { error = "invitation_pending", message = "The user has to accept the invitation." });

        membership.Status = status;
        await db.SaveChangesAsync(ct);
        // A suspended member's refresh tokens die now; a refresh would be refused anyway, this also ends sessions.
        var revoked = status == MembershipStatus.Suspended ? await auth.RevokeAsync(userId, tenant, ct) : 0;
        return Results.Ok(new { userId, tenant, status = status.ToString(), revokedAuthorizations = revoked });
    }

    private static async Task<IResult> RemoveAsync(string tenant, string userId, ClaimsPrincipal caller, IdentityDb db,
        TenantAuthorizations auth, CancellationToken ct)
    {
        if (!await CanAdministerAsync(caller, tenant, db, ct)) return Denied;
        var membership = await db.TenantMemberships.FirstOrDefaultAsync(m => m.UserId == userId && m.TenantId == tenant, ct);
        if (membership is null) return Results.NotFound();

        db.TenantMemberships.Remove(membership);
        await db.TenantProfiles.Where(p => p.UserId == userId && p.TenantId == tenant).ExecuteDeleteAsync(ct);
        await db.SaveChangesAsync(ct);
        // Removing a membership revokes that tenant's refresh tokens (and pending codes) for the user.
        var revoked = await auth.RevokeAsync(userId, tenant, ct);
        return Results.Ok(new { userId, tenant, removed = true, revokedAuthorizations = revoked });
    }

    private static async Task<IResult> PutTenantAsync(string tenant, TenantSettingsInput input, ClaimsPrincipal caller, IdentityDb db, CancellationToken ct)
    {
        if (!IsPlatformAdmin(caller)) return Denied;
        var settings = await db.Tenants.FirstOrDefaultAsync(t => t.TenantId == tenant, ct);
        if (settings is null) db.Tenants.Add(settings = new TenantSettings { TenantId = tenant });
        settings.DisplayName = input.DisplayName ?? (settings.DisplayName.Length > 0 ? settings.DisplayName : tenant);
        settings.RequireMfa = input.RequireMfa;
        await db.SaveChangesAsync(ct);
        return Results.Ok(settings);
    }
}
