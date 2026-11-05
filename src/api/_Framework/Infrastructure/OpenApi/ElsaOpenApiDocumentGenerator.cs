using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
using System;
using System.Collections.Generic;
using System.Text;

namespace soft.square.net.ModularBlazor.Infrastructure.OpenApi;


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

