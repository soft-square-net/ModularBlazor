using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.WebApi.Modules.Inventory.Domain;

/// <summary>A stock item of one tenant (aggregate root). Quantities never go below zero.</summary>
public sealed class StockItem : AggregateRoot<int>, ITenantOwned
{
    private StockItem() { } // EF Core

    public string TenantId { get; set; } = "";
    public string Sku { get; private set; } = "";
    public string Name { get; private set; } = "";
    public int Quantity { get; private set; }

    public static StockItem Create(string sku, string name, int quantity)
    {
        if (string.IsNullOrWhiteSpace(sku)) throw new DomainException("A stock item needs a SKU.");
        if (string.IsNullOrWhiteSpace(name)) throw new DomainException("A stock item needs a name.");
        if (quantity < 0) throw new DomainException("The quantity cannot be negative.");
        return new StockItem { Sku = sku.Trim().ToUpperInvariant(), Name = name.Trim(), Quantity = quantity };
    }

    /// <summary>Receives (positive) or issues (negative) stock.</summary>
    public void Adjust(int delta)
    {
        if (Quantity + delta < 0)
            throw new DomainException($"Only {Quantity} of {Sku} in stock; cannot issue {-delta}.");
        Quantity += delta;
    }

    public void Rename(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new DomainException("A stock item needs a name.");
        Name = name.Trim();
    }
}
