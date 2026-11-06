using System;
using System.Collections.Generic;
using System.Text;
using soft.square.net.ModularBlazor.Abstractions.Api;
namespace soft.square.net.ModularBlazor.Abstractions.Auth;

public interface IAuthenticationService
{
  void NavigateToExternalLogin(string returnUrl);

  Task<bool> LoginAsync(string tenantId, SoftsquarenetModularBlazorHostModulesAuthApplicationTokensLoginCommand request);

  Task LogoutAsync();

  Task ReLoginAsync(string returnUrl);
}
