using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi;
using Scalar.AspNetCore;
using soft.square.net.WebApi.Modularity;
using System.Reflection.Metadata;
using System.Text.RegularExpressions;

namespace soft.square.net.WebApi.OpenApi;

/// <summary>
/// OpenAPI documents for the WebApi host and its runtime modules, shown in Scalar.
/// <list type="bullet">
/// <item><c>/openapi/webapi.json</c>: the host's own endpoints (module admin, <c>/api/pool</c>, health). Module endpoints are
/// filtered out before any schema is generated, so this document never touches module types.</item>
/// <item><c>/openapi/modules/{id}.json</c>: one module's endpoints, generated on demand while the module is routed on this
/// replica (404 otherwise). Modules arrive after the DI container is built, so they cannot be registered as named documents;
/// instead they share one internal "slot" document whose filter selects the module of the current request.</item>
/// <item><c>/openapi</c>: the documents available right now. <c>/scalar</c>: Scalar, with the same list in its switcher.</item>
/// </list>
/// Behind the gateway's <c>/pools/{pool}</c> routes the gateway sends <c>X-Forwarded-Prefix</c>; document URLs and each
/// document's server URL are built from it so Scalar and "Try it" stay on the same gateway path.
/// </summary>
internal static partial class ModularOpenApi
{
  /// <summary>Document of the host's built-in endpoints.</summary>
  public const string HostDocument = "webapi";

  /// <summary>Internal slot that renders one module at a time; never served under its own name.</summary>
  private const string ModuleSlot = "modules";

  private static readonly AsyncLocal<string?> CurrentModule = new();

  public static bool IsEnabled(IConfiguration configuration, IHostEnvironment environment) =>
      environment.IsDevelopment() || configuration.GetValue<bool>("OpenApi:Enabled");

  public static IServiceCollection AddModularOpenApi(this IServiceCollection services)
  {
    services.TryAddEnumerable(ServiceDescriptor.Transient<IApiDescriptionProvider, ModuleServiceParameterFilter>());

    services.AddOpenApi(HostDocument, options =>
    {
      options.ShouldInclude = description => ModuleOf(description) is null;
      options.AddSchemaTransformer(PlainNumbers);
      options.AddDocumentTransformer(InlineFileUploads);
      options.AddDocumentTransformer((document, _, _) =>
          {

            //  AddBearerSecurity(document);
            AddOAuthSecurity(document);
            document.Info.Title = "WebApi host";
            document.Info.Description = "Built-in endpoints of the WebApi host: the runtime module admin API, the pool probe and health. " +
                                            "Each active module has its own document.";
            // MapHealthChecks endpoints are invisible to ApiExplorer; describe /health by hand.
            document.Paths ??= new OpenApiPaths();
            document.Tags ??= new HashSet<OpenApiTag>();
            document.Tags.Add(new OpenApiTag { Name = "Health" });
            document.Paths["/health"] = new OpenApiPathItem
            {
              Operations = new Dictionary<HttpMethod, OpenApiOperation>
              {
                [HttpMethod.Get] = new()
                {
                  OperationId = "Health_Get", // HealthClient.GetAsync in the generated host client
                  Summary = "Health of this replica (Healthy, Degraded or Unhealthy).",
                  Tags = new HashSet<OpenApiTagReference> { new("Health", document) },
                  Responses = new OpenApiResponses
                  {
                    ["200"] = new OpenApiResponse { Description = "Healthy or Degraded" },
                    ["503"] = new OpenApiResponse { Description = "Unhealthy" }
                  }
                }
              }
            };
            return Task.CompletedTask;
          });
    });

    services.AddOpenApi(ModuleSlot, options =>
    {
      options.AddSchemaTransformer(PlainNumbers);
      options.AddDocumentTransformer(InlineFileUploads);
      options.AddDocumentTransformer((document, _, _) =>
      {
        AddOAuthSecurity(document);
        return Task.CompletedTask;
      });
      options.ShouldInclude = description =>
              CurrentModule.Value is { } id && string.Equals(ModuleOf(description)?.ModuleId, id, StringComparison.OrdinalIgnoreCase);
    });
    return services;
  }

