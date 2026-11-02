using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Persistence;

public sealed class AuthDbContext(DbContextOptions<AuthDbContext> options) : ModuleDbContext(options)
{
    public DbSet<User> Users => Set<User>();
}
