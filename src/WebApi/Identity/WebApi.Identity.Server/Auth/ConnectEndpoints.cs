using System.Security.Claims;
using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using Microsoft.IdentityModel.Tokens;
using OpenIddict.Abstractions;
using OpenIddict.Server.AspNetCore;
using soft.square.net.WebApi.Identity.Server.Data;
using static OpenIddict.Abstractions.OpenIddictConstants;

namespace soft.square.net.WebApi.Identity.Server.Auth;

/// <summary>The OpenIddict pass-through endpoints: authorize, token, userinfo and end session.</summary>
public static class ConnectEndpoints
{
    public const string AuthorizePath = "/connect/authorize";

    public static void MapConnectEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapMethods(AuthorizePath, [HttpMethods.Get, HttpMethods.Post], (Delegate)AuthorizeAsync).ExcludeFromDescription();
        app.MapPost("/connect/token", (Delegate)TokenAsync).ExcludeFromDescription();
        app.MapMethods("/connect/userinfo", [HttpMethods.Get, HttpMethods.Post], (Delegate)UserInfoAsync).ExcludeFromDescription();
        app.MapMethods("/connect/endsession", [HttpMethods.Get, HttpMethods.Post], (Delegate)EndSessionAsync).ExcludeFromDescription();
    }

    /// <summary>The tenant asked for: the <c>tenant</c> parameter, else a <c>tenant:&lt;id&gt;</c> login_hint.</summary>
    public static string? RequestedTenant(OpenIddictRequest request)
    {
        var tenant = (string?)request[IdentityClaims.Tenant];
        if (string.IsNullOrWhiteSpace(tenant) && request.LoginHint is { } hint &&
            hint.StartsWith("tenant:", StringComparison.OrdinalIgnoreCase))
            tenant = hint["tenant:".Length..];
        return string.IsNullOrWhiteSpace(tenant) ? null : tenant.Trim().ToLowerInvariant();
    }

    private static async Task<IResult> AuthorizeAsync(HttpContext context, UserManager<ApplicationUser> users, IdentityDb db,
        TokenIssuer issuer, TenantAuthorizations tenantAuthorizations, IOpenIddictApplicationManager applications)
    {
        var request = context.GetOpenIddictServerRequest()
            ?? throw new InvalidOperationException("The OpenID Connect request cannot be retrieved.");
        var ct = context.RequestAborted;

        // Signed in to this identity service (cookie)? If not, or the client forces a new login, go to the login page.
        var result = await context.AuthenticateAsync(IdentityConstants.ApplicationScheme);
        var tooOld = request.MaxAge is { } maxAge && result.Properties?.IssuedUtc is { } issued &&
                     DateTimeOffset.UtcNow - issued > TimeSpan.FromSeconds(maxAge);
        if (!result.Succeeded || request.HasPromptValue(PromptValues.Login) || tooOld)
        {
            if (request.HasPromptValue(PromptValues.None))
                return Forbid(Errors.LoginRequired, "The user is not signed in.");

            // Come back here after the login, without prompt=login (it would loop).
            var parameters = ParametersOf(context.Request)
                .Where(p => p.Key != Parameters.Prompt)
                .ToList();
            var prompt = string.Join(' ', request.GetPromptValues().Remove(PromptValues.Login));
            if (prompt.Length > 0) parameters.Add(new(Parameters.Prompt, prompt));
            return Results.Challenge(
                new AuthenticationProperties { RedirectUri = context.Request.PathBase + context.Request.Path + QueryString.Create(parameters) },
                [IdentityConstants.ApplicationScheme]);
        }

        var user = await users.GetUserAsync(result.Principal);
        if (user is null)
            return Results.Challenge(new AuthenticationProperties { RedirectUri = context.Request.PathBase + context.Request.Path + context.Request.QueryString },
                [IdentityConstants.ApplicationScheme]);

        // One token = one tenant. Ask for it, or take the only active membership, or let the user pick.
        var tenantId = RequestedTenant(request);
        if (tenantId is null)
        {
            var active = await db.TenantMemberships.AsNoTracking()
                .Where(m => m.UserId == user.Id && m.Status == MembershipStatus.Active)
                .Select(m => m.TenantId).ToListAsync(ct);
            if (active.Count == 1) tenantId = active[0];
            else if (active.Count > 1)
            {
                if (request.HasPromptValue(PromptValues.None))
                    return Forbid(Errors.InteractionRequired, "Several tenants are available: pass the 'tenant' parameter.");
                var returnUrl = context.Request.PathBase + context.Request.Path + QueryString.Create(ParametersOf(context.Request));
                return Results.Redirect("/Account/SelectTenant?returnUrl=" + Uri.EscapeDataString(returnUrl));
            }
            // No membership: only a platform role gets a token (without a tenant); CheckAsync decides.
        }

        var amr = TokenIssuer.ReadAmr(result.Principal!);
        if (await issuer.CheckAsync(user, tenantId, amr, ct) is { } refusal)
            return Forbid(refusal.Error, refusal.Description);

        var identity = await issuer.CreateIdentityAsync(user, tenantId, amr, request.GetScopes(), ct);
        var application = await applications.FindByClientIdAsync(request.ClientId!, ct)
            ?? throw new InvalidOperationException("The client application cannot be found.");
        var authorizationId = await tenantAuthorizations.CreateAsync(identity, (await applications.GetIdAsync(application, ct))!, user.Id, tenantId, ct);
        identity.SetAuthorizationId(authorizationId);

        return Results.SignIn(new ClaimsPrincipal(identity), authenticationScheme: OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);
    }

    private static async Task<IResult> TokenAsync(HttpContext context, UserManager<ApplicationUser> users, TokenIssuer issuer,
        IOpenIddictApplicationManager applications)
    {
        var request = context.GetOpenIddictServerRequest()
            ?? throw new InvalidOperationException("The OpenID Connect request cannot be retrieved.");
        var ct = context.RequestAborted;

        if (request.IsClientCredentialsGrantType())
        {
            // Service clients (Elsa, workers): sub = client_id, no tenant (each call carries X-Tenant, which the host checks).
            var application = await applications.FindByClientIdAsync(request.ClientId!, ct)
                ?? throw new InvalidOperationException("The client application cannot be found.");
            var identity = new ClaimsIdentity(TokenValidationParameters.DefaultAuthenticationType, Claims.Name, Claims.Role);
            identity.SetClaim(Claims.Subject, await applications.GetClientIdAsync(application, ct))
                    .SetClaim(Claims.Name, await applications.GetDisplayNameAsync(application, ct));
            identity.SetScopes(request.GetScopes());
            identity.SetResources(IdentityClaims.Audience);
            identity.SetDestinations(_ => [Destinations.AccessToken]);
            return Results.SignIn(new ClaimsPrincipal(identity), authenticationScheme: OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);
        }

        if (request.IsAuthorizationCodeGrantType() || request.IsRefreshTokenGrantType())
        {
            // OpenIddict has already validated the code / refresh token and that its authorization is not revoked.
            var principal = (await context.AuthenticateAsync(OpenIddictServerAspNetCoreDefaults.AuthenticationScheme)).Principal
                ?? throw new InvalidOperationException("The token principal cannot be retrieved.");

            var user = await users.FindByIdAsync(principal.GetClaim(Claims.Subject) ?? "");
            if (user is null)
                return Forbid(Errors.InvalidGrant, "The account no longer exists.");

            // Membership, lockout and the tenant's security policy are re-checked on every refresh.
            var tenantId = principal.GetClaim(IdentityClaims.Tenant);
            var amr = TokenIssuer.ReadAmr(principal);
            if (await issuer.CheckAsync(user, tenantId, amr, ct) is { } refusal)
                return Forbid(Errors.InvalidGrant, refusal.Description);

            var identity = await issuer.CreateIdentityAsync(user, tenantId, amr, principal.GetScopes(), ct);
            identity.SetAuthorizationId(principal.GetAuthorizationId());
            return Results.SignIn(new ClaimsPrincipal(identity), authenticationScheme: OpenIddictServerAspNetCoreDefaults.AuthenticationScheme);
        }

        return Forbid(Errors.UnsupportedGrantType, "The grant type is not supported.");
    }

    private static async Task<IResult> UserInfoAsync(HttpContext context, UserManager<ApplicationUser> users)
    {
        var principal = (await context.AuthenticateAsync(OpenIddictServerAspNetCoreDefaults.AuthenticationScheme)).Principal;
        var user = principal is null ? null : await users.FindByIdAsync(principal.GetClaim(Claims.Subject) ?? "");
        if (user is null)
            return Results.Challenge(authenticationSchemes: [OpenIddictServerAspNetCoreDefaults.AuthenticationScheme]);

        var claims = new Dictionary<string, object?>(StringComparer.Ordinal) { [Claims.Subject] = user.Id };
        if (principal!.GetClaim(IdentityClaims.Tenant) is { } tenant) claims[IdentityClaims.Tenant] = tenant;
        if (principal!.HasScope(Scopes.Profile)) claims[Claims.Name] = principal.GetClaim(Claims.Name);
        if (principal!.HasScope(Scopes.Email)) claims[Claims.Email] = user.Email;
        claims[Claims.Role] = principal.GetClaims(Claims.Role);
        return Results.Ok(claims);
    }

    private static async Task<IResult> EndSessionAsync(HttpContext context)
    {
        // Ends the identity-service session; OpenIddict then redirects to the validated post_logout_redirect_uri.
        await context.SignOutAsync(IdentityConstants.ApplicationScheme);
        return Results.SignOut(new AuthenticationProperties { RedirectUri = "/" }, [OpenIddictServerAspNetCoreDefaults.AuthenticationScheme]);
    }

    private static IResult Forbid(string error, string description) => Results.Forbid(
        new AuthenticationProperties(new Dictionary<string, string?>
        {
            [OpenIddictServerAspNetCoreConstants.Properties.Error] = error,
            [OpenIddictServerAspNetCoreConstants.Properties.ErrorDescription] = description,
        }),
        [OpenIddictServerAspNetCoreDefaults.AuthenticationScheme]);

    private static List<KeyValuePair<string, StringValues>> ParametersOf(HttpRequest request) =>
        request.HasFormContentType ? [.. request.Form] : [.. request.Query];
}