  public static IEndpointRouteBuilder MapModularOpenApi(this IEndpointRouteBuilder app)
  {
    // Documentation is public where it is enabled (see IsEnabled); the APIs it describes are not.
    var docs = app.MapGroup("/openapi").ExcludeFromDescription().AllowAnonymous();

    docs.MapGet("/", (HttpContext context, ModuleEndpointDataSource modules) =>
        Documents(DocsBase(context), modules).Select(d => new { d.Name, d.Title, Url = d.RoutePattern, d.IsDefault }));

    docs.MapGet($"/{HostDocument}.json", (HttpContext context, IServiceProvider services, CancellationToken ct) =>
        Render(context, services, HostDocument, ct));

    docs.MapGet("/modules/{id}.json", async (string id, HttpContext context, IServiceProvider services,
        ModuleEndpointDataSource modules, ModuleRuntime runtime, CancellationToken ct) =>
    {
      var module = ActiveModules(modules).FirstOrDefault(m => string.Equals(m.Id, id, StringComparison.OrdinalIgnoreCase));
      if (module is null)
        return Results.Problem($"Module '{id}' has no routes on this replica (not installed, not active, or not enabled in this pool).",
                statusCode: StatusCodes.Status404NotFound);

      var record = (await runtime.ListAsync(ct)).FirstOrDefault(s => s.Module.Id.Equals(module.Id, StringComparison.OrdinalIgnoreCase))?.Module;
      CurrentModule.Value = module.Id;
      try
      {
        return await Render(context, services, ModuleSlot, ct, document =>
            {
              document.Info.Title = record?.Name ?? module.Title;
              document.Info.Version = module.Version;
              document.Info.Description = record?.Description;
            });
      }
      finally { CurrentModule.Value = null; }
    });

    app.MapScalarApiReference((options, context) =>
    {
      options.WithTitle("WebApi");

      /*──────────────────────────────Ahmed_Galal─────────────────────────────*/
      options
        .AddPreferredSecuritySchemes("OAuth2")
        .AddAuthorizationCodeFlow("OAuth2", flow =>
        {
          flow.ClientId = "scalar-client";
          flow.Pkce = Pkce.Sha256;

          // Identity registers exact callback URLs per gateway route. Set Scalar's callback explicitly for this UI path.
          var forwardedHost = context.Request.Headers["X-Forwarded-Host"].ToString().Split(',')[0].Trim();
          var forwardedProto = context.Request.Headers["X-Forwarded-Proto"].ToString().Split(',')[0].Trim();
          var publicOrigin = context.RequestServices.GetRequiredService<IConfiguration>()["Scalar:PublicOrigin"]
              ?? $"{(forwardedProto.Length > 0 ? forwardedProto : context.Request.Scheme)}://{(forwardedHost.Length > 0 ? forwardedHost : context.Request.Host.Value)}";
          flow.RedirectUri = $"{publicOrigin.TrimEnd('/')}{DocsBase(context)}/scalar/";

          flow.SelectedScopes =
          [
              "openid",
                "profile",
                "email",
                "api"
          ];
        });

      /*──────────────────────────────Ahmed_Galal─────────────────────────────*/
      // Runs per request and includes only modules routed on this replica. Preserve the gateway pool prefix so
      // Scalar fetches module documents from this pool rather than from the root/core route.
      options.AddDocuments(Documents("", context.RequestServices.GetRequiredService<ModuleEndpointDataSource>()));
    }).ExcludeFromDescription().AllowAnonymous();

    app.MapGet("/", (HttpContext context) => Results.Redirect($"{DocsBase(context)}/scalar")).ExcludeFromDescription().AllowAnonymous();
    return app;
  }

