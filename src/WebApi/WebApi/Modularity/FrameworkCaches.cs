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
/// <item>TypeDescriptor providers' per-type data (ReflectTypeDescriptionProvider._typeData) — evicted through the provider chain.</item>
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

        EvictTypeDescriptionProviders(context);
        ClearIdleLogRecords();
        ClearExpressionCaches();
    }

    /// <summary>
    /// System.Linq.Expressions keeps process-wide caches keyed by delegate types, methods and parameter types:
    /// Expression.s_lambdaFactories / s_lambdaDelegateCache, the interpreter's CallInstruction.s_cache (CacheDict arrays)
    /// and DelegateHelpers._DelegateCache (a tree of Type → TypeInfo). EF Core fills them when it evaluates a closure
    /// expression in a query, e.g. Where(i => i.Sku == sku.Trim()): it interprets the sub-expression, and the interpreter's
    /// InstructionList.s_loadFields then keeps the closure's FieldInfo, hence the module. Found by bisecting and a
    /// reflection walk of all statics (gcroot showed only the module's own handles).
    /// All of them are rebuildable caches, so they are cleared outright.
    /// </summary>
    private static void ClearExpressionCaches()
    {
        var assembly = typeof(System.Linq.Expressions.Expression).Assembly;
        const BindingFlags statics = BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public;

        foreach (var (typeName, fieldName) in (ReadOnlySpan<(string, string)>)[
                     ("System.Linq.Expressions.Expression", "s_lambdaFactories"),
                     ("System.Linq.Expressions.Expression", "s_lambdaDelegateCache"),
                     ("System.Linq.Expressions.Interpreter.CallInstruction", "s_cache")])
        {
            // CacheDict<TKey, TValue>: a fixed array of immutable entries; readers check each entry, so null is a miss.
            var cache = assembly.GetType(typeName)?.GetField(fieldName, statics)?.GetValue(null);
            if (cache?.GetType().GetField("_entries", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(cache) is Array entries)
                Array.Clear(entries);
        }

        // The interpreter's LoadField instructions by FieldInfo, used under lock(s_loadFields). This one held the module:
        // the FieldInfo of a closure field (the captured value of a specification) keeps its declaring type alive.
        if (assembly.GetType("System.Linq.Expressions.Interpreter.InstructionList")?.GetField("s_loadFields", statics)?.GetValue(null) is IDictionary loadFields)
            lock (loadFields) loadFields.Clear();

        // DelegateHelpers walks and grows this tree under lock(_DelegateCache); dropping the chain makes it start over.
        var delegateCache = assembly.GetType("System.Linq.Expressions.Compiler.DelegateHelpers")?.GetField("_DelegateCache", statics)?.GetValue(null);
        var chain = delegateCache?.GetType().GetField("TypeChain", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        if (delegateCache is not null && chain is not null)
            lock (delegateCache) chain.SetValue(delegateCache, null);
    }

    /// <summary>
    /// OpenTelemetry's shared LogRecord pool (used when logs are exported in batches, e.g. OTLP to the Aspire dashboard)
    /// keeps each idle record's last data — exception, state, attributes, scopes — until its slot is rented again,
    /// which on a quiet replica can take thousands of log calls (2048 slots). Found with gcroot: a DbUpdateException that
    /// EF Core logged once (its entries → change tracker → the module's DbContext) kept the module from unloading.
    /// Idle records were already exported, so their data is dropped. A record rented in the same instant could lose its
    /// exception or attributes: one log entry, at admin time.
    /// </summary>
    private static void ClearIdleLogRecords()
    {
        var poolType = AppDomain.CurrentDomain.GetAssemblies()
            .Where(a => a.GetName().Name == "OpenTelemetry")
            .Select(a => a.GetType("OpenTelemetry.Logs.LogRecordSharedPool", throwOnError: false))
            .FirstOrDefault(t => t is not null);
        var pool = poolType?.GetField("Current", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(null);
        if (pool is null || poolType!.GetField("pool", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(pool) is not Array records) return;

        foreach (var record in records)
        {
            if (record is null) continue; // rented right now: in use, not idle
            var type = record.GetType();
            foreach (var name in (string[])["Exception", "Attributes", "State"])
            {
                try { type.GetProperty(name, BindingFlags.Instance | BindingFlags.Public)?.SetValue(record, null); }
                catch (TargetInvocationException) { }
            }
            foreach (var name in (string[])["AttributeStorage", "ScopeStorage"])
                (type.GetField(name, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public)?.GetValue(record) as IList)?.Clear();
        }
    }

    /// <summary>
    /// TypeDescriptor's providers cache per-type data in instance fields, e.g. ReflectTypeDescriptionProvider._typeData
    /// (ReflectedTypeData by Type). Neither the ClearCache hook nor the static eviction reaches it: it sits behind
    /// TypeDescriptor.s_providerTable → TypeDescriptionNode (Next chain) → Provider. Any TypeDescriptor.GetConverter on a
    /// module type fills it, and ApiExplorer does that for every parameter and response type (ModelMetadata.IsComplexType),
    /// so generating any OpenAPI document pinned every routed module. gcroot did not report this path; a reflection walk
    /// of the statics did.
    /// </summary>
    private static void EvictTypeDescriptionProviders(AssemblyLoadContext context)
    {
        const BindingFlags statics = BindingFlags.Static | BindingFlags.NonPublic;
        var descriptor = typeof(System.ComponentModel.TypeDescriptor);
        if (descriptor.GetField("s_providerTable", statics)?.GetValue(null) is not IDictionary table) return;

        object[] nodes;
        lock (descriptor.GetField("s_commonSyncObject", statics)?.GetValue(null) ?? table)
            nodes = table.Values.Cast<object>().ToArray();

        foreach (var first in nodes)
        for (var node = first; node is not null; node = Field(node, "Next"))
            EvictDictionaries(Field(node, "Provider"), context);

        static object? Field(object owner, string name) =>
            owner.GetType().GetField(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(owner);
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
        "System.ComponentModel.TypeDescriptor",                   // s_defaultProviderInitialized; not covered by its ClearCache hook
        "System.ComponentModel.ReflectTypeDescriptionProvider"    // s_attributeCache, s_propertyCache, ... (Type-keyed Hashtables)
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
