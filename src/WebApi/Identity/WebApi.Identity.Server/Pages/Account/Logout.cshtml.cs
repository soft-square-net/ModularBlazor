using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using soft.square.net.WebApi.Identity.Server.Data;

namespace soft.square.net.WebApi.Identity.Server.Pages.Account;

public sealed class LogoutModel(SignInManager<ApplicationUser> signIn) : PageModel
{
    public void OnGet() { }

    public async Task<IActionResult> OnPostAsync()
    {
        await signIn.SignOutAsync();
        return Redirect("/");
    }
}
