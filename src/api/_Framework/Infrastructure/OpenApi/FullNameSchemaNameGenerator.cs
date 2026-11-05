using NJsonSchema.Generation;
using System.Text.RegularExpressions;

namespace soft.square.net.ModularBlazor.Infrastructure.OpenApi;

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
