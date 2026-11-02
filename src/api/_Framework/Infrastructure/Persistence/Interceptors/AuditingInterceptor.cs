using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Core.Domain;

namespace soft.square.net.ModularBlazor.Infrastructure.Persistence.Interceptors;

/// <summary>Fills audit fields on save and turns deletes of soft-deletable entities into updates.</summary>
public sealed class AuditingInterceptor(ICurrentUser currentUser, TimeProvider clock) : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        Apply(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData,
        InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        Apply(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private void Apply(DbContext? context)
    {
        if (context is null) return;

        var now = clock.GetUtcNow().UtcDateTime;
        var by = currentUser.UserId ?? currentUser.UserName;

        foreach (var entry in context.ChangeTracker.Entries().ToList())
        {
            switch (entry.State)
            {
                case EntityState.Added when entry.Entity is IAuditableEntity added:
                    added.MarkCreated(now, by);
                    break;

                case EntityState.Modified when entry.Entity is IAuditableEntity modified:
                    modified.MarkModified(now, by);
                    break;

                case EntityState.Deleted when entry.Entity is ISoftDeletable deleted:
                    deleted.MarkDeleted(now, by);
                    entry.State = EntityState.Modified;
                    break;
            }
        }
    }
}
