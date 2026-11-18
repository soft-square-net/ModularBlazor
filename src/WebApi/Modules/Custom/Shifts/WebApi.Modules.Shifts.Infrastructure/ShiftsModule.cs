using Carter;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.WebApi.Contracts;
using soft.square.net.WebApi.Contracts.Security;
using soft.square.net.WebApi.Contracts.Tenancy;
using soft.square.net.WebApi.Data;
using soft.square.net.WebApi.Modules.Shifts.Application;
using soft.square.net.WebApi.Modules.Shifts.Domain;
using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.WebApi.Modules.Shifts.Infrastructure;

/// <summary>
/// Shifts module: sections (the categories a desk covers), shifts on the clock and their rota (Manager, Desk, Editor).
/// A published rota becomes time-windowed grants in the host (source <c>shift:{id}</c>), so newsroom rights start and
/// end with the shift, or earlier on check-out. Tenant data (schema "shifts" in each tenant's database).
/// </summary>
public sealed class ShiftsModule : IRuntimeModule
{
    public ModuleManifest Manifest { get; } = new("shifts", "Shifts", "0.1.0", "shifts")
    {
        Description = "Newsroom shifts: sections, rota (Manager, Desk, Editor), check-out; the rota becomes time-windowed grants.",
        DefaultSettings = new Dictionary<string, string?>
        {
            ["Shifts:AutoAssignDelay"] = "00:05:00",
            ["Shifts:CheckoutGrace"] = "00:15:00"
        },
        Permissions = ShiftPermissions.All
    };

    public void ConfigureServices(IServiceCollection services, IConfiguration settings)
    {
        services.Configure<ShiftOptions>(settings.GetSection("Shifts"));
        services.AddTenantDbContext<ShiftsDbContext>(); // IRepository<T> / IReadRepository<T> for Section and Shift
        services.AddScoped<ShiftService>();
    }
}

public sealed class ShiftsDbContext(DbContextOptions<ShiftsDbContext> options, ITenantContext tenant) : TenantDbContext(options, tenant)
{
    protected override string Schema => "shifts";

    public DbSet<Section> Sections => Set<Section>();
    public DbSet<Shift> Shifts => Set<Shift>();

    protected override void ConfigureModel(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Section>(section =>
        {
            section.ToTable("sections");
            section.Property(s => s.Name).HasMaxLength(200);
            section.Ignore(s => s.Scopes);
            section.HasMany(s => s.Categories).WithOne().HasForeignKey("SectionId").OnDelete(DeleteBehavior.Cascade);
            section.Navigation(s => s.Categories).UsePropertyAccessMode(PropertyAccessMode.Field);
        });

        modelBuilder.Entity<SectionCategory>(category =>
        {
            category.ToTable("section_categories");
            category.Property(c => c.CategoryId).HasMaxLength(64);
        });

        modelBuilder.Entity<Shift>(shift =>
        {
            shift.ToTable("shifts");
            shift.Property(s => s.CheckedOutBy).HasMaxLength(128);
            shift.Ignore(s => s.GrantSource);
            shift.HasIndex(s => new { s.SectionId, s.StartsAt });
            shift.HasMany(s => s.Members).WithOne().HasForeignKey("ShiftId").OnDelete(DeleteBehavior.Cascade);
            shift.Navigation(s => s.Members).UsePropertyAccessMode(PropertyAccessMode.Field);
        });

        modelBuilder.Entity<ShiftMember>(member =>
        {
            member.ToTable("shift_members");
            member.Property(m => m.UserId).HasMaxLength(128);
            member.Property(m => m.Role).HasConversion<string>().HasMaxLength(16);
            member.HasIndex(m => m.UserId);
        });
    }
}

/// <summary>Design time, one migration set per engine (Migrations/&lt;Provider&gt;): add migrations with src/WebApi/scripts/Add-Migration.ps1.</summary>
internal sealed class ShiftsDesignTimeFactory : IDesignTimeDbContextFactory<ShiftsDbContext>
{
    public ShiftsDbContext CreateDbContext(string[] args) =>
        new(TenantDbDesignTime.Options<ShiftsDbContext>(args), TenantDbDesignTime.Tenant);
}

