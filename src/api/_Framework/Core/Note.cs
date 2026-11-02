using soft.square.net.ModularBlazor.Core.Domain;

namespace soft.square.net.ModularBlazor.Core;

/// <summary>Sample tenant-owned aggregate so the per-tenant database has something to migrate. Replace with your own.</summary>
public sealed class Note : AuditableAggregateRoot<Guid>
{
    private Note() { } // EF Core

    public string Title { get; private set; } = "";

    public static Note Create(string title)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(title);
        return new Note { Id = Guid.NewGuid(), Title = title.Trim() };
    }
}