  private static async Task<IResult> Render(HttpContext context, IServiceProvider services, string documentName,
      CancellationToken ct, Action<OpenApiDocument>? customize = null)
  {
    var provider = services.GetRequiredKeyedService<IOpenApiDocumentProvider>(documentName);
    var document = await provider.GetOpenApiDocumentAsync(ct);
    customize?.Invoke(document);

    // The provider has no request, so it lists the server's own addresses. Use the path the caller came through
    // (relative: same origin as the document), which keeps "Try it" on the gateway path.
    var docsBase = DocsBase(context);
    document.Servers = [new OpenApiServer { Url = docsBase.Length > 0 ? docsBase : "/" }];

    var version = services.GetRequiredService<IOptionsMonitor<OpenApiOptions>>().Get(documentName).OpenApiVersion;
    var json = await document.SerializeAsJsonAsync(version, ct);
    return Results.Text(json, "application/json; charset=utf-8");
  }

  private static IEnumerable<ScalarDocument> Documents(string docsBase, ModuleEndpointDataSource modules)
  {
    yield return new ScalarDocument(HostDocument, "WebApi host", $"{docsBase}/openapi/{HostDocument}.json", IsDefault: true);
    foreach (var module in ActiveModules(modules))
      yield return new ScalarDocument(module.Id, $"{module.Title} module", $"{docsBase}/openapi/modules/{module.Id}.json");
  }

  private sealed record ActiveModule(string Id, string Title, string Version);

  /// <summary>Modules with routes on this replica, read from the live module endpoints.</summary>
  private static IEnumerable<ActiveModule> ActiveModules(ModuleEndpointDataSource modules) =>
      modules.Endpoints
          .Select(e => (Module: e.Metadata.GetMetadata<RuntimeModuleMetadata>(), Tags: e.Metadata.GetMetadata<ITagsMetadata>()))
          .Where(e => e.Module is not null)
          .GroupBy(e => e.Module!.ModuleId, StringComparer.OrdinalIgnoreCase)
          .Select(g => new ActiveModule(g.Key, g.First().Tags?.Tags.FirstOrDefault() ?? g.Key, g.First().Module!.Version))
          .OrderBy(m => m.Id, StringComparer.OrdinalIgnoreCase);

  private static RuntimeModuleMetadata? ModuleOf(ApiDescription description) =>
      description.ActionDescriptor.EndpointMetadata.OfType<RuntimeModuleMetadata>().LastOrDefault();

  /// <summary>
  /// Path the caller reached this replica through: the gateway's <c>X-Forwarded-Prefix</c> (e.g. <c>/pools/sales</c>) or the
  /// request's PathBase. Read only here, for documentation URLs; request handling elsewhere is unaffected.
  /// </summary>
  private static string DocsBase(HttpContext context)
  {
    var prefix = context.Request.Headers["X-Forwarded-Prefix"].ToString();
    if (prefix.Length > 0 && SafePrefix().IsMatch(prefix)) return prefix.TrimEnd('/');
    return context.Request.PathBase.Value?.TrimEnd('/') ?? "";
  }

  [GeneratedRegex("^(/[A-Za-z0-9._~-]+)+/?$")]
  private static partial Regex SafePrefix();

