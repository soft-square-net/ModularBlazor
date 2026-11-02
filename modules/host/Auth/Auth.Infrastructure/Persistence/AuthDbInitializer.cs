using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Persistence;

public sealed class AuthDbInitializer(AuthDbContext dbContext, TimeProvider clock) : DbInitializer<AuthDbContext>(dbContext)
{
    protected override async Task SeedAsync(AuthDbContext db, CancellationToken cancellationToken)
    {
        var admin = User.Normalize("admin");
        if (await db.Users.AnyAsync(u => u.NormalizedUserName == admin, cancellationToken))
            return;

        db.Users.Add(User.Register("admin", Roles.Admin, clock.GetUtcNow()));
        await db.SaveChangesAsync(cancellationToken);
    }
}
