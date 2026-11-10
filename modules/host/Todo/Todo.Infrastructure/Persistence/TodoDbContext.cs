using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Host.Modules.Todo.Domain;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Todo.Infrastructure.Persistence;

/// <summary>Schema Todo (MySQL: Todo_ table prefix). Tenant scoped: every tenant sees only its own items.</summary>
public sealed class TodoDbContext(DbContextOptions<TodoDbContext> options, ICurrentTenant currentTenant)
    : ModuleDbContext(options, currentTenant)
{
    protected override string Schema => SchemaNames.Todo;

    public DbSet<TodoItem> Items => Set<TodoItem>();
}
