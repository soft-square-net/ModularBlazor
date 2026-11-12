using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;
using soft.square.net.WebApi.Identity.Server.Data;

namespace soft.square.net.WebApi.Identity.Server.Pages.Account;

/// <summary>The invited user accepts a tenant invitation here (membership Invited → Active).</summary>
[Authorize]
public sealed class InvitationsModel(IdentityDb db, UserManager<ApplicationUser> users) : PageModel
{
    public List<string> Pending { get; private set; } = [];

    public async Task OnGetAsync(CancellationToken ct) => Pending = await PendingAsync(ct);

    public async Task<IActionResult> OnPostAsync(string tenant, CancellationToken ct)
    {
        var userId = users.GetUserId(User);
        var membership = await db.TenantMemberships.FirstOrDefaultAsync(
            m => m.UserId == userId && m.TenantId == tenant && m.Status == MembershipStatus.Invited, ct);
        if (membership is not null)
        {
            membership.Status = MembershipStatus.Active;
            membership.JoinedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
        }
        return RedirectToPage();
    }

    private Task<List<string>> PendingAsync(CancellationToken ct)
    {
        var userId = users.GetUserId(User);
        return db.TenantMemberships.AsNoTracking()
            .Where(m => m.UserId == userId && m.Status == MembershipStatus.Invited)
            .Select(m => m.TenantId).ToListAsync(ct);
    }
}
