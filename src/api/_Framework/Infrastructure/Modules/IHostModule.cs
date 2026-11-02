using System.Reflection;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace soft.square.net.ModularBlazor.Infrastructure.Modules;

/// <summary>
/// Entry point of an API host module (modules/host/*). Implemented once per module, in its Infrastructure
/// project. The module's Carter endpoints are found in the same assembly as the implementing type.
/// </summary>
public interface IHostModule
{
    string Name { get; }

    /// <summary>The module's Application assembly: MediatR handlers and FluentValidation validators are registered from it.</summary>
    Assembly ApplicationAssembly { get; }

    /// <summary>Registers the module's DbContext, repositories, initializer and other infrastructure services.</summary>
    void AddServices(IServiceCollection services, IConfiguration configuration);

    /// <summary>
    /// Adds the module's middleware / endpoints to the pipeline (after authentication and authorization,
    /// before Carter). Most modules have none: their Carter endpoints are enough.
    /// </summary>
    void Configure(WebApplication app) { }
}
