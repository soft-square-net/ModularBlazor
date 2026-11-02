using System.Reflection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Abstractions;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Commands.Login;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Services;
using soft.square.net.ModularBlazor.Infrastructure.Modules;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure;

public sealed class AuthModule : IHostModule
{
    public string Name => "Auth";

    public Assembly ApplicationAssembly => typeof(LoginCommand).Assembly;

    public void AddServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<AuthDbContext>(Name);
        services.AddModuleRepository<AuthDbContext, User>();
        services.AddScoped<IDbInitializer, AuthDbInitializer>();
        services.AddSingleton<ITokenService, DemoTokenService>();
    }
}
