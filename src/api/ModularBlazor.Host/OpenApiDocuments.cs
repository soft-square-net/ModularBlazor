using System.Text.RegularExpressions;
using NJsonSchema.Generation;
using NSwag.Generation.AspNetCore;
using NSwag.Generation.Processors;
using NSwag.Generation.Processors.Contexts;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Routing;
using System.Text.Json.Serialization;

namespace soft.square.net.ModularBlazor.Host;



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

/// <summary>
/// Generates the Elsa OpenAPI document without invoking NSwag operation
/// discovery. Elsa 3 registers FastEndpoints through middleware, and NSwag can
/// normalize several of those routes to the same method/path combination.
/// </summary>
internal static class ElsaOpenApiDocumentGenerator
{
  public static object Generate(string basePath, IEnumerable<EndpointDataSource> endpointSources)
  {
    var prefix = "/" + basePath.Trim('/');
    var paths = new Dictionary<string, Dictionary<string, object>>(StringComparer.OrdinalIgnoreCase);
    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    foreach (var endpoint in endpointSources.SelectMany(source => source.Endpoints))
    {
      if (endpoint is not RouteEndpoint routeEndpoint)
        continue;

      var route = routeEndpoint.RoutePattern.RawText;
      if (string.IsNullOrWhiteSpace(route) || !route.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        continue;

      var methods = endpoint.Metadata.GetMetadata<IHttpMethodMetadata>()?.HttpMethods;
      if (methods is null || methods.Count == 0)
        continue;

      var path = route.StartsWith('/') ? route : "/" + route;
      if (!paths.TryGetValue(path, out var operations))
      {
        operations = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        paths[path] = operations;
      }

      foreach (var method in methods)
      {
        var operationKey = $"{method}:{path}";
        if (!seen.Add(operationKey))
          continue;

        operations[method.ToLowerInvariant()] = new
        {
          operationId = endpoint.DisplayName ?? $"{method} {path}",
          tags = new[] { "Elsa" },
          security = new object[]
          {
            new Dictionary<string, string[]> { ["JWT"] = Array.Empty<string>() },
            new Dictionary<string, string[]> { ["ApiKey"] = Array.Empty<string>() }
          },
          responses = new Dictionary<string, object>
          {
            ["200"] = new { description = "The request completed successfully." },
            ["400"] = new { description = "The request was invalid." },
            ["401"] = new { description = "Authentication is required." }
          }
        };
      }
    }

    return new
    {
      openapi = "3.0.1",
      info = new { title = "Elsa V3 Workflows API", version = "v3", description = "The embedded Elsa workflow engine API." },
      components = new
      {
        securitySchemes = new Dictionary<string, object>
        {
          ["JWT"] = new
          {
            type = "http",
            scheme = "bearer",
            bearerFormat = "JWT",
            description = "Token from POST /api/v1/identity/tokens."
          },
          ["ApiKey"] = new
          {
            type = "apiKey",
            @in = "header",
            name = "X-API-Key",
            description = "Key from POST /api/v1/identity/api-keys."
          }
        }
      },
      paths
    };
  }
}


internal sealed class ElsaNamespaceOperationProcessor : IOperationProcessor
{
  private readonly string _allowedNamespace;

  public ElsaNamespaceOperationProcessor(string allowedNamespace)
  {
    _allowedNamespace = allowedNamespace;
  }

