using FluentValidation;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace soft.square.net.ModularBlazor.Infrastructure.Modules;

public static class HostModuleExtensions
{
    /// <summary>
    /// Registers the host modules: each module's own services, plus CQRS for all of them
    /// (MediatR handlers, FluentValidation validators, and the validation pipeline behavior).
    /// </summary>
    public static IServiceCollection AddHostModules(this IServiceCollection services, IConfiguration configuration,
        IEnumerable<IHostModule> modules)
    {
        var list = modules.ToList();
        foreach (var module in list)
            module.AddServices(services, configuration);

        var applicationAssemblies = list.Select(m => m.ApplicationAssembly).Distinct().ToArray();

        services.AddMediatR(cfg =>
        {
            cfg.RegisterServicesFromAssemblies(applicationAssemblies);
            cfg.AddOpenBehavior(typeof(ValidationBehavior<,>));
        });
        services.AddValidatorsFromAssemblies(applicationAssemblies);

        services.TryAddSingleton(TimeProvider.System);

        // Validation failures thrown by the pipeline become 400 problem+json responses (see UseExceptionHandler in the host).
        services.AddProblemDetails();
        services.AddExceptionHandler<ValidationExceptionHandler>();
        services.AddExceptionHandler<CustomExceptionHandler>();

        return services;
    }

    /// <summary>Lets each module add its middleware (see <see cref="IHostModule.Configure"/>).</summary>
    public static WebApplication UseHostModules(this WebApplication app, IEnumerable<IHostModule> modules)
    {
        foreach (var module in modules)
            module.Configure(app);
        return app;
    }
}
