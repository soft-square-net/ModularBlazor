
using soft.square.net.ModularBlazor.Abstractions.Api;


namespace soft.square.net.ModularBlazor.Abstractions.Auth;

public interface IAuthenticationService
{
  /// <summary>Raised after sign-in and sign-out.</summary>
  event Action? Changed;
  void NavigateToExternalLogin(string returnUrl);

  Task<bool> LoginAsync(string tenantId, LoginCommand request);

  Task LogoutAsync();

  Task ReLoginAsync(string returnUrl);
}