  public bool Process(OperationProcessorContext context)
  {
    //if (context is not AspNetCoreOperationProcessorContext aspNetCoreContext)
    //  return false;
    //var controllerType = aspNetCoreContext.ControllerType;
    //if (controllerType?.Namespace == null)
    //  return false;

    //return controllerType.Namespace.StartsWith(_allowedNamespace, StringComparison.OrdinalIgnoreCase);
    HashSet<string> _processedPaths = new();
    if (context.ControllerType?.Namespace == null) return false;
     if(!context.ControllerType.Namespace.StartsWith(_allowedNamespace)) return false;
    string path = context.OperationDescription?.Path;
    if(path != null && !_processedPaths.Add(path))
    {
      return false;
    }
    return true;
  }
}

public sealed class SafeElsaSchemaProcessor : ISchemaProcessor
{
  public void Process(SchemaProcessorContext context)
  {
    var typeName = context.Type.Name;

    // Skip problematic activity or dynamic variable types that trigger reflection loops
    if (typeName.Contains("Activity") || typeName.Contains("IActivity") || typeName.Contains("WorkflowGraph"))
    {
      // Clear schema properties to prevent deep recursive tree scanning
      context.Schema.Properties.Clear();
    }
  }
}

//internal sealed class ElsaApiOperationProcessor : IOperationProcessor
//{
//  private readonly string _basePath;
//  private readonly bool _includeElsa;
//  private readonly HashSet<string> _processedOperations = new(StringComparer.OrdinalIgnoreCase);

//  public ElsaApiOperationProcessor(string basePath, bool includeElsa)
//  {
//    _basePath = basePath.TrimStart('/');
//    _includeElsa = includeElsa;
//  }

//  public bool Process(OperationProcessorContext context)
//  {
//    try
//    {
//      if (context is not AspNetCoreOperationProcessorContext aspNetCoreContext)
//        return true;

//      var route = aspNetCoreContext.ApiDescription.RelativePath?.TrimStart('/');
//      if (string.IsNullOrEmpty(route))
//        return !_includeElsa;

//      bool isElsaRoute = route.StartsWith(_basePath, StringComparison.OrdinalIgnoreCase) ||
//                         route.Contains("elsa", StringComparison.OrdinalIgnoreCase);

//      if (isElsaRoute && _includeElsa)
//      {
//        Elsa 3.9 exposes multiple FastEndpoints whose ApiExplorer routes
//         normalize to the same OpenAPI method/ path.Keep the first one so
//         NSwag cannot fail while adding a duplicate operation.
//        var method = context.OperationDescription.Method.ToString();
//        var path = context.OperationDescription.Path.TrimStart('/');
//        if (!_processedOperations.Add($"{method}:{path}"))
//          return false;
//      }

//      return _includeElsa ? isElsaRoute : !isElsaRoute;
//    }
//    catch
//    {
//      Suppress malformed endpoint reflection errors from crashing the document generator
//      return false;
//    }
//  }
//}


internal sealed class ElsaApiOperationProcessor(string elsaBasePath, bool includeElsa) : IOperationProcessor
{
  public bool Process(OperationProcessorContext context)
  {
    // var isElsa = context.OperationDescription.Path.StartsWith(elsaBasePath, StringComparison.OrdinalIgnoreCase);
    var isElsa = context.OperationDescription.Path.Contains("elsa/", StringComparison.OrdinalIgnoreCase);
    return isElsa == includeElsa;
  }
}


//internal sealed class ElsaApiOperationProcessor(string elsaBasePath, bool includeElsa) : IOperationProcessor
//{
//  public bool Process(OperationProcessorContext context)
//  {
//    // Use ApiExplorer's route template: Elsa FastEndpoints can expose a normalized NSwag path that drops
//    // route parameters, making distinct journal operations collide in the generated document.
//    var relativePath = (context as AspNetCoreOperationProcessorContext)?.ApiDescription.RelativePath;
//    var path = (relativePath ?? context.OperationDescription.Path).TrimStart('/');
//    var basePath = elsaBasePath.Trim('/');
//    var isElsa = path.Equals(basePath, StringComparison.OrdinalIgnoreCase)
//        || path.StartsWith(basePath + "/", StringComparison.OrdinalIgnoreCase);

//    if (isElsa && relativePath is not null)
//      context.OperationDescription.Path = "/" + path;

//    if (isElsa && includeElsa
//        && context.Document.Paths.TryGetValue(context.OperationDescription.Path, out var existingPath)
//        && existingPath.ContainsKey(context.OperationDescription.Method))
//    {
//      // Elsa 3.9 has distinct FastEndpoints routes that collapse to the same NSwag path. Retain the first
//      // operation for each method/path so a collision cannot make the full document return HTTP 500.
//      return false;
//    }

//    return isElsa == includeElsa;
//  }
//}
///// <summary>
///// Keeps Elsa's endpoints in their own OpenAPI document ("elsa") so they cannot break the main one ("v1") that
///// Scalar and ReDoc render: the main document leaves them out, the Elsa document contains nothing else.
///// </summary>
//internal sealed class ElsaApiOperationProcessor(string elsaBasePath, bool includeElsa) : IOperationProcessor
//{
//    public bool Process(OperationProcessorContext context)
//    {
//        // Use ApiExplorer's route template: Elsa FastEndpoints can expose a normalized NSwag path that drops
//        // route parameters, making distinct journal operations collide in the generated document.
//        var relativePath = (context as AspNetCoreOperationProcessorContext)?.ApiDescription.RelativePath;
//        var path = (relativePath ?? context.OperationDescription.Path).TrimStart('/');
//        var basePath = elsaBasePath.Trim('/');
//        var isElsa = path.Equals(basePath, StringComparison.OrdinalIgnoreCase)
//            || path.StartsWith(basePath + "/", StringComparison.OrdinalIgnoreCase);

//        if (isElsa && relativePath is not null)
//            context.OperationDescription.Path = "/" + path;

//        if (isElsa && includeElsa
//            && context.Document.Paths.TryGetValue(context.OperationDescription.Path, out var existingPath)
//            && existingPath.ContainsKey(context.OperationDescription.Method))
//        {
//            // Elsa 3.9 has distinct FastEndpoints routes that collapse to the same NSwag path. Retain the first
//            // operation for each method/path so a collision cannot make the full document return HTTP 500.
//            return false;
//        }

//        return isElsa == includeElsa;
//    }
//}