using Ardalis.Specification;

namespace soft.square.net.WebApi.SharedKernel;

/// <summary>
/// Reads aggregates with specifications (Ardalis.Specification). In a runtime module it works on the module's
/// TenantDbContext, so every query runs against the current tenant's database.
/// </summary>
public interface IReadRepository<T> : IReadRepositoryBase<T> where T : class, IAggregateRoot;

/// <summary>Reads and writes aggregates. Add/Update/Delete save immediately (Ardalis RepositoryBase semantics).</summary>
public interface IRepository<T> : IRepositoryBase<T> where T : class, IAggregateRoot;
