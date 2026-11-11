using Carter;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.WebApi.Contracts;
using soft.square.net.WebApi.Contracts.Tenancy;
using soft.square.net.WebApi.Data;
using soft.square.net.WebApi.Modules.Inventory.Application;
using soft.square.net.WebApi.Modules.Inventory.Domain;
using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.WebApi.Modules.Inventory.Infrastructure;

/// <summary>
/// Sample tenant-data module in clean-architecture layers (Domain → Application → Infrastructure). Every tenant's
/// stock lives in that tenant's database (schema "inventory"), migrated for every active tenant when the module loads
/// and when a tenant is created. Requests need a tenant (X-Tenant header or the tenant's host name).
/// </summary>
public sealed class InventoryModule : IRuntimeModule
{
    public ModuleManifest Manifest { get; } = new("inventory", "Inventory", "1.1.1", "inventory")
    {
        Description = "Sample: stock items per tenant, in each tenant's own database (layers, specifications, repositories)."
    };

    public void ConfigureServices(IServiceCollection services, IConfiguration settings)
    {
        services.AddTenantDbContext<InventoryDbContext>(); // also IRepository<T> / IReadRepository<T> for the aggregates
        services.AddScoped<InventoryService>();
    }
}

public sealed class InventoryDbContext(DbContextOptions<InventoryDbContext> options, ITenantContext tenant) : TenantDbContext(options, tenant)
{
    protected override string Schema => "inventory";

    public DbSet<StockItem> Items => Set<StockItem>();

    protected override void ConfigureModel(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<StockItem>(item =>
        {
            item.ToTable("stock_items");
            item.Property(i => i.Sku).HasMaxLength(64);
            item.Property(i => i.Name).HasMaxLength(200);
            item.HasIndex(i => new { i.TenantId, i.Sku }).IsUnique();
        });
    }
}

/// <summary>Design time, one migration set per engine (Migrations/&lt;Provider&gt;): add migrations with src/WebApi/scripts/Add-Migration.ps1.</summary>
internal sealed class InventoryDesignTimeFactory : IDesignTimeDbContextFactory<InventoryDbContext>
{
    public InventoryDbContext CreateDbContext(string[] args) =>
        new(TenantDbDesignTime.Options<InventoryDbContext>(args), TenantDbDesignTime.Tenant);
}

public sealed record InventoryInfo(string Tenant, string? ResolvedBy, string Database, string Schema, int Items);

public sealed record Adjustment(int Delta);

public sealed class InventoryEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var inventory = app;

        inventory.MapGet("/", async (ITenantContext tenant, InventoryDbContext db, InventoryService service, CancellationToken ct) =>
                new InventoryInfo(tenant.Required.Id, tenant.ResolvedBy, db.Database.GetDbConnection().Database, "inventory",
                    await service.CountAsync(ct)))
            .WithSummary("Which tenant and database this request was served from.");

        inventory.MapGet("/items", (int? below, InventoryService service, CancellationToken ct) => service.ListAsync(below, ct))
            .WithSummary("Stock items by SKU; ?below=N lists only those with fewer than N in stock.");

        inventory.MapPost("/items", (NewStockItem request, InventoryService service, CancellationToken ct) => Guard(async () =>
        {
            var item = await service.AddAsync(request, ct);
            return Results.Created($"items/{item.Sku}", item);
        }));

        inventory.MapPost("/items/{sku}/adjust", (string sku, Adjustment request, InventoryService service, CancellationToken ct) => Guard(async () =>
                await service.AdjustAsync(sku, request.Delta, ct) is { } item ? Results.Ok(item) : Results.NotFound()))
            .WithSummary("Receives (positive delta) or issues (negative delta) stock; never below zero.");
    }

    /// <summary>Business-rule violations from the domain become 409 problem details.</summary>
    private static async Task<IResult> Guard(Func<Task<IResult>> action)
    {
        try { return await action(); }
        catch (DomainException e) { return Results.Problem(e.Message, statusCode: StatusCodes.Status409Conflict); }
    }
}
