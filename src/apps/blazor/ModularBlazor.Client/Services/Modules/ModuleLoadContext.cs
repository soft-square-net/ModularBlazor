using System.Reflection;
using System.Runtime.Loader;

namespace soft.square.net.ModularBlazor.Client.Services;

/// <summary>
/// One load context per module, so a module's assemblies are owned by it (and can be dropped with it) instead of
/// being pinned in the default context for the life of the page. Anything this context cannot resolve falls back to the
/// default context, which is where the host and the shared abstractions live - so type identity is preserved.
/// </summary>
internal sealed class ModuleLoadContext : AssemblyLoadContext
{
  private readonly Func<AssemblyName, Assembly?> _resolveFromOtherModules;

  public ModuleLoadContext(string moduleId, bool collectible, Func<AssemblyName, Assembly?> resolveFromOtherModules)
      : base($"module:{moduleId}", collectible)
  {
    _resolveFromOtherModules = resolveFromOtherModules;
  }

  // Lets module B reference an assembly that module A brought along. Null means "ask the default context".
  protected override Assembly? Load(AssemblyName assemblyName) => _resolveFromOtherModules(assemblyName);
}
