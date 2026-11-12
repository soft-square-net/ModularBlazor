using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using soft.square.net.WebApi.Identity.Server.Data;

namespace soft.square.net.WebApi.Identity.Server.Pages.Account;

public sealed class LoginModel(SignInManager<ApplicationUser> signIn) : PageModel
{
    [BindProperty(SupportsGet = true)] public string? ReturnUrl { get; set; }
    [BindProperty] public string Email { get; set; } = "";
    [BindProperty] public string Password { get; set; } = "";
    [BindProperty] public bool RememberMe { get; set; }
    public string? Error { get; private set; }

    public void OnGet() { }

    public async Task<IActionResult> OnPostAsync()
    {
        var result = await signIn.PasswordSignInAsync(Email, Password, RememberMe, lockoutOnFailure: true);
        if (result.Succeeded)
            return LocalRedirect(Url.IsLocalUrl(ReturnUrl) ? ReturnUrl! : "/");

        // TODO(MFA): the second-factor step (authenticator app / WebAuthn) and enrolment UI come later; a tenant with
        // RequireMfa already refuses tokens to accounts that did not sign in with MFA.
        Error = result.IsLockedOut ? "The account is locked. Try again in a few minutes."
              : result.RequiresTwoFactor ? "This account uses two-factor sign-in, which this page does not support yet."
              : result.IsNotAllowed ? "This account may not sign in yet (email not confirmed?)."
              : "Invalid email or password.";
        return Page();
    }
}
