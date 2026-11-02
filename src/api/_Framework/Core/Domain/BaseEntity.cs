namespace soft.square.net.ModularBlazor.Core.Domain;

/// <summary>Base class for domain entities.</summary>
public abstract class BaseEntity<TId> where TId : notnull
{
    public TId Id { get; protected set; } = default!;
}

/// <summary>Marks an aggregate root: the only entities repositories are created for.</summary>
public interface IAggregateRoot;
