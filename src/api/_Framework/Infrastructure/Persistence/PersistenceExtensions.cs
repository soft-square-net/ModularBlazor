using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Infrastructure.Persistence.Interceptors;

namespace soft.square.net.ModularBlazor.Infrastructure.Persistence;

public static class PersistenceExtensions
{
    /// <summary>Registers the SaveChanges interceptors (auditing, domain events) that business DbContexts attach.</summary>
    public static IServiceCollection AddPersistence(this IServiceCollection services)
    {
        services.AddScoped<ISaveChangesInterceptor, AuditingInterceptor>();
        services.AddScoped<ISaveChangesInterceptor, DomainEventsInterceptor>();
        return services;
    }

    /// <summary>Attaches every registered ISaveChangesInterceptor to a DbContext.</summary>
    public static DbContextOptionsBuilder AddSaveChangesInterceptors(this DbContextOptionsBuilder options,
        IServiceProvider serviceProvider)
        => options.AddInterceptors(serviceProvider.GetServices<ISaveChangesInterceptor>());

    /// <summary>Counts the query, then returns the requested page of it.</summary>
    public static async Task<PagedResponse<T>> ToPagedResponseAsync<T>(this IQueryable<T> query, int pageNumber,
        int pageSize, CancellationToken cancellationToken = default)
    {
        pageNumber = Math.Max(pageNumber, 1);
        pageSize = pageSize <= 0 ? PaginationFilter.DefaultPageSize : Math.Min(pageSize, PaginationFilter.MaxPageSize);

        var total = await query.CountAsync(cancellationToken);
        var items = await query.Skip((pageNumber - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        return new PagedResponse<T>(items, total, pageNumber, pageSize);
    }
}
