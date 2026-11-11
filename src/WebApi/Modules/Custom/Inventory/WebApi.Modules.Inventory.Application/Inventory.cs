using Ardalis.Specification;
using soft.square.net.WebApi.Modules.Inventory.Domain;
using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.WebApi.Modules.Inventory.Application;

public sealed record StockItemDto(int Id, string Sku, string Name, int Quantity);

public sealed record NewStockItem(string Sku, string Name, int Quantity);

/// <summary>Every stock item, by SKU, projected to the DTO (no tracking, only the needed columns).</summary>
public sealed class StockListSpec : Specification<StockItem, StockItemDto>
{
    public StockListSpec(int? belowQuantity = null)
    {
        if (belowQuantity is { } limit) Query.Where(i => i.Quantity < limit);
        Query.OrderBy(i => i.Sku).AsNoTracking();
        Query.Select(i => new StockItemDto(i.Id, i.Sku, i.Name, i.Quantity));
    }
}

/// <summary>The stock item with this SKU (SKUs are stored upper case).</summary>
public sealed class StockItemBySkuSpec : SingleResultSpecification<StockItem>
{
    public StockItemBySkuSpec(string sku) => Query.Where(i => i.Sku == sku.Trim().ToUpperInvariant());
}

/// <summary>
/// Inventory use cases. The repositories work on the current tenant's database (the module's TenantDbContext), so
/// nothing here deals with tenants. Business-rule violations surface as <see cref="DomainException"/>.
/// </summary>
public sealed class InventoryService(IReadRepository<StockItem> reader, IRepository<StockItem> items)
{
    public Task<List<StockItemDto>> ListAsync(int? belowQuantity, CancellationToken ct) =>
        reader.ListAsync(new StockListSpec(belowQuantity), ct);

    public Task<int> CountAsync(CancellationToken ct) => reader.CountAsync(ct);

    public async Task<StockItemDto> AddAsync(NewStockItem request, CancellationToken ct)
    {
        var item = StockItem.Create(request.Sku, request.Name, request.Quantity);
        if (await reader.AnyAsync(new StockItemBySkuSpec(item.Sku), ct))
            throw new DomainException($"SKU '{item.Sku}' exists already.");
        await items.AddAsync(item, ct);
        return ToDto(item);
    }

    /// <summary>Null when there is no item with this SKU.</summary>
    public async Task<StockItemDto?> AdjustAsync(string sku, int delta, CancellationToken ct)
    {
        var item = await items.FirstOrDefaultAsync(new StockItemBySkuSpec(sku), ct);
        if (item is null) return null;
        item.Adjust(delta);
        await items.UpdateAsync(item, ct);
        return ToDto(item);
    }

    private static StockItemDto ToDto(StockItem item) => new(item.Id, item.Sku, item.Name, item.Quantity);
}
