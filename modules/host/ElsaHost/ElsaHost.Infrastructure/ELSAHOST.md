To make **Elsa Workflows v3.6+** depend fully on **Finbuckle.MultiTenant** as its source of truth, the best architecture avoids fighting Elsa’s built-in resolution logic or running duplicate middleware pipelines. Instead, you integrate Finbuckle into **Elsa’s Native Tenant Resolution Pipeline** and supply a **Custom Finbuckle Tenants Provider**.

This approach lets Finbuckle handle all tenant detection logic (subdomain, header, route, claim, path), while Elsa natively acts on Finbuckle’s findings to isolate workflow definitions, instances, triggers, and database entities.

---

### Step 1: Implement a Custom `ITenantResolver` for Elsa

Elsa v3 runs its own resolution pipeline using the `ITenantResolver` interface. Implement a resolver that reads directly from Finbuckle’s `IMultiTenantContextAccessor`:

```csharp
using Elsa.Common.Multitenancy; // Adjust based on exact namespace in your Elsa 3.6 build
using Finbuckle.MultiTenant;

public class FinbuckleTenantResolver : ITenantResolver
{
    private readonly IMultiTenantContextAccessor _multiTenantContextAccessor;

    public FinbuckleTenantResolver(IMultiTenantContextAccessor multiTenantContextAccessor)
    {
        _multiTenantContextAccessor = multiTenantContextAccessor;
    }

    public ValueTask<TenantResolverResult> ResolveAsync(TenantResolverContext context)
    {
        // Extract the resolved tenant from Finbuckle's ambient context
        var finbuckleTenant = _multiTenantContextAccessor.MultiTenantContext?.TenantInfo;

        if (finbuckleTenant != null && !string.IsNullOrEmpty(finbuckleTenant.Id))
        {
            // Hand the tenant ID to Elsa's pipeline
            return ValueTask.FromResult(TenantResolverResult.Resolved(finbuckleTenant.Id));
        }

        // Return unresolved if Finbuckle didn't find a tenant
        return ValueTask.FromResult(TenantResolverResult.Unresolved());
    }
}

```

---

### Step 2: Implement a Custom `ITenantsProvider` for Elsa

Elsa needs to validate that the resolved tenant ID exists in an active list of tenants. Implement an `ITenantsProvider` that fetches tenants from Finbuckle’s store (`IMultiTenantStore`):

```csharp
using Elsa.Common.Multitenancy;
using Finbuckle.MultiTenant;

public class FinbuckleTenantsProvider : ITenantsProvider
{
    private readonly IMultiTenantStore<TenantInfo> _tenantStore;

    public FinbuckleTenantsProvider(IMultiTenantStore<TenantInfo> tenantStore)
    {
        _tenantStore = tenantStore;
    }

    public async ValueTask<IEnumerable<Tenant>> ListAsync(CancellationToken cancellationToken = default)
    {
        var finbuckleTenants = await _tenantStore.GetAllAsync();

        // Map Finbuckle Tenants to Elsa Tenant domain models
        return finbuckleTenants.Select(t => new Tenant
        {
            Id = t.Id,
            Name = t.Name ?? t.Identifier ?? t.Id,
            // Pass any tenant-specific options into Elsa Configuration if needed
            Configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionString"] = t.ConnectionString
            }).Build()
        });
    }

    public async ValueTask<Tenant?> FindAsync(TenantFilter filter, CancellationToken cancellationToken = default)
    {
        var tenants = await ListAsync(cancellationToken);

        if (!string.IsNullOrEmpty(filter.Id))
            return tenants.FirstOrDefault(t => t.Id == filter.Id);

        if (!string.IsNullOrEmpty(filter.Name))
            return tenants.FirstOrDefault(t => t.Name == filter.Name);

        return null;
    }
}

```

---

### Step 3: Register and Wire Everything in Minimal API

Hook both Finbuckle and Elsa together in `Program.cs`. Configure Elsa’s multitenancy feature to append your `FinbuckleTenantResolver` to its pipeline and use your `FinbuckleTenantsProvider`:

```csharp
using Finbuckle.MultiTenant;
using Elsa.Common.Multitenancy;

var builder = WebApplication.CreateBuilder(args);

// 1. Configure Finbuckle (Master Source of Truth)
builder.Services.AddMultiTenant<TenantInfo>()
    .WithHeaderStrategy("X-Tenant-ID") // Or WithRouteStrategy(), WithHostStrategy(), etc.
    .WithConfigurationStore();          // Or WithEFCoreStore()

// 2. Register Custom Elsa Integrations
builder.Services.AddScoped<ITenantResolver, FinbuckleTenantResolver>();
builder.Services.AddScoped<ITenantsProvider, FinbuckleTenantsProvider>();

// 3. Configure Elsa v3
builder.Services.AddElsa(elsa =>
{
    elsa.UseWorkflowManagement();
    elsa.UseWorkflowRuntime();

    // Enable Elsa Multi-tenancy Feature
    elsa.UseTenants(tenants =>
    {
        tenants.ConfigureMultitenancy(options =>
        {
            // Clear default resolvers and delegate tenant resolution to Finbuckle
            options.TenantResolverPipelineBuilder.Clear();
            options.TenantResolverPipelineBuilder.Append<FinbuckleTenantResolver>();
        });
    });

    // Configure durable EF Core storage (Shared DB or DB per Tenant)
    // Elsa's EF Core provider automatically applies query filters based on the resolved tenant!
});

var app = builder.Build();

// 4. Middleware Pipeline Order is Critical
app.UseMultiTenant(); // Finbuckle MUST resolve the tenant FIRST

app.UseAuthentication();
app.UseAuthorization();

app.MapElsaEndpoints(); // Maps Elsa Studio/API endpoints

app.Run();

```

---

### Key Architectural Benefits

1. **Zero Redundancy:** Finbuckle acts as the sole tenant resolution engine across your entire Minimal API application.
2. **Automatic Storage Isolation:** Because Elsa is configured natively via `UseTenants()`, Elsa’s internal EF Core DbContext automatically appends `TenantId` global query filters to workflow entities.
3. **Background Worker Safety:** When Elsa executes asynchronous background tasks or triggers, Elsa handles tenant propagation internally through its workflow execution context using the tenant ID established by your resolver during dispatch.