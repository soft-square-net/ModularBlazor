using System.Reflection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Tokens;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Services;
using soft.square.net.ModularBlazor.Infrastructure.Modules;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure;

/// <summary>Users, roles, permissions, JWT tokens (with refresh) and API keys, per tenant.</summary>
public sealed class AuthModule : IHostModule
{
    public string Name => "Auth";

    public Assembly ApplicationAssembly => typeof(TokenIssuer).Assembly;

    public void AddServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<AuthDbContext>(Name);
        services.AddModuleRepository<AuthDbContext, User>();
        services.AddModuleRepository<AuthDbContext, Role>();
        services.AddModuleRepository<AuthDbContext, RefreshToken>();
        services.AddModuleRepository<AuthDbContext, ApiKey>();
        services.AddScoped<IDbInitializer, AuthDbInitializer>();

        services.AddSingleton<IPasswordService, PasswordService>();
        services.AddScoped<ITokenService, JwtTokenService>();
        services.AddScoped<IApiKeyValidator, ApiKeyValidator>();

        // Application services used by the handlers.
        services.AddScoped<UserAccessResolver>();
        services.AddScoped<TokenIssuer>();
        services.AddScoped<Application.Users.UserDetails>();
    }
}
