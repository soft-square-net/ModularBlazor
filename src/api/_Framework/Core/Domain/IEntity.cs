namespace soft.square.net.ModularBlazor.Core.Domain;

public interface IEntity<out TId>
{
    TId Id { get; }
}

/// <summary>Marks an aggregate root: the only entities repositories are created for.</summary>
public interface IAggregateRoot;
