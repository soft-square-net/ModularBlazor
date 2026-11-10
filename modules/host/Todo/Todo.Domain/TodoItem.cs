using soft.square.net.ModularBlazor.Core.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Todo.Domain;

/// <summary>A to-do entry of the current tenant. Audited and soft-deleted (AuditableAggregateRoot).</summary>
public sealed class TodoItem : AuditableAggregateRoot<Guid>
{
    public const int TitleMaxLength = 200;
    public const int NotesMaxLength = 2000;

    private TodoItem() { } // EF Core

    public string Title { get; private set; } = "";
    public string? Notes { get; private set; }
    public bool IsCompleted { get; private set; }
    public DateTime? CompletedOnUtc { get; private set; }

    public static TodoItem Create(string title, string? notes)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(title);
        return new TodoItem { Id = Guid.NewGuid(), Title = title.Trim(), Notes = Clean(notes) };
    }

    public void Update(string title, string? notes)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(title);
        Title = title.Trim();
        Notes = Clean(notes);
    }

    public void SetCompleted(bool completed, DateTime utcNow)
    {
        if (completed == IsCompleted) return;
        IsCompleted = completed;
        CompletedOnUtc = completed ? utcNow : null;
    }

    private static string? Clean(string? notes) => string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
}
