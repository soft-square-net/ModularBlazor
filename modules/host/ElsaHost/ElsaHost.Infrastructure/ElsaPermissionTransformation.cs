using Microsoft.AspNetCore.Authentication;
using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using System.Security.Claims;
using System.Threading.Tasks;

namespace soft.square.net.ModularBlazor.Host.Modules.ElsaHost.Infrastructure;


public class ElsaPermissionTransformation : IClaimsTransformation
{
  public Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
  {
    if (principal.Identity is not ClaimsIdentity identity || !identity.IsAuthenticated)
    {
      return Task.FromResult(principal);
    }

    // Prevent adding duplicate claims if already transformed
    if (!identity.HasClaim(c => c.Type == "permissions"))
    {
      // Map your custom host roles/claims to Elsa's resource:verb format
      if (principal.IsInRole("Administrator") || identity.HasClaim(ClaimTypes.Role, "Admin"))
      {
        // Grants full wildcard access to all Elsa resources and verbs
        identity.AddClaim(new Claim("permissions", "*"));
      }
      else
      {
        // Or grant specific granular resource:verb permissions for standard users
        identity.AddClaim(new Claim("permissions", "workflows/definitions:view"));
        identity.AddClaim(new Claim("permissions", "workflows/instances:view"));
        identity.AddClaim(new Claim("permissions", "workflows/instances:execute"));
      }
    }

    return Task.FromResult(principal);
  }
}