  /// <summary>
  /// Makes schemas precise enough for client generators (NSwag, openapi-typescript):
  /// <list type="bullet">
  /// <item>The web JSON defaults (<c>JsonNumberHandling.AllowReadingFromString</c>) make ASP.NET Core describe every number
  /// as <c>"type": ["integer", "string"]</c> with a digits pattern. The API does accept quoted numbers, but clients should
  /// send and expect numbers: generators read the string alternative as "any type" (NSwag makes ids <c>object</c>).
  /// Numbers are described as plain numbers; nullability is kept.</item>
  /// <item>Enums serialized by name (<c>JsonStringEnumConverter</c>) come out as <c>"enum": [...]</c> with no type, so
  /// generators cannot tell names from numbers (NSwag then emits no string converter and the client fails to read
  /// <c>"News"</c>). They get <c>"type": "string"</c>.</item>
  /// </list>
  /// </summary>
  /// <summary>
  /// Uploads (<c>IFormFile</c> form fields) are described inline as <c>{"type": "string", "format": "binary"}</c> instead
  /// of a reference to an <c>IFormFile</c> component: NSwag only emits its <c>FileParameter</c> type for inline binary
  /// fields, so with the reference the generated client does not compile.
  /// </summary>
  private static Task InlineFileUploads(OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
  {
    var fileSchemas = new[] { "IFormFile", "IFormFileCollection" };
    var operations = document.Paths?.Values.SelectMany(p => p.Operations?.Values.AsEnumerable() ?? []) ?? [];
    foreach (var operation in operations)
    {
      foreach (var media in operation.RequestBody?.Content?.Values.AsEnumerable() ?? [])
      {
        if (media.Schema?.Properties is not { } properties) continue;
        foreach (var (name, property) in properties.ToArray().Select(p => (p.Key, p.Value)))
        {
          if (property is OpenApiSchemaReference { Reference.Id: { } id } && fileSchemas.Contains(id))
            properties[name] = id == "IFormFile"
                ? new OpenApiSchema { Type = JsonSchemaType.String, Format = "binary" }
                : new OpenApiSchema { Type = JsonSchemaType.Array, Items = new OpenApiSchema { Type = JsonSchemaType.String, Format = "binary" } };
        }
      }
    }
    foreach (var id in fileSchemas) document.Components?.Schemas?.Remove(id);
    return Task.CompletedTask;
  }

  private static Task PlainNumbers(OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken cancellationToken)
  {
    if (schema.Type is { } type && type.HasFlag(JsonSchemaType.String) &&
        (type.HasFlag(JsonSchemaType.Integer) || type.HasFlag(JsonSchemaType.Number)))
    {
      schema.Type = type & ~JsonSchemaType.String;
      schema.Pattern = null;
    }
    if (schema.Type is null && schema.Enum is { Count: > 0 } values &&
        values.All(v => v is System.Text.Json.Nodes.JsonValue value && value.GetValueKind() == System.Text.Json.JsonValueKind.String))
      schema.Type = JsonSchemaType.String;
    return Task.CompletedTask;
  }

  private static void AddOAuthSecurity(OpenApiDocument document)
  {
    document.Components ??= new OpenApiComponents();

    document.Components.SecuritySchemes ??=
        new Dictionary<string, IOpenApiSecurityScheme>();

    document.Components.SecuritySchemes["OAuth2"] =
        new OpenApiSecurityScheme
        {
          Type = SecuritySchemeType.OAuth2,

          Flows = new OpenApiOAuthFlows
          {
            AuthorizationCode = new OpenApiOAuthFlow
            {
              AuthorizationUrl =
                        new Uri("http://localhost:5090/connect/authorize"),

              TokenUrl =
                        new Uri("http://localhost:5090/connect/token"),

              Scopes = new Dictionary<string, string>
              {
                ["openid"] = "User identity",
                ["profile"] = "User profile",
                ["email"] = "User email",
                ["api"] = "Access to Modular WebApi",
                ["offline_access"] = "Refresh token"
              }
            }
          }
        };

    document.Security ??= [];

    document.Security.Add(
        new OpenApiSecurityRequirement
        {
          [new OpenApiSecuritySchemeReference("OAuth2", document)] =
                ["openid", "profile", "email", "api"]
        });
  }
  //private static void AddBearerSecurity(OpenApiDocument document)
  //{
  //  document.Components ??= new OpenApiComponents();

  //  document.Components.SecuritySchemes ??=
  //  new Dictionary<string, IOpenApiSecurityScheme>();

  //  document.Components.SecuritySchemes["Bearer"] =
  //      new OpenApiSecurityScheme
  //      {
  //        Type = SecuritySchemeType.Http,
  //        Scheme = "bearer",
  //        BearerFormat = "JWT",
  //        Description = "Enter your JWT Access Token."
  //      };

  //  document.Security ??= [];

  //  document.Security.Add(
  //      new OpenApiSecurityRequirement
  //      {
  //        [new OpenApiSecuritySchemeReference("Bearer", document)] = []
  //      });
  //}
}
