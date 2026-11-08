namespace soft.square.net.ModularBlazor.Abstractions.Auth;

public interface ICurrentUserService
{
  /// <summary>Returns the current authenticated user info or null when not authenticated.</summary>
  System.Threading.Tasks.Task<UserInfo?> GetUserInfoAsync();

  /// <summary>Raised when the user signs in, signs out or the token is replaced.</summary>
  event Action? Changed;
}
