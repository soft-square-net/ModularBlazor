using System.Text.RegularExpressions;
using NJsonSchema.Generation;
using NSwag.Generation.Processors;
using NSwag.Generation.Processors.Contexts;

namespace soft.square.net.ModularBlazor.Host;

/// <summary>
/// Keeps Elsa's endpoints in their own OpenAPI document ("elsa") so they cannot break the main one ("v1") that
/// Scalar and ReDoc render: the main document leaves them out, the Elsa document contains nothing else.
/// </summary>
internal sealed class ElsaApiOperationProcessor(string elsaBasePath, bool includeElsa) : IOperationProcessor
{
    public bool Process(OperationProcessorContext context)
    {
        var isElsa = context.OperationDescription.Path.StartsWith(elsaBasePath, StringComparison.OrdinalIgnoreCase);
        return isElsa == includeElsa;
    }
}

/// <summary>
/// Schema ids from the full type name (generics flattened). Elsa has many types with the same short name in
/// different namespaces, which makes the default generator collide and the document fail.
/// </summary>
internal sealed partial class FullNameSchemaNameGenerator : ISchemaNameGenerator
{
    public string Generate(Type type) => NonWord().Replace(type.FullName ?? type.Name, "_");

    [GeneratedRegex(@"[^A-Za-z0-9]+")]
    private static partial Regex NonWord();
}
