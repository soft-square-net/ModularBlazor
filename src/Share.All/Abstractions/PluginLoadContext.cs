// Simple PluginLoadContext implementation
using System.Reflection;
using System.Runtime.Loader;

namespace soft.square.net.Share.All.Abstractions;
class PluginLoadContext : AssemblyLoadContext
{
    private AssemblyDependencyResolver _resolver;

    public PluginLoadContext(string pluginPath) : base(isCollectible: true)
    {
        _resolver = new AssemblyDependencyResolver(pluginPath);
    }

    protected override Assembly Load(AssemblyName assemblyName)
    {
        // 1. Check if the host already provides this assembly
        // This ensures types like Microsoft.Extensions.Logging are shared
        if (IsSharedDependency(assemblyName))
        {
            return null; // Returning null tells the ALC to look in the Default context (Host)
        }

        string assemblyPath = _resolver.ResolveAssemblyToPath(assemblyName);
        if (assemblyPath != null)
        {
            return LoadFromAssemblyPath(assemblyPath);
        }
        return null;
    }

    private bool IsSharedDependency(AssemblyName name)
    {
        // Define your shared logic: e.g., anything starting with "Microsoft.Extensions"
        // or specifically your Abstractions assembly.
        return name.Name.Contains("Abstractions") || name.Name.StartsWith("Microsoft.AspNetCore");
    }

    // [MethodImpl(MethodImplOptions.NoInlining)]
    public void RunAndUnload(string pluginPath)
    {
        var alc = new PluginLoadContext(pluginPath);
        var assembly = alc.LoadFromAssemblyPath(pluginPath);

        // Use a weak reference to track if it actually unloads later
        var alcWeakRef = new WeakReference(alc);

        // Execute plugin logic (e.g., via reflection)
        var type = assembly.GetType("MyPlugin.Runner");
        var method = type.GetMethod("DoWork");
        method.Invoke(null, null);

        // 1. Initiate unload
        alc.Unload();

        // 2. Clear references (important: alc must go out of scope or be nulled)


        // 3. Cleanup Loop (Optional, for verification)
        for (int i = 0; alcWeakRef.IsAlive && i < 10; i++)
        {
            GC.Collect();
            GC.WaitForPendingFinalizers();
        }
    }
}
