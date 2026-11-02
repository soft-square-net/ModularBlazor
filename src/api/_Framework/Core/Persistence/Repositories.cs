using Ardalis.Specification;
using soft.square.net.ModularBlazor.Core.Domain;

namespace soft.square.net.ModularBlazor.Core.Persistence;

/// <summary>Read/write repository for an aggregate (Ardalis.Specification). Implemented in Infrastructure.</summary>
public interface IRepository<T> : IRepositoryBase<T> where T : class, IAggregateRoot;

/// <summary>Read-only repository for an aggregate (Ardalis.Specification). Implemented in Infrastructure.</summary>
public interface IReadRepository<T> : IReadRepositoryBase<T> where T : class, IAggregateRoot;

/// <summary>An initializer for a database that exists once for the whole API (not per tenant), e.g. the tenant provisioning log.</summary>
public interface IControlPlaneDbInitializer : IDbInitializer;

/// <summary>Creates/migrates a module's schema and seeds its initial data. Run at startup (Database:MigrateOnStartup).</summary>
public interface IDbInitializer
{
    Task InitializeAsync(CancellationToken cancellationToken = default);
}
