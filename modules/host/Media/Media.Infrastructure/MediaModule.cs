using System.Reflection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Media.Application.Images;
using soft.square.net.ModularBlazor.Host.Modules.Media.Domain;
using soft.square.net.ModularBlazor.Host.Modules.Media.Infrastructure.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Media.Infrastructure.Storage;
using soft.square.net.ModularBlazor.Infrastructure.Modules;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Media.Infrastructure;

/// <summary>
/// Images edited with MudTail's MudImageEditor: /api/v1/media/images. Keeps the untouched original, the exported
/// sizes and the recipe that regenerates them (configuration section "Media").
/// </summary>
public sealed class MediaModule : IHostModule
{
    public string Name => SchemaNames.Media;

    public Assembly ApplicationAssembly => typeof(CreateMediaImageCommand).Assembly;

    public void AddServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddModuleDbContext<MediaDbContext>(Name);
        services.AddModuleRepository<MediaDbContext, MediaImage>();
        services.AddScoped<IDbInitializer, MediaDbInitializer>();

        services.AddSingleton(configuration.GetSection(MediaOptions.SectionName).Get<MediaOptions>() ?? new MediaOptions());
        services.AddSingleton<IMediaStore, LocalDiskMediaStore>();
    }
}
