namespace soft.square.net.WebApi.Modularity;

/// <summary>
/// Host services told when a module copy is loaded on this replica and before it is released (unload, swap, failed load).
/// An observer must drop every reference to <c>moduleServices</c>, and finish any work using it, in
/// <see cref="ReleasingAsync"/>; otherwise the module's load context cannot be collected.
/// </summary>
internal interface IModuleLifecycleObserver
{
    void Loaded(string moduleId, IServiceProvider moduleServices);

    Task ReleasingAsync(string moduleId, IServiceProvider moduleServices);
}
