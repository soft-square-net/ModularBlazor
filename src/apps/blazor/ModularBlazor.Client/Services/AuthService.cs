using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.ModularBlazor.Abstractions.Api;

namespace soft.square.net.ModularBlazor.Client.Services;

/// <summary>
/// Demo authentication: any non-empty user name and password signs in; the user name "admin" gets
/// the admin role. Replace LoginAsync with a call to your identity provider.
/// </summary>
public sealed class AuthService(ModuleManager modules, IApiClient apiClient) : IAuthService
{
    public bool IsAuthenticated => UserName is not null;
    public string? UserName { get; private set; }
    public string? Role { get; private set; }

    public event Action? Changed;

    public async Task<bool> LoginAsync(string tenantId, string userName, string password)
    {
        if (string.IsNullOrWhiteSpace(userName) || string.IsNullOrEmpty(password)) return false;

        var role = userName.Trim().Equals("admin", StringComparison.OrdinalIgnoreCase) ? "admin" : "user";

        var token = apiClient.IssueTokenAsync(tenantId, new() { UserName = userName, Password = password });

        // Phase 2: only now does the app learn which modules this user has (metadata only).
        await modules.LoadUserModulesAsync(role);

        UserName = userName.Trim();
        Role = role;
        Changed?.Invoke();
        return true;
    }

    public Task LogoutAsync()
    {
        UserName = null;
        Role = null;
        modules.ForgetUserModules();
        Changed?.Invoke();
        return Task.CompletedTask;
    }
}
