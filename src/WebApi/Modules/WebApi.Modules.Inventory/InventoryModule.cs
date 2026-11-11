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

namespace soft.square.net.WebApi.Modules.Inventory;

/// <summary>
/// Sample tenant-data module: every tenant's stock items live in that tenant's database (database per tenant), in the
/// module's own schema "inventory". The schema is migrated for every active tenant when the module loads and when a
/// tenant is created; requests need a tenant (X-Tenant header or the tenant's host name).
/// </summary>
public sealed class InventoryModule : IRuntimeModule
{
    public ModuleManifest Manifest { get; } = new("inventory", "Inventory", "1.0.0", "inventory")
    {
        Description = "Sample: stock items per tenant, in each tenant's own database (TenantDbContext)."
    };

    public void ConfigureServices(IServiceCollection services, IConfiguration settings) =>
        services.AddTenantDbContext<InventoryDbContext>();
}

public sealed class StockItem : ITenantOwned
{
    public int Id { get; set; }
    public string TenantId { get; set; } = "";
    public string Sku { get; set; } = "";
    public string Name { get; set; } = "";
    public int Quantity { get; set; }
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

/// <summary>dotnet ef migrations add &lt;Name&gt; --project src/WebApi/Modules/WebApi.Modules.Inventory</summary>
internal sealed class InventoryDesignTimeFactory : IDesignTimeDbContextFactory<InventoryDbContext>
{
    public InventoryDbContext CreateDbContext(string[] args) =>
        new(TenantDbDesignTime.Options<InventoryDbContext>(), TenantDbDesignTime.Tenant);
}

public sealed record NewStockItem(string Sku, string Name, int Quantity);

public sealed record InventoryInfo(string Tenant, string? ResolvedBy, string Database, string Schema, int Items);

public sealed class InventoryEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        app.MapGet("/", async (ITenantContext tenant, InventoryDbContext db, CancellationToken ct) =>
                new InventoryInfo(tenant.Required.Id, tenant.ResolvedBy, db.Database.GetDbConnection().Database, "inventory",
                    await db.Items.CountAsync(ct)))
            .WithSummary("Which tenant and database this request was served from.");

        app.MapGet("/items", async (InventoryDbContext db, CancellationToken ct) =>
            await db.Items.OrderBy(i => i.Sku).ToListAsync(ct));

        app.MapPost("/items", async (NewStockItem request, InventoryDbContext db, CancellationToken ct) =>
        {
            var item = new StockItem { Sku = request.Sku, Name = request.Name, Quantity = request.Quantity };
            db.Items.Add(item);
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException) { return Results.Conflict(new { error = $"SKU '{request.Sku}' exists already." }); }
            return Results.Created($"items/{item.Id}", item);
        });
    }
}
