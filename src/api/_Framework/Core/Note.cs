namespace ModularBlazor.Core;

/// <summary>Sample tenant-owned entity so the per-tenant database has something to migrate. Replace with your own.</summary>
public sealed class Note
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}
