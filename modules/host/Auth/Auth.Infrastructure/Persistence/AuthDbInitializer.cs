using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using soft.square.net.ModularBlazor.Core.Authorization;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Persistence;

/// <summary>
/// Seeds the "admin" role (every permission, kept in sync with the code), the "basic" role, and the first
/// administrator (Auth:Seed:AdminUserName / AdminEmail / AdminPassword). Change that password after the first sign-in.
/// </summary>
public sealed class AuthDbInitializer(AuthDbContext dbContext, IPasswordService passwords, IConfiguration configuration)
    : DbInitializer<AuthDbContext>(dbContext)
{
    protected override async Task SeedAsync(AuthDbContext db, CancellationToken cancellationToken)
    {
        var admin = await db.Roles.Include(r => r.Permissions)
            .FirstOrDefaultAsync(r => r.NormalizedName == Role.Normalize(RoleNames.Admin), cancellationToken);
        if (admin is null)
        {
            admin = Role.Create(RoleNames.Admin, "Administrators: every permission.", isSystem: true);
            db.Roles.Add(admin);
        }
        admin.SetPermissions(Permissions.All);

        if (!await db.Roles.AnyAsync(r => r.NormalizedName == Role.Normalize(RoleNames.Basic), cancellationToken))
            db.Roles.Add(Role.Create(RoleNames.Basic, "Basic users: no special permissions.", isSystem: true));

        await db.SaveChangesAsync(cancellationToken);

        if (await db.Users.AnyAsync(cancellationToken))
            return;

        var seed = configuration.GetSection("Auth:Seed");
        var user = User.Create(
            seed["AdminUserName"] ?? "admin",
            seed["AdminEmail"] ?? "admin@root.com",
            passwords.Hash(seed["AdminPassword"] ?? "123Pa$$word!"),
            "System", "Administrator");
        user.SetRoles([admin.Id]);

        db.Users.Add(user);
        await db.SaveChangesAsync(cancellationToken);
    }
}
