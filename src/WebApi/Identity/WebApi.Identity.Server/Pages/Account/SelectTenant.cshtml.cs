using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using soft.square.net.WebApi.Identity.Server.Auth;
using soft.square.net.WebApi.Identity.Server.Data;

namespace soft.square.net.WebApi.Identity.Server.Pages.Account;

/// <summary>Tenant picker: shown by /connect/authorize when the user has several active memberships and no tenant was asked for.</summary>
[Authorize]
public sealed class SelectTenantModel(IdentityDb db, UserManager<ApplicationUser> users) : PageModel
{
    public sealed record TenantChoice(string Id, string Name);

    [BindProperty(SupportsGet = true)] public string ReturnUrl { get; set; } = "";
    public List<TenantChoice> Tenants { get; private set; } = [];

    public async Task<IActionResult> OnGetAsync(CancellationToken ct)
    {
        if (!IsAuthorizeUrl(ReturnUrl)) return BadRequest();
        Tenants = await ActiveTenantsAsync(ct);
        return Page();
    }

    public async Task<IActionResult> OnPostAsync(string tenant, CancellationToken ct)
    {
        if (!IsAuthorizeUrl(ReturnUrl)) return BadRequest();
        Tenants = await ActiveTenantsAsync(ct);
        if (Tenants.All(t => t.Id != tenant)) return Page();
        // Back to the authorize endpoint with the choice; it re-checks the membership and the tenant policy.
        return LocalRedirect(QueryHelpers.AddQueryString(ReturnUrl, IdentityClaims.Tenant, tenant));
    }

    private static bool IsAuthorizeUrl(string url) =>
        url.StartsWith(ConnectEndpoints.AuthorizePath + "?", StringComparison.Ordinal) && !url.Contains("tenant=", StringComparison.Ordinal);

    private async Task<List<TenantChoice>> ActiveTenantsAsync(CancellationToken ct)
    {
        var userId = users.GetUserId(User);
        return await db.TenantMemberships.AsNoTracking()
            .Where(m => m.UserId == userId && m.Status == MembershipStatus.Active)
            .OrderBy(m => m.TenantId)
            .Select(m => new TenantChoice(m.TenantId,
                db.Tenants.Where(t => t.TenantId == m.TenantId).Select(t => t.DisplayName).FirstOrDefault() ?? m.TenantId))
            .ToListAsync(ct);
    }
}
