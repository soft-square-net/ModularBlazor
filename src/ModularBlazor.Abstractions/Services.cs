using soft.square.net.Share.All;

namespace soft.square.net.ModularBlazor.Abstractions;

///// <summary>Registered by the host; modules inject it (login page, layouts).</summary>
//public interface IAuthService
//{
//  bool IsAuthenticated { get; }
//  string? UserName { get; }
//  string? Role { get; }
//  event Action? Changed;

//  /// <summary>On success the user's module metadata has been fetched.</summary>
//  Task<bool> LoginAsync(string tenantId, string userName, string password);
//  Task LogoutAsync();
//}

/// <summary>Menu items of every module the user may see (from metadata, before the code is loaded).</summary>
public interface IModuleNavigation
{
  IReadOnlyList<ModuleNavItem> Items { get; }
  /// <summary>Fetches the signed-in user's module metadata from the API (the token decides which modules).</summary>
  Task LoadUserModulesAsync(string? tenantId = null);
  event Action? Changed;
}
