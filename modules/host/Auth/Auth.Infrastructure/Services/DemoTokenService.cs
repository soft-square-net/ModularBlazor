using soft.square.net.ModularBlazor.Core;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Abstractions;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Services;

/// <summary>DEMO ONLY token ("demo-" + role). Replace with JWT/OIDC.</summary>
public sealed class DemoTokenService : ITokenService
{
    public string Issue(string role) => DemoToken.Issue(role);
}
