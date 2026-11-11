using System.Collections;
using System.Reflection;
using System.Reflection.Metadata;
using System.Runtime.Loader;

namespace soft.square.net.WebApi.Modularity;

/// <summary>
/// Evicts a module's types from process-wide framework caches so its load context can be collected.
/// Found with a heap dump (dotnet-dump gcroot) of a module that would not unload:
/// <list type="bullet">
/// <item>ParameterBindingMethodCache (Minimal API parameter binding; also used by OpenAPI) — private statics, evicted by reflection.</item>
/// <item>TypeDescriptor / reflection caches — cleared through the framework's own hot-reload [MetadataUpdateHandler] ClearCache hooks.</item>
/// <item>OpenAPI singletons (OpenApiSchemaService keeps a Type → schema id map per document) — Type-keyed fields evicted.</item>
/// </list>
/// The host's JSON metadata cache is avoided rather than evicted: each module gets its own JsonOptions (see ModuleRuntime.Load).
/// These are framework internals: best-effort, re-verify after each .NET upgrade (the unload result reports success).
/// </summary>
internal static class FrameworkCaches
{
    /// <summary>
    /// Namespaces whose host singletons only keep rebuildable caches in their dictionary fields (schema ids by Type,
    /// operation transformer contexts by operation id, ...). Those dictionaries are cleared outright on unload;
    /// the next document request recomputes them.
    /// </summary>
    private static readonly string[] SingletonCacheNamespaces = ["Microsoft.AspNetCore.OpenApi"];

    public static void Evict(AssemblyLoadContext context, IServiceProvider hostRoot, IEnumerable<ServiceDescriptor> hostServices)
    {
        foreach (var descriptor in hostServices)
        {
            if (descriptor.Lifetime != ServiceLifetime.Singleton || descriptor.ServiceType.ContainsGenericParameters) continue;
            if (!SingletonCacheNamespaces.Any(ns => descriptor.ServiceType.Namespace?.StartsWith(ns, StringComparison.Ordinal) == true)) continue;
            try
            {
                var instance = descriptor.IsKeyedService
                    ? (hostRoot as IKeyedServiceProvider)?.GetKeyedService(descriptor.ServiceType, descriptor.ServiceKey)
                    : hostRoot.GetService(descriptor.ServiceType);
                ClearDictionaries(instance);
            }
            catch (InvalidOperationException) { } // not constructible here; nothing cached either
        }

        var moduleTypes = context.Assemblies.SelectMany(LoadableTypes).ToArray();

        // ParameterBindingMethodCache is shared source: Http.Extensions, ApiExplorer and OpenApi each compile their own copy.
        foreach (var cacheType in CacheTypes())
        foreach (var field in cacheType.GetFields(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic))
        {
            var value = field.GetValue(null);
            if (value is IDictionary) EvictKeys((IDictionary)value, context);
            else EvictDictionaries(value, context);
        }

        foreach (var clearCache in ClearCacheHandlers.Value)
        {
            try { clearCache.Invoke(null, [moduleTypes]); }
            catch (TargetInvocationException) { } // a handler failing must not fail the unload
        }
    }

    /// <summary>Static ClearCache(Type[]?) methods of the framework's hot-reload metadata update handlers.</summary>
    private static readonly Lazy<MethodInfo[]> ClearCacheHandlers = new(() =>
        AppDomain.CurrentDomain.GetAssemblies()
            .Where(a => !a.IsCollectible && !a.IsDynamic)
            .SelectMany(a => a.GetCustomAttributes<MetadataUpdateHandlerAttribute>())
            .Select(attribute => attribute.HandlerType.GetMethod("ClearCache", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic, [typeof(Type[])]))
            .OfType<MethodInfo>()
            .Distinct()
            .ToArray());

    /// <summary>Framework types whose static Type-keyed dictionaries (directly or one object deep) never evict.</summary>
    private static readonly string[] CacheTypeNames =
    [
        "Microsoft.AspNetCore.Http.ParameterBindingMethodCache", // Minimal API parameter binding, ApiExplorer, OpenAPI
        "System.ComponentModel.TypeDescriptor"                    // s_defaultProviderInitialized; not covered by its ClearCache hook
    ];

    // Looked up on every eviction: assemblies such as ApiExplorer load lazily.
    private static Type[] CacheTypes() =>
        AppDomain.CurrentDomain.GetAssemblies()
            .Where(a => !a.IsCollectible && !a.IsDynamic)
            .SelectMany(a => CacheTypeNames.Select(name => a.GetType(name, throwOnError: false)))
            .OfType<Type>()
            .ToArray();

    private static void ClearDictionaries(object? owner)
    {
        if (owner is null) return;
        foreach (var field in owner.GetType().GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic))
        {
            if (field.GetValue(owner) is not IDictionary { IsReadOnly: false } cache) continue;
            try { cache.Clear(); }
            catch (NotSupportedException) { }
        }
    }

    private static void EvictDictionaries(object? owner, AssemblyLoadContext context)
    {
        if (owner is null) return;
        foreach (var field in owner.GetType().GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic))
            if (field.GetValue(owner) is IDictionary cache)
                EvictKeys(cache, context);
    }

    private static void EvictKeys(IDictionary cache, AssemblyLoadContext context)
    {
        foreach (var key in cache.Keys.Cast<object>().ToArray())
            if (key is Type type && Belongs(type, context))
                cache.Remove(key);
    }

    private static bool Belongs(Type type, AssemblyLoadContext context) =>
        type.HasElementType
            ? Belongs(type.GetElementType()!, context)
            : AssemblyLoadContext.GetLoadContext(type.Assembly) == context
              || (type.IsConstructedGenericType && type.GenericTypeArguments.Any(t => Belongs(t, context)));

    private static IEnumerable<Type> LoadableTypes(Assembly assembly)
    {
        try { return assembly.GetTypes(); }
        catch (ReflectionTypeLoadException e) { return e.Types.OfType<Type>(); }
    }
}