public sealed class ShiftsEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var shifts = app.MapGroup("").AddEndpointFilter(async (context, next) =>
        {
            try { return await next(context); }
            catch (ShiftNotFoundException e) { return Results.Problem(e.Message, statusCode: StatusCodes.Status404NotFound); }
            catch (ShiftAccessDeniedException e) { return Results.Problem(e.Message, statusCode: StatusCodes.Status403Forbidden); }
            catch (DomainException e) { return Results.Problem(e.Message, statusCode: StatusCodes.Status409Conflict); }
        });

        // Endpoint names are the OpenAPI operation ids: "Shifts_ListSections" becomes ShiftsClient.ListSectionsAsync.
        // They must be unique across the whole host, hence the module prefix.
        shifts.MapGet("/sections", (ShiftService s, CancellationToken ct) => s.SectionsAsync(ct))
            .RequirePermission(ShiftPermissions.View, ShiftPermissions.Manage)
            .WithName("Shifts_ListSections");
        shifts.MapPost("/sections", async (SectionRequest r, ShiftService s, CancellationToken ct) =>
            {
                var section = await s.AddSectionAsync(r, ct);
                return Results.Created($"sections/{section.Id}", section);
            })
            .Produces<SectionDto>(StatusCodes.Status201Created) // Results.Created hides the type from OpenAPI
            .RequirePermission(ShiftPermissions.Manage)
            .WithName("Shifts_AddSection");
        shifts.MapPut("/sections/{id:int}", (int id, SectionRequest r, ShiftService s, CancellationToken ct) => s.UpdateSectionAsync(id, r, ct))
            .RequirePermission(ShiftPermissions.Manage)
            .WithName("Shifts_UpdateSection")
            .WithSummary("Changing the categories rewrites the grants of the section's published shifts that have not ended.");
        shifts.MapGet("/sections/{id:int}/settings", (int id, ShiftService s, CancellationToken ct) => s.SettingsAsync(id, ct))
            .RequirePermission(ShiftPermissions.View, ShiftPermissions.Manage)
            .WithName("Shifts_GetSectionSettings")
            .WithSummary("Effective AutoAssignDelay and CheckoutGrace: the section's override, else the module's settings.");

        shifts.MapGet("/mine", (ShiftService s, CancellationToken ct) => s.MineAsync(ct))
            .WithName("Shifts_ListMine")
            .WithSummary("Your running and upcoming shifts (next 7 days).");
        shifts.MapGet("/overdue", (ShiftService s, CancellationToken ct) => s.OverdueAsync(ct))
            .RequirePermission(ShiftPermissions.Manage)
            .WithName("Shifts_ListOverdue")
            .WithSummary("Published shifts past their end that nobody checked out (for the workflow's automatic check-out).");
        shifts.MapGet("/shifts", (int? sectionId, DateTimeOffset? from, DateTimeOffset? to, ShiftService s, CancellationToken ct) => s.ShiftsAsync(sectionId, from, to, ct))
            .RequirePermission(ShiftPermissions.View, ShiftPermissions.Manage)
            .WithName("Shifts_ListShifts");
        shifts.MapGet("/shifts/{id:int}", (int id, ShiftService s, CancellationToken ct) => s.GetAsync(id, ct))
            .RequirePermission(ShiftPermissions.View, ShiftPermissions.Manage)
            .WithName("Shifts_GetShift");
        shifts.MapGet("/shifts/{id:int}/automation", (int id, ShiftService s, CancellationToken ct) => s.AutomationInfoAsync(id, ct))
            .RequirePermission(ShiftPermissions.View, ShiftPermissions.Manage)
            .WithName("Shifts_GetShiftAutomation")
            .WithSummary("Shift clock and section-specific assignment/check-out timers for the workflow service.");
        shifts.MapPost("/shifts", async (ShiftRequest r, ShiftService s, CancellationToken ct) =>
            {
                var shift = await s.AddShiftAsync(r, ct);
                return Results.Created($"shifts/{shift.Id}", shift);
            })
            .Produces<ShiftDto>(StatusCodes.Status201Created)
            .RequirePermission(ShiftPermissions.Manage)
            .WithName("Shifts_AddShift")
            .WithSummary("Plans a shift with its rota (exactly one Manager). Nothing is granted until it is published.");
        shifts.MapPut("/shifts/{id:int}", (int id, ShiftRequest r, ShiftService s, CancellationToken ct) => s.UpdateShiftAsync(id, r, ct))
            .RequirePermission(ShiftPermissions.Manage)
            .WithName("Shifts_UpdateShift");
        shifts.MapPost("/shifts/{id:int}/publish", (int id, ShiftService s, CancellationToken ct) => s.PublishAsync(id, ct))
            .RequirePermission(ShiftPermissions.Manage)
            .WithName("Shifts_PublishShift")
            .WithSummary("Writes the rota's grants: each member's role permissions on the section's categories, valid for the shift only.");
        shifts.MapPost("/shifts/{id:int}/check-out", (int id, ShiftService s, CancellationToken ct) => s.CheckOutAsync(id, ct))
            .WithName("Shifts_CheckOutShift")
            .WithSummary("Handover: the whole shift checks out and every member's grants end now (the shift's manager, or a shift admin).");
        shifts.MapPost("/shifts/{id:int}/members/{userId}/check-out", (int id, string userId, ShiftService s, CancellationToken ct) => s.CheckOutMemberAsync(id, userId, ct))
            .WithName("Shifts_CheckOutMember")
            .WithSummary("One member leaves early; their grants end now (themselves, the shift's manager, or a shift admin).");
        shifts.MapDelete("/shifts/{id:int}", async (int id, ShiftService s, CancellationToken ct) =>
            {
                await s.DeleteAsync(id, ct);
                return Results.NoContent();
            })
            .Produces(StatusCodes.Status204NoContent)
            .RequirePermission(ShiftPermissions.Manage)
            .WithName("Shifts_DeleteShift");
    }
}
