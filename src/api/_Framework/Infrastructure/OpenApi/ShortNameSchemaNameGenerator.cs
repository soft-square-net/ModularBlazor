using NJsonSchema.Generation;

namespace soft.square.net.ModularBlazor.Infrastructure.OpenApi;

/// <summary>
/// Schema names without namespaces: LoginCommand, RoleDto, PagedResponseOfApiKeyDto. The NSwag C# client generator
/// turns schema names into class names, so a name such as "soft.square.net...Auth.Application.Tokens.LoginCommand"
/// becomes "SoftsquarenetModularBlazorHostModulesAuthApplicationTokensLoginCommand".
/// Two types with the same short name get a numeric suffix from NJsonSchema (Foo, Foo2) instead of clashing.
/// </summary>
internal sealed class ShortNameSchemaNameGenerator : ISchemaNameGenerator
{
  public string Generate(Type type) => NameOf(type);

  private static string NameOf(Type type)
  {
    if (type.IsArray)
      return NameOf(type.GetElementType()!) + "Array";

    if (!type.IsGenericType)
      return type.Name;

    var name = type.GetGenericTypeDefinition().Name;
    var tick = name.IndexOf('`');
    if (tick > 0) name = name[..tick];

    return name + "Of" + string.Join("And", type.GetGenericArguments().Select(NameOf));
  }
}
