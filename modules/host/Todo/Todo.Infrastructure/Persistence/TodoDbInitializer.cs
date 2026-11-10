using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Host.Modules.Todo.Domain;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Todo.Infrastructure.Persistence;

/// <summary>Applies the Todo migrations and adds a first item to an empty list.</summary>
public sealed class TodoDbInitializer(TodoDbContext dbContext) : DbInitializer<TodoDbContext>(dbContext)
{
    protected override async Task SeedAsync(TodoDbContext db, CancellationToken cancellationToken)
    {
        // IgnoreQueryFilters: a list whose items were all deleted (soft delete) is not seeded again.
        if (await db.Items.IgnoreQueryFilters().AnyAsync(cancellationToken))
            return;

        db.Items.Add(TodoItem.Create("Try the To-do module", "Open /todo in the client, add an item and tick it off."));
        await db.SaveChangesAsync(cancellationToken);
    }
}
