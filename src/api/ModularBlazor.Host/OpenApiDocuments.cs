using System.Text.RegularExpressions;
using NJsonSchema.Generation;
using NSwag.Generation.AspNetCore;
using NSwag.Generation.Processors;
using NSwag.Generation.Processors.Contexts;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
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
  /// <summary>The tenant header (Finbuckle). Without it requests run as the root tenant.</summary>
  private const string TenantHeader = "X-Tenant";

  public static object Generate(string basePath, IEnumerable<EndpointDataSource> endpointSources)
  {
    var prefix = "/" + basePath.Trim('/');
    var paths = new SortedDictionary<string, Dictionary<string, object>>(StringComparer.OrdinalIgnoreCase);
    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    foreach (var endpoint in endpointSources.SelectMany(source => source.Endpoints))
    {
      if (endpoint is not RouteEndpoint routeEndpoint)
        continue;

      var methods = endpoint.Metadata.GetMetadata<IHttpMethodMetadata>()?.HttpMethods;
      if (methods is null || methods.Count == 0)
        continue;

      // Rebuild the path from the parsed pattern: route constraints ({id:guid}) and optional markers ({id?}) are
      // not valid in OpenAPI paths, and the parameters are declared from the same segments.
      var (path, routeParameters) = ToOpenApiPath(routeEndpoint.RoutePattern);
      if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        continue;

      if (!paths.TryGetValue(path, out var operations))
      {
        operations = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        paths[path] = operations;
      }

      // Tag by the first segment after the prefix: /elsa/api/workflow-definitions/... -> "workflow-definitions".
      var rest = path[prefix.Length..].Trim('/');
      var tag = rest.Length == 0 ? "Elsa" : rest.Split('/')[0];

      foreach (var method in methods)
      {
        if (!seen.Add($"{method}:{path}"))
          continue;

        var hasBody = method is "POST" or "PUT" or "PATCH";
        var parameters = new List<object>(routeParameters.Select(name => (object)new
        {
          name,
          @in = "path",
          required = true,
          schema = new { type = "string" }
        }))
        {
          new { @ref = "#/components/parameters/Tenant" }
        };

        var operation = new Dictionary<string, object>
        {
          ["operationId"] = endpoint.DisplayName ?? $"{method} {path}",
          ["tags"] = new[] { tag },
          ["parameters"] = parameters,
          // Either scheme is enough (alternatives), as on the real API: JWT bearer or X-API-Key.
          ["security"] = new object[]
          {
            new Dictionary<string, string[]> { ["JWT"] = [] },
            new Dictionary<string, string[]> { ["ApiKey"] = [] }
          },
          ["responses"] = new Dictionary<string, object>
          {
            ["200"] = new { description = "The request completed successfully." },
            ["400"] = new { description = "The request was invalid." },
            ["401"] = new { description = "Missing or invalid JWT / API key." },
            ["403"] = new { description = "The caller lacks Permissions.Workflows.View / Manage, or the tenant is inactive." }
          }
        };

        if (hasBody)
        {
          operation["requestBody"] = new
          {
            required = false,
            content = new Dictionary<string, object>
            {
              ["application/json"] = new { schema = new { type = "object", additionalProperties = true } }
            }
          };
        }

        operations[method.ToLowerInvariant()] = operation;
      }
    }

    return new
    {
      openapi = "3.0.1",
      info = new
      {
        title = "Elsa V3 Workflows API",
        version = "v3",
        description = "The embedded Elsa workflow engine API. Authenticate with the same JWT (Bearer) or X-API-Key as the main API; "
                      + "reading needs Permissions.Workflows.View or Manage, everything else Manage."
      },
      // Relative: Scalar calls the same origin that served this document.
      servers = new[] { new { url = "/" } },
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
        },
        parameters = new Dictionary<string, object>
        {
          ["Tenant"] = new
          {
            name = TenantHeader,
            @in = "header",
            required = false,
            description = "Tenant id. A JWT only works for the tenant it was issued for; omit for the root tenant.",
            schema = new { type = "string" }
          }
        }
      },
      // Default requirement for the whole document (operations repeat it).
      security = new object[]
      {
        new Dictionary<string, string[]> { ["JWT"] = [] },
        new Dictionary<string, string[]> { ["ApiKey"] = [] }
      },
      paths
    };
  }

  private static (string Path, List<string> Parameters) ToOpenApiPath(RoutePattern pattern)
  {
    var path = new System.Text.StringBuilder();
    var parameters = new List<string>();

    foreach (var segment in pattern.PathSegments)
    {
      path.Append('/');
      foreach (var part in segment.Parts)
      {
        switch (part)
        {
          case RoutePatternLiteralPart literal:
            path.Append(literal.Content);
            break;
          case RoutePatternSeparatorPart separator:
            path.Append(separator.Content);
            break;
          case RoutePatternParameterPart parameter:
            path.Append('{').Append(parameter.Name).Append('}');
            parameters.Add(parameter.Name);
            break;
        }
      }
    }

    return (path.Length == 0 ? "/" : path.ToString(), parameters);
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
    // Use ApiExplorer's route template: Elsa FastEndpoints can expose a normalized NSwag path that drops
    // route parameters, making distinct journal operations collide in the generated document.
    var relativePath = (context as AspNetCoreOperationProcessorContext)?.ApiDescription.RelativePath;
    var path = (relativePath ?? context.OperationDescription.Path).TrimStart('/');
    var basePath = elsaBasePath.Trim('/');
    var isElsa = path.Equals(basePath, StringComparison.OrdinalIgnoreCase)
        || path.StartsWith(basePath + "/", StringComparison.OrdinalIgnoreCase);

    if (isElsa && relativePath is not null)
      context.OperationDescription.Path = "/" + path;

    if (isElsa && includeElsa
        && context.Document.Paths.TryGetValue(context.OperationDescription.Path, out var existingPath)
        && existingPath.ContainsKey(context.OperationDescription.Method))
    {
      // Elsa 3.9 has distinct FastEndpoints routes that collapse to the same NSwag path. Retain the first
      // operation for each method/path so a collision cannot make the full document return HTTP 500.
      return false;
    }

    return isElsa == includeElsa;
  }
}
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