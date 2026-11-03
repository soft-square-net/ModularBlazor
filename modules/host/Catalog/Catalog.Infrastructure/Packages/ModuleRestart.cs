using Microsoft.Extensions.Hosting;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Packages;

/// <summary>
/// Stops the app so that a supervisor can rebuild it and start it again (scripts/run-host.*). The app cannot
/// rebuild itself: it leaves a restart.requested marker in the module store, which tells the supervisor that this
/// exit was asked for and a rebuild is wanted.
/// </summary>
public interface IModuleRestart
{
    /// <summary>Marks the store and stops the application shortly after (so the response can be sent first).</summary>
    void Request();
}

internal sealed class ModuleRestart(ModuleStoreOptions options, IHostApplicationLifetime lifetime) : IModuleRestart
{
    public void Request()
    {
        Directory.CreateDirectory(options.FullPath);
        File.WriteAllText(Path.Combine(options.FullPath, "restart.requested"), DateTime.UtcNow.ToString("O"));
        _ = Task.Run(async () =>
        {
            await Task.Delay(TimeSpan.FromMilliseconds(500));
            lifetime.StopApplication();
        });
    }
